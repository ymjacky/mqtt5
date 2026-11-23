import { BaseMqttClient } from './base_mqtt_client.ts';
import type { ClientOptions } from './client_types.ts';
import { SendPacketError, UnexpectedUrlProtocol } from './error.ts';

// The port to connect to when the URL has none.
const defaultPorts: Record<string, number> = { 'mqtt:': 1883, 'mqtts:': 8883 };

/**
 * Waits for a connection that is being opened, unless `signal` aborts first: then rejects with the abort reason at once,
 * and closes the connection if it opens later. `Deno.connect()` / `Deno.connectTls()` cannot be stopped while opening.
 */
function openUnlessAborted<T extends Deno.Conn>(opening: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason);
      opening.then((conn) => conn.close(), () => {});
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    opening.then(
      (conn) => {
        signal.removeEventListener('abort', onAbort);
        resolve(conn);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * MQTT client that connects over TCP (`mqtt://`) or TLS (`mqtts://`). Deno only;
 * in the browser, use {@link WebSocketMqttClient}.
 *
 * @example
 * ```ts
 * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
 *
 * const client = new MqttClient({
 *   url: new URL('mqtt://127.0.0.1:1883'),
 *   clientId: 'clientA',
 *   protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
 * });
 * await client.connect();
 * ```
 */
export class MqttClient extends BaseMqttClient {
  /**
   * The underlying TCP or TLS connection.
   * @ignore
   */
  protected conn?: Deno.Conn;
  // Writes to and reads from `conn`. Set when it is opened.
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;

  /**
   * Creates a client. It does not connect until {@link MqttClient.connect} is called.
   * @param options client options. `url` must use `mqtt:` or `mqtts:` (default `mqtt://127.0.0.1:1883`).
   * Without a port in the URL, the client connects to 1883 (`mqtt:`) or 8883 (`mqtts:`).
   */
  constructor(options?: ClientOptions) {
    super(options);
  }

  /**
   * Opens the TCP or TLS connection and starts the receive loop.
   * @param signal when it aborts while the connection is being opened, rejects at once; the connection is closed when it opens.
   * @ignore
   */
  protected override async open(signal: AbortSignal): Promise<void> {
    const openSocket = async () => {
      // A URL without a port has the default port of its protocol.
      const port = this.url.port !== '' ? Number(this.url.port) : defaultPorts[this.url.protocol];
      if (this.url.protocol === 'mqtt:') {
        return Deno.connect({
          hostname: this.url.hostname,
          port,
        });
      } else if (this.url.protocol === 'mqtts:') {
        const conn = await Deno.connectTls({
          hostname: this.url.hostname,
          port,
          caCerts: this.caCerts,
          ...(this.privateKey && this.cert ? { cert: this.cert, key: this.privateKey } : {}),
        });
        // Deno does the TLS handshake on the first read or write. Do it here: a failure, e.g. a certificate that is not
        // trusted, is then an error of opening the connection, and connect() rejects with it.
        try {
          await conn.handshake();
        } catch (err) {
          conn.close();
          throw err;
        }
        return conn;
      } else {
        throw new UnexpectedUrlProtocol(`${this.url.protocol.slice(0, -1)}`);
      }
    };

    // Nothing of this client is changed until the connection is open: an aborted opening must not affect the next one.
    this.conn = await openUnlessAborted(openSocket(), signal);
    this.writer = this.conn.writable.getWriter();
    // The receive loop reads this connection only, and reports its close only while it is the connection of the client:
    // a loop that outlives its connection must not touch the next one.
    const reader = this.conn.readable.getReader();
    this.reader = reader;
    // Not shared with a previous connection, which may have left a partial packet.
    const frameBuffer = this.createFrameBuffer();

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            return;
          }
          frameBuffer.append(value);

          while (true) {
            let receiveBytes: Uint8Array | undefined;
            try {
              receiveBytes = frameBuffer.takePacket();
            } catch (streamError) {
              // Rejects for an error that is not a framing error.
              await this.handleFramingError(streamError);

              // We can no longer safely read further packets on this connection: it is closed below. The disconnect
              // timer started by handleMalformedPacket() would not help, as nothing reads `reader` after this loop.
              return;
            }
            if (!receiveBytes) {
              break; // wait for the next chunk
            }

            await this.handleReceivedBytes(receiveBytes);
          }
        }
      } catch (err) {
        // e.g. the connection was reset by the broker, or an error that the received bytes do not cause.
        this.log('the receive loop ended with an error', err);
      } finally {
        // However the loop ended, nothing reads this connection any more: close it, then report the close. Left open, it
        // would keep receiving, and the broker would see the client as connected until the keep alive expires.
        // cancel() rejects when the connection has failed already, e.g. it was reset: there is nothing to close then.
        await reader.cancel().catch(() => {});
        if (this.reader === reader) {
          this.detectClosed();
        }
      }
    })();
  }

  /**
   * Writes bytes to the open connection.
   * @throws {SendPacketError} if no connection has been opened.
   * @ignore
   */
  protected override async write(bytes: Uint8Array): Promise<void> {
    const writer = this.writer;
    if (!writer) {
      return Promise.reject(new SendPacketError());
    }
    this.log('writing bytes', bytes);
    await writer.ready;
    await writer.write(bytes);
  }

  /**
   * Closes the connection.
   * @ignore
   */
  protected override async close(): Promise<void> {
    await this.reader?.cancel();
  }
}

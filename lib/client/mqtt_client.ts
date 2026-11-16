import { BaseMqttClient } from './base_mqtt_client.ts';
import type { ClientOptions, WriterFactory, WriterFunction } from './client_types.ts';
import * as MqttStream from '../mqtt_stream_utils/mod.ts';
import { ConnectionClosed, ConnectionReset, UnexpectedUrlProtocol } from './error.ts';

// curry: generate write function
const writerFactory: WriterFactory = (
  conn: Deno.Conn,
  log: (msg: string, ...args: unknown[]) => void,
): WriterFunction => {
  const writer: WritableStreamDefaultWriter = conn.writable.getWriter();

  return async (bytes: Uint8Array) => {
    log('writing bytes', bytes);
    await writer.ready;
    await writer.write(bytes);
  };
};

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
  private reader?: ReadableStreamDefaultReader<Uint8Array>;

  /**
   * Creates a client. It does not connect until {@link MqttClient.connect} is called.
   * @param options client options. `url` must use `mqtt:` or `mqtts:` (default `mqtt://127.0.0.1:1883`).
   */
  constructor(options?: ClientOptions) {
    super(options);
  }

  /**
   * Opens the TCP or TLS connection and starts the receive loop.
   * @param signal when it aborts while the connection is being opened, rejects at once; the connection is closed when it opens.
   * @ignore
   */
  protected async open(signal: AbortSignal): Promise<void> {
    const openSocket = async () => {
      if (this.url.protocol === 'mqtt:') {
        return await Deno.connect({
          hostname: this.url.hostname,
          port: Number(this.url.port),
        });
      } else if (this.url.protocol === 'mqtts:') {
        const tlsOpt: Deno.ConnectTlsOptions = {
          hostname: this.url.hostname,
          port: Number(this.url.port),
          caCerts: this.caCerts,
        };
        let conn: Deno.TlsConn;
        if (this.privateKey && this.cert) {
          type TlsType = Deno.ConnectTlsOptions & Deno.TlsCertifiedKeyPem;
          const tls: TlsType = {
            hostname: this.url.hostname,
            port: Number(this.url.port),
            caCerts: this.caCerts,
            cert: this.cert,
            key: this.privateKey,
          };
          conn = await Deno.connectTls(tls);
        } else {
          conn = await Deno.connectTls(tlsOpt);
        }
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
    this.write = writerFactory(this.conn, this.log);
    // The receive loop reads this connection only, and reports its close only while it is the connection of the client:
    // a loop that outlives its connection must not touch the next one.
    const reader = this.conn.readable.getReader();
    this.reader = reader;
    // Not shared with a previous connection, which may have left a partial packet.
    const frameBuffer = new MqttStream.MqttFrameBuffer();
    const reportClosed = () => {
      if (this.reader === reader) {
        this.detectClosed();
      }
    };

    (async () => {
      while (true) {
        try {
          frameBuffer.append(await MqttStream.readChunk(reader));

          while (true) {
            let receiveBytes: Uint8Array | undefined;
            try {
              receiveBytes = frameBuffer.takePacket();
            } catch (streamError) {
              // Rethrows non-framing errors.
              await this.handleFramingError(streamError);

              // We can no longer safely read further packets on this
              // connection, so tear it down ourselves; the disconnect timer
              // started by handleMalformedPacket() won't help here because
              // nothing else awaits `reader` once we stop this loop.
              await reader.cancel();
              reportClosed();
              return; // stop the receive loop
            }
            if (!receiveBytes) {
              break; // wait for the next chunk
            }

            await this.handleReceivedBytes(receiveBytes);
          }
        } catch (e) {
          reportClosed();
          if (e instanceof ConnectionClosed) {
            break; // while
          } else if (e instanceof ConnectionReset) {
            this.log('ConnectionReset.', e.message);
            break;
          } else {
            this.log('fatal error in receive loop', e);
            break;
          }
        }
      }
    })().catch((fatalError) => {
      // Handle unexpected errors in receive loop
      this.log('Unhandled error in receive loop:', fatalError);
      this.close();
    });
  }

  /**
   * Closes the connection.
   * @ignore
   */
  protected async close(): Promise<void> {
    if (this.conn) {
      if (this.reader) {
        await this.reader.cancel();
      }
    }

    return Promise.resolve();
  }
}

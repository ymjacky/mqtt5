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
  /** The underlying TCP or TLS connection. */
  protected conn?: Deno.Conn;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private frameBuffer = new MqttStream.MqttFrameBuffer();

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
        if (this.privateKey && this.cert) {
          type TlsType = Deno.ConnectTlsOptions & Deno.TlsCertifiedKeyPem;
          const tls: TlsType = {
            hostname: this.url.hostname,
            port: Number(this.url.port),
            caCerts: this.caCerts,
            cert: this.cert,
            key: this.privateKey,
          };
          return await Deno.connectTls(tls);
        } else {
          return await Deno.connectTls(tlsOpt);
        }
      } else {
        throw new UnexpectedUrlProtocol(`${this.url.protocol.slice(0, -1)}`);
      }
    };

    // Nothing of this client is changed until the connection is open: an aborted opening must not affect the next one.
    this.conn = await openUnlessAborted(openSocket(), signal);
    this.write = writerFactory(this.conn, this.log);
    this.reader = this.conn.readable.getReader();
    // Discard any partial packet left over from a previous connection.
    this.frameBuffer = new MqttStream.MqttFrameBuffer();

    (async () => {
      while (true) {
        try {
          if (!this.reader) {
            break;
          }

          this.frameBuffer.append(await MqttStream.readChunk(this.reader));

          while (true) {
            let receiveBytes: Uint8Array | undefined;
            try {
              receiveBytes = this.frameBuffer.takePacket();
            } catch (streamError) {
              // Rethrows non-framing errors.
              await this.handleFramingError(streamError);

              // We can no longer safely read further packets on this
              // connection, so tear it down ourselves; the disconnect timer
              // started by handleMalformedPacket() won't help here because
              // nothing else awaits `this.reader` once we stop this loop.
              await this.close();
              this.detectClosed();
              return; // stop the receive loop
            }
            if (!receiveBytes) {
              break; // wait for the next chunk
            }

            await this.handleReceivedBytes(receiveBytes);
          }
        } catch (e) {
          this.detectClosed();
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

  /** Closes the connection. */
  protected async close(): Promise<void> {
    if (this.conn) {
      if (this.reader) {
        await this.reader.cancel();
      }
    }

    return Promise.resolve();
  }
}

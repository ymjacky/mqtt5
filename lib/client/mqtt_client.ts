import { MqttPackets } from '../mod.ts';
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
 * MQTT Client.
 */
export class MqttClient extends BaseMqttClient {
  protected conn?: Deno.Conn;
  private reader?: ReadableStreamBYOBReader;

  constructor(options?: ClientOptions) {
    super(options);
  }

  protected async open() {
    const openSocket = async () => {
      if (this.url.protocol === 'mqtt:') {
        return await Deno.connect({
          hostname: this.url.hostname,
          port: Number(this.url.port),
        });
      } else if (this.url.protocol === 'mqtts:') {
        return await Deno.connectTls({
          hostname: this.url.hostname,
          port: Number(this.url.port),
          caCerts: this.caCerts,
        });
      } else {
        throw new UnexpectedUrlProtocol(`${this.url.protocol.slice(0, -1)}`);
      }
    };

    this.conn = await openSocket();
    this.write = writerFactory(this.conn, this.log);
    this.reader = this.conn.readable.getReader({ mode: 'byob' });

    (async () => {
      while (true) {
        try {
          if (!this.reader) {
            break;
          }

          const receiveBytes = await MqttStream.readMqttBytes(this.reader);
          this.log('receive bytes', receiveBytes);

          const packet = MqttPackets.decode(receiveBytes, this.protocolVersion);
          this.log('receive packet', packet);
          this.packetReceived(packet);
        } catch (e) {
          this.detectClosed();
          if (e instanceof ConnectionClosed) {
            break; // while
          } else if (e instanceof ConnectionReset) {
            break;
          } else {
            this.log(e);
            throw e;
          }
        }
      }
    })();
  }

  protected async close() {
    if (this.conn) {
      if (this.reader) {
        await this.reader.cancel();
      }
    }

    return Promise.resolve();
  }
}

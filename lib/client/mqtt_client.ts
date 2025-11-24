import { Mqtt, MqttPackets } from '../mod.ts';
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

          // Wrap packet decoding to handle malformed packets
          try {
            const packet = MqttPackets.decode(receiveBytes, this.protocolVersion);
            this.log('receive packet', packet);
            this.packetReceived(packet);
          } catch (decodeError) {
            // Handle malformed packet
            const error = decodeError instanceof Error ? decodeError : new Error(String(decodeError));
            this.log(`Malformed packet received: ${error.message}`);
            this.log(`Raw bytes (first 20): ${receiveBytes.slice(0, 20)}`);

            // Send appropriate response based on protocol version and packet type
            await this.handleMalformedPacket(receiveBytes, error);

            // // Close connection (will cause reader to throw ConnectionClosed in next iteration)
            // await this.close();
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

  protected async close(): Promise<void> {
    if (this.conn) {
      if (this.reader) {
        await this.reader.cancel();
      }
    }

    return Promise.resolve();
  }

  /**
   * Handle malformed packet according to protocol version
   */
  private async handleMalformedPacket(_rawBytes: Uint8Array, error: Error): Promise<void> {
    try {
      this.log('handling malformed packet', error);
      if (this.protocolVersion === Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        // MQTT v3.1.1: Send DISCONNECT and wait for broker to close connection
        this.log('Sending DISCONNECT (v3.1.1) due to malformed packet');
        await this.doDisconnect(false);
      } else if (this.protocolVersion === Mqtt.ProtocolVersion.MQTT_V5) {
        // MQTT v5.0: Send DISCONNECT with MalformedPacket reason code
        // Note: We don't send PUBACK/PUBREC/AUTH responses for malformed packets
        // because we cannot trust the packet type or content in malformed data
        this.log('Sending DISCONNECT (v5.0) with MalformedPacket reason code');
        await this.doDisconnect(false, Mqtt.ReasonCode.MalformedPacket);
      }
    } catch (handlingError) {
      // If we can't even send error responses, just log and close
      this.log('Error while handling malformed packet:', handlingError);
    }
  }
}

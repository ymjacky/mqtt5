import { MqttPackets } from '../mod.ts';
import { BaseMqttClient } from './base_mqtt_client.ts';
import type { ClientOptions, WriterFactory, WriterFunction } from './client_types.ts';
import * as MqttStream from '../mqtt_stream_utils/mod.ts';
import { ConnectionClosed, ConnectionReset, MalformedPacketError, UnexpectedUrlProtocol } from './error.ts';

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

          let receiveBytes: Uint8Array;
          try {
            receiveBytes = await MqttStream.readMqttBytes(this.reader);
          } catch (streamError) {
            if (!(streamError instanceof MalformedPacketError)) {
              // Not a framing error caused by malformed data from the peer;
              // treat as a fatal/unexpected error (e.g. ConnectionClosed).
              throw streamError;
            }

            // The byte stream framing is desynchronized (e.g. an invalid
            // Remaining Length), so we can no longer safely read further
            // packets on this connection. Notify the peer if possible and
            // tear down the connection ourselves; the disconnect timer
            // started by handleMalformedPacket() won't help here because
            // nothing else awaits `this.reader` once we stop this loop.
            this.log(`Malformed packet received (framing error): ${streamError.message}`);
            await this.handleMalformedPacket(streamError);
            await this.close();
            this.detectClosed();
            break;
          }
          this.log('receive bytes', receiveBytes);

          // Wrap packet decoding to handle malformed packets
          try {
            const packet = MqttPackets.decode(receiveBytes, this.protocolVersion);
            this.log('receive packet', packet);
            this.packetReceived(packet);
          } catch (decodeError) {
            if (!(decodeError instanceof MqttPackets.MqttPacketsError.MqttPacketParseError)) {
              // Not caused by malformed data from the peer; treat as a fatal/unexpected error.
              throw decodeError;
            }

            // Handle malformed packet
            this.log(`Malformed packet received: ${decodeError.message}`);
            this.log(`Raw bytes (first 20): ${receiveBytes.slice(0, 20)}`);

            // Send appropriate response based on protocol version and packet type
            await this.handleMalformedPacket(decodeError);
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
}

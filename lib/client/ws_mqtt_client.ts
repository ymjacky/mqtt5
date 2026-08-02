import { MqttPackets, MqttUtils } from '../mod.ts';
import { BaseMqttClient } from './base_mqtt_client.ts';
import { ClientOptions } from './client_types.ts';
import { MalformedPacketError } from './error.ts';
import { Deferred } from './promise.ts';

/**
 * MQTT client for WebSocket and WebSocket Secure
 */
export class WebSocketMqttClient extends BaseMqttClient {
  protected conn?: WebSocket;
  private readBuffers: Array<number>;

  constructor(options?: ClientOptions) {
    if (!options?.url) {
      throw new Error('uri required');
    }
    super(options);
    this.readBuffers = [];
  }

  private adjustReadBytes(data: Uint8Array): Array<Uint8Array> | undefined {
    const results: Array<Uint8Array> = [];

    data.forEach((byte) => {
      this.readBuffers.push(byte);
    });

    do {
      if (this.readBuffers.length < 2) {
        break;
      }
      const remainingLengthBytes = [];
      let offset = 1;
      const rb = new Uint8Array([...this.readBuffers]);
      do {
        const byte = rb[offset];

        remainingLengthBytes.push(byte);
        if ((byte >> 7) == 0) {
          break;
        } else if (offset == 4) {
          // offset is 1-based (rb[0] is the fixed header byte), so offset==4
          // here means this is the 4th Remaining Length byte; the MQTT spec
          // allows at most 4 bytes for a Variable Byte Integer.
          throw new MalformedPacketError('malformed variable byte integer: remaining length exceeds 4 bytes');
        }
        offset++;
      } while (offset < 5);

      const remainingLength = MqttUtils.variableByteIntegerToNum(
        new Uint8Array([...remainingLengthBytes]),
        0,
      );

      const fixedHeaderSize = 1 + remainingLength.size;
      if (fixedHeaderSize + remainingLength.number > this.readBuffers.length) {
        break;
      }

      const receiveByte = new Uint8Array([...this.readBuffers.slice(0, remainingLength.number + fixedHeaderSize)]);
      results.push(receiveByte);
      this.readBuffers = this.readBuffers.slice(remainingLength.number + fixedHeaderSize);
    } while (this.readBuffers.length > 0);

    if (results.length === 0) {
      return undefined;
    } else {
      return results;
    }
  }

  protected open(): Promise<void> {
    const deferred = new Deferred<void>();

    this.conn = new WebSocket(this.url, 'mqtt');
    this.conn.binaryType = 'arraybuffer';

    this.write = async (bytes: Uint8Array) => {
      if (this.conn) {
        this.log('writing bytes', bytes);
        await this.conn.send(bytes);
      }
    };

    this.conn.onclose = (_e: CloseEvent) => {
      this.detectClosed();
    };

    this.conn.onmessage = (e: MessageEvent<unknown>) => {
      const temporaryReceiveBytes = new Uint8Array(e.data as ArrayBuffer);

      let array: Array<Uint8Array> | undefined;
      try {
        array = this.adjustReadBytes(temporaryReceiveBytes);
      } catch (streamError) {
        if (!(streamError instanceof MalformedPacketError)) {
          // Not a framing error caused by malformed data from the peer;
          // treat as a fatal/unexpected error.
          throw streamError;
        }

        // The byte stream framing is desynchronized (e.g. an invalid
        // Remaining Length), so we can no longer safely interpret further
        // bytes on this connection. `this.conn.onclose` will call
        // detectClosed() once the connection actually closes (either from
        // handleMalformedPacket()'s close()/DISCONNECT-then-timer, or from
        // the broker).
        this.log(`Malformed packet received (framing error): ${streamError.message}`);
        this.handleMalformedPacket(streamError);
        return;
      }

      if (typeof array === 'undefined') {
        return;
      }

      array.forEach((receiveBytes) => {
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

          // Send appropriate response based on protocol version
          this.handleMalformedPacket(decodeError);
        }
      });
    };

    this.conn.onerror = (e: Event) => {
      if (e instanceof ErrorEvent) {
        this.log('error occured.', e.message);
      }
      if (this.conn) {
        this.conn.close();
      }
    };

    this.conn.onopen = (_e: Event) => {
      deferred.resolve();
    };
    return deferred.promise;
  }

  protected async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
    }

    return Promise.resolve();
  }
}

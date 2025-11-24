import { Mqtt, MqttPackets, MqttUtils } from '../mod.ts';
import { BaseMqttClient } from './base_mqtt_client.ts';
import { ClientOptions } from './client_types.ts';
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
        } else if (offset == 5) {
          throw new Error('malformed packet');
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
      const array: Array<Uint8Array> | undefined = this.adjustReadBytes(temporaryReceiveBytes);
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
          // Handle malformed packet
          const error = decodeError instanceof Error ? decodeError : new Error(String(decodeError));
          this.log(`Malformed packet received: ${error.message}`);
          this.log(`Raw bytes (first 20): ${receiveBytes.slice(0, 20)}`);

          // Send appropriate response based on protocol version
          this.handleMalformedPacket(receiveBytes, error);
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
        this.log('Sending DISCONNECT (v5.0) with MalformedPacket reason code');
        await this.doDisconnect(false, Mqtt.ReasonCode.MalformedPacket);
      }
    } catch (handlingError) {
      // If we can't even send error responses, just log and close
      this.log('Error while handling malformed packet:', handlingError);
    }
  }
}

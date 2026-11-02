import { BaseMqttClient } from './base_mqtt_client.ts';
import { ClientOptions } from './client_types.ts';
import * as MqttStream from '../mqtt_stream_utils/mod.ts';
import { Deferred } from './promise.ts';

/**
 * MQTT client for WebSocket and WebSocket Secure
 */
export class WebSocketMqttClient extends BaseMqttClient {
  protected conn?: WebSocket;
  private frameBuffer = new MqttStream.MqttFrameBuffer();

  constructor(options?: ClientOptions) {
    if (!options?.url) {
      throw new Error('uri required');
    }
    super(options);
  }

  protected open(): Promise<void> {
    const deferred = new Deferred<void>();

    // Discard any partial packet left over from a previous connection.
    this.frameBuffer = new MqttStream.MqttFrameBuffer();
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
      this.frameBuffer.append(new Uint8Array(e.data as ArrayBuffer));

      let array: Array<Uint8Array>;
      try {
        array = this.frameBuffer.takePackets();
      } catch (streamError) {
        // Rethrows non-framing errors.
        this.handleFramingError(streamError);

        // We can no longer safely interpret further bytes on this
        // connection. `this.conn.onclose` will call detectClosed() once the
        // connection actually closes (either from handleMalformedPacket()'s
        // close()/DISCONNECT-then-timer, or from the broker).
        return;
      }

      array.forEach((receiveBytes) => {
        this.handleReceivedBytes(receiveBytes);
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

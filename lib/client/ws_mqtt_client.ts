import { BaseMqttClient } from './base_mqtt_client.ts';
import { ClientOptions } from './client_types.ts';
import * as MqttStream from '../mqtt_stream_utils/mod.ts';
import { Deferred } from './promise.ts';

/**
 * MQTT client that connects over WebSocket (`ws://`) or WebSocket Secure (`wss://`), using the `mqtt` subprotocol.
 * Works in Deno and the browser.
 *
 * For `wss://`, the broker certificate is verified against the runtime's trust store; `caCerts`, `cert` and
 * `privateKey` are ignored.
 *
 * @example
 * ```ts
 * import { Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5';
 *
 * const client = new WebSocketMqttClient({
 *   url: new URL('ws://127.0.0.1:8080'),
 *   clientId: 'clientA',
 *   protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
 * });
 * await client.connect();
 * ```
 */
export class WebSocketMqttClient extends BaseMqttClient {
  /** The underlying WebSocket. */
  protected conn?: WebSocket;
  private frameBuffer = new MqttStream.MqttFrameBuffer();

  /**
   * Creates a client. It does not connect until {@link WebSocketMqttClient.connect} is called.
   * @param options client options. `url` is required and must use `ws:` or `wss:`.
   * @throws {Error} if `url` is not specified.
   */
  constructor(options?: ClientOptions) {
    if (!options?.url) {
      throw new Error('uri required');
    }
    super(options);
  }

  /** Opens the WebSocket connection. */
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

      while (true) {
        let receiveBytes: Uint8Array | undefined;
        try {
          receiveBytes = this.frameBuffer.takePacket();
        } catch (streamError) {
          // Rethrows non-framing errors.
          this.handleFramingError(streamError);

          // We can no longer safely interpret further bytes on this
          // connection. `this.conn.onclose` will call detectClosed() once the
          // connection actually closes (either from handleMalformedPacket()'s
          // close()/DISCONNECT-then-timer, or from the broker).
          return;
        }
        if (!receiveBytes) {
          return; // wait for the next message
        }

        this.handleReceivedBytes(receiveBytes);
      }
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

  /** Closes the connection. */
  protected async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
    }

    return Promise.resolve();
  }
}

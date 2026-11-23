import { BaseMqttClient } from './base_mqtt_client.ts';
import type { ClientOptions } from './client_types.ts';
import * as MqttStream from '../mqtt_stream_utils/mod.ts';
import { Deferred } from './promise.ts';
import { ConnectionClosed } from './error.ts';

// Time to wait for the peer to complete the WebSocket closing handshake, in milliseconds.
const closingHandshakeTimeout = 1 * 1000;

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
  /**
   * The underlying WebSocket.
   * @ignore
   */
  protected conn?: WebSocket;
  private frameBuffer = new MqttStream.MqttFrameBuffer();
  // Reports that `conn` is closed. Set until it is closed.
  private connectionClosed?: () => void;
  // Gives up `conn` when the peer does not complete the closing handshake started by close().
  private closingTimer?: ReturnType<typeof setTimeout>;

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

  /**
   * Opens the WebSocket connection. It is not aborted with a signal: close() also stops a WebSocket that is still opening,
   * and the `close` event then reports it.
   * @ignore
   */
  protected open(): Promise<void> {
    const deferred = new Deferred<void>();

    // Discard any partial packet left over from a previous connection.
    this.frameBuffer = this.createFrameBuffer();
    this.conn = new WebSocket(this.url, 'mqtt');
    this.conn.binaryType = 'arraybuffer';

    this.write = async (bytes: Uint8Array) => {
      if (this.conn) {
        this.log('writing bytes', bytes);
        await this.conn.send(bytes);
      }
    };

    const conn = this.conn;
    const closed = () => {
      // Stop listening: a WebSocket given up by close() still reports events when its TCP connection ends.
      conn.onopen = null;
      conn.onmessage = null;
      conn.onerror = null;
      conn.onclose = null;
      if (this.connectionClosed === closed) {
        this.connectionClosed = undefined;
        clearTimeout(this.closingTimer);
        this.closingTimer = undefined;
      }
      this.detectClosed();
      // Closed before it opened: it could not be opened, or close() stopped it (connect timeout).
      deferred.reject(new ConnectionClosed());
    };
    this.connectionClosed = closed;

    this.conn.onclose = (_e: CloseEvent) => {
      closed();
    };

    this.conn.onmessage = (e: MessageEvent<unknown>) => {
      try {
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
      } catch (fatalError) {
        // An error thrown from an event handler is an uncaught error, which terminates the process.
        this.log('fatal error handling a received message', fatalError);
        this.close();
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

  /**
   * Closes the connection.
   *
   * `WebSocket.close()` only starts the closing handshake, and the `close` event is emitted when the peer answers it.
   * A peer that has become unreachable never does, so the connection is given up when the handshake is not completed in
   * time: the client is offline then, as after a `close` event. The WebSocket API cannot end the TCP connection
   * of such a WebSocket; the runtime keeps it until the connection ends.
   * @ignore
   */
  protected close(): Promise<void> {
    const closed = this.connectionClosed;
    if (this.conn && closed && this.closingTimer === undefined) {
      this.conn.close();
      this.closingTimer = setTimeout(() => {
        this.log('the closing handshake was not completed in time, giving up the connection');
        closed();
      }, closingHandshakeTimeout);
    }

    return Promise.resolve();
  }
}

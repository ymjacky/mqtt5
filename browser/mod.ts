/**
 * Browser entry point of `mqtt5`, an MQTT client library for Deno and the browser. It supports MQTT 5.0 and 3.1.1.
 *
 * The package has two entry points; the selector at the top of this page shows them as `default` and `browser`:
 *
 * | Import (selector)                    | Use it for | Clients                                               |
 * | ------------------------------------ | ---------- | ----------------------------------------------------- |
 * | `@ymjacky/mqtt5` (`default`)         | Deno       | `MqttClient` (TCP / TLS), `WebSocketMqttClient`       |
 * | `@ymjacky/mqtt5/browser` (`browser`) | Browser    | {@link WebSocketMqttClient} only                      |
 *
 * This is the **browser** entry point. It exports {@link WebSocketMqttClient}, which connects over WebSocket (`ws://`) or
 * WebSocket Secure (`wss://`), and the related types and constants, without `MqttClient`, which uses Deno's networking APIs.
 * It also works in Deno. The broker must have a WebSocket listener enabled.
 *
 * ## How to load it in a browser
 *
 * A browser cannot load this TypeScript package with a `jsr:` specifier. Use one of the following; the
 * {@link https://github.com/ymjacky/mqtt5#browser | readme} has the details.
 *
 * - **A bundler** (Vite, esbuild, webpack, ...): `npx jsr add @ymjacky/mqtt5`, then `import ... from '@ymjacky/mqtt5/browser'`.
 * - **A CDN** (no build step): `import ... from 'https://esm.sh/jsr/@ymjacky/mqtt5/browser'`. That follows the latest version;
 *   add `@` and a version after `mqtt5` to pin it, which is safer for production.
 * - **A prebuilt file**: download `mqtt5.mjs` from the assets of a {@link https://github.com/ymjacky/mqtt5/releases | GitHub Release}
 *   and serve it yourself.
 *
 * ## Where to start
 *
 * - {@link WebSocketMqttClient}: `connect()`, `publish()`, `subscribe()`, `unsubscribe()`, `disconnect()`, `auth()` and `on()` / `off()`
 *   are listed under {@link BaseMqttClient}. Pass the options of {@link ClientTypes.ClientOptions} to the constructor; `url` is required.
 * - Constants such as `Mqtt.QoS`, `Mqtt.ProtocolVersion` and `Mqtt.ReasonCode` are in the `Mqtt` namespace.
 * - Option and result types are in the `ClientTypes` namespace, and the errors of the client are in the `ClientErrors` namespace.
 *   Every error class of this library extends `ClientErrors.MqttClientError`, so catching it handles all of them at once.
 *
 * A `wss://` connection is verified against the browser's certificate store; a CA certificate cannot be specified.
 *
 * @example Quick start
 * ```ts
 * import { Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5/browser';
 *
 * const client = new WebSocketMqttClient({
 *   url: new URL('wss://broker.example.com:8081'),
 *   clientId: 'browserClient',
 *   protocolVersion: Mqtt.ProtocolVersion.MqttV5,
 * });
 *
 * client.on('publish', (event) => {
 *   const packet = event.detail;
 *   console.log(packet.topic, new TextDecoder().decode(packet.payload));
 * });
 *
 * await client.connect();
 * await client.subscribe('topicA', Mqtt.QoS.AtLeastOnce);
 * ```
 *
 * @example Publish a message
 * ```ts
 * import { Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5/browser';
 *
 * const client = new WebSocketMqttClient({
 *   url: new URL('wss://broker.example.com:8081'),
 *   clientId: 'browserClient',
 * });
 * await client.connect();
 *
 * // Resolves when the broker acknowledges the message (PUBACK for QoS 1).
 * await client.publish('topicA', JSON.stringify({ temperature: 23.5 }), { qos: Mqtt.QoS.AtLeastOnce }, {
 *   contentType: 'application/json',
 * });
 *
 * await client.disconnect();
 * ```
 *
 * @example Handle errors and a closed connection
 * ```ts
 * import { ClientErrors, Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5/browser';
 *
 * const client = new WebSocketMqttClient({
 *   url: new URL('wss://broker.example.com:8081'),
 *   clientId: 'browserClient',
 *   connectTimeoutMS: 5000,
 * });
 *
 * // The client does not reconnect by itself. Do it from the closed event if needed.
 * client.on('closed', () => console.log('connection closed'));
 *
 * try {
 *   await client.connect();
 *   await client.subscribe('sensors/+/temperature', Mqtt.QoS.AtLeastOnce);
 * } catch (err) {
 *   if (err instanceof ClientErrors.ConnectTimeout || err instanceof ClientErrors.ConnectionClosed) {
 *     console.error('could not connect to the broker');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @example From a CDN, without a build step
 * ```html
 * <script type="module">
 * // The latest version. To pin one, write it after the package name: .../@ymjacky/mqtt5@x.y.z/browser
 * import { Mqtt, WebSocketMqttClient } from 'https://esm.sh/jsr/@ymjacky/mqtt5/browser';
 *
 * const client = new WebSocketMqttClient({
 *   url: new URL('wss://broker.example.com:8081'),
 *   clientId: 'browserClient',
 *   protocolVersion: Mqtt.ProtocolVersion.MqttV5,
 * });
 * await client.connect();
 * </script>
 * ```
 *
 * @module
 */

export * as Mqtt from '../lib/mqtt/mod.ts';
export * as MqttPackets from '../lib/mqtt_packets/mod.ts';
export * as MqttProperties from '../lib/mqtt_properties/mod.ts';
export { ClientErrors, ClientTypes, Store, WebSocketMqttClient } from '../lib/client/mod.ts';
export type { BaseMqttClient } from '../lib/client/mod.ts';
export type { ConnectOptions, PublishOptions, PublishResult, SubscribeResults, SubscriptionOption, UnsubscribeResults } from '../lib/client/client_types.ts';

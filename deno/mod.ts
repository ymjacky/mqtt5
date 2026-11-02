/**
 * `mqtt5` is an MQTT client library for Deno and the browser. It supports MQTT 5.0 and 3.1.1.
 *
 * This entry point is for Deno and exports both clients:
 *
 * - {@link MqttClient}: connects over TCP (`mqtt://`) or TLS (`mqtts://`). Deno only.
 * - {@link WebSocketMqttClient}: connects over WebSocket (`ws://`) or WebSocket Secure (`wss://`).
 *
 * In the browser, import `WebSocketMqttClient` from `@ymjacky/mqtt5/browser` instead.
 *
 * See the {@link https://github.com/ymjacky/mqtt5#readme | readme} for connection options, TLS,
 * publishing, subscribing, events and the browser bundle.
 *
 * @example Quick start
 * ```ts
 * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
 *
 * const client = new MqttClient({
 *   url: new URL('mqtt://127.0.0.1:1883'),
 *   clientId: 'clientA',
 *   protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
 * });
 *
 * client.on('publish', (event) => {
 *   const packet = event.detail;
 *   console.log(packet.topic, new TextDecoder().decode(packet.payload));
 * });
 *
 * await client.connect();
 * await client.subscribe('topicA', Mqtt.QoS.AT_LEAST_ONCE);
 * await client.publish('topicA', 'hello', { qos: Mqtt.QoS.AT_LEAST_ONCE });
 * await client.disconnect();
 * ```
 *
 * @module
 */

export * as Mqtt from '../lib/mqtt/mod.ts';
export * as MqttPackets from '../lib/mqtt_packets/mod.ts';
export * as MqttProperties from '../lib/mqtt_properties/mod.ts';
export { ClientErrors, ClientTypes, MqttClient, Store, WebSocketMqttClient } from '../lib/client/mod.ts';
export * as Cache from '../lib/cache/mod.ts';

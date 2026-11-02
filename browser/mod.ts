/**
 * Browser entry point of `mqtt5`, an MQTT client library for Deno and the browser. It supports MQTT 5.0 and 3.1.1.
 *
 * It exports {@link WebSocketMqttClient}, which connects over WebSocket (`ws://`) or WebSocket Secure (`wss://`),
 * and the related types, without the Deno-only `MqttClient`. It also works in Deno.
 *
 * Browsers cannot load this TypeScript package with a `jsr:` specifier; see the
 * {@link https://github.com/ymjacky/mqtt5#browser | readme} for using it with a bundler, from a CDN or as a prebuilt file.
 *
 * @example Quick start
 * ```ts
 * import { Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5/browser';
 *
 * const client = new WebSocketMqttClient({
 *   url: new URL('wss://broker.example.com:8081'),
 *   clientId: 'browserClient',
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
 * ```
 *
 * @module
 */

export * as Mqtt from '../lib/mqtt/mod.ts';
export * as MqttPackets from '../lib/mqtt_packets/mod.ts';
export * as MqttProperties from '../lib/mqtt_properties/mod.ts';
export { ClientErrors, ClientTypes, Store, WebSocketMqttClient } from '../lib/client/mod.ts';
export * as Cache from '../lib/cache/mod.ts';
export type { BaseMqttClient } from '../lib/client/mod.ts';

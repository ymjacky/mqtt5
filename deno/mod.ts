/**
 * ``mqtt5`` is a client library for the MQTT protocol, written in Typescript for deno and the browser.
 * ``mqtt5`` supports Mqtt protocol versions 5.0 and 3.1.1.
 *
 * ## Connect
 *
 * @example Connect with protocol version 5.0
 *
 * ```ts
 * import { Mqtt, MqttClient } from 'jsr:@ymjacky/mqtt5';
 *
 * const logger = (msg: string, ...args: unknown[]) => {
 *  console.log(msg, ...args);
 * };
 * const client = new MqttClient({
 *   url: new URL('mqtt://127.0.0.1:1883'),
 *   clientId: 'clientA',
 *   username: 'userA',
 *   password: 'passwordA',
 *   logger: logger,
 *   clean: true,
 *   protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
 *   keepAlive: 30,
 * });
 * client.connect();
 * ```
 *
 * @example Connect with protocol version 3.1.1
 * ```ts
 * import { Mqtt, MqttClient } from 'jsr:@ymjacky/mqtt5';
 *
 * const client = new MqttClient({
 *   url: new URL('mqtt://127.0.0.1:1883'),
 *   clientId: 'clientA',
 *   username: 'userA',
 *   password: 'passwordA',
 *   logger: logger,
 *   clean: true,
 *   protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
 *   keepAlive: 30,
 * });
 * client.connect();
 * ```
 *
 * @example Connection with some parameters omitted.
 * (Parameter Definitions: {@link ClientTypes.ClientOptions })
 *
 * ```ts
 * import { Mqtt, MqttClient } from 'jsr:@ymjacky/mqtt5';
 *
 * // Connect to localhost:1883 with default setting (MQTT V5.0)
 * const client = new MqttClient({});
 * client.connect();
 * ```
 *
 * @example MQTT over TLS
 * ```ts
 * import { Mqtt, MqttClient } from 'jsr:@ymjacky/mqtt5';
 *
 * const client = new MqttClient({
 *   url: new URL('mqtts://127.0.0.1:8883'),
 *   clientId: 'clientA',
 * });
 * ```
 *
 * @example MQTT over TLS useing CA cert.
 * ```ts
 * import { Mqtt, MqttClient } from 'jsr:@ymjacky/mqtt5';
 *
 * const client = new MqttClient({
 *   url: new URL('mqtts://127.0.0.1:8883'),
 *   clientId: 'clientA',
 *   caCerts: [Deno.readTextFileSync('test/deno/test_certs/ca.crt.pem')],
 * });
 * ```
 *
 * @example MQTT over WebSocket
 * ```ts
 * import { Mqtt, WebSocketMqttClient } from 'jsr:@ymjacky/mqtt5';
 *
 * const client = new WebSocketMqttClient({
 *   url: new URL('ws://127.0.0.1:8081'),
 *   clientId: 'clientA',
 *   protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
 * });
 * await client.connect();
 * ```
 *
 * @example MQTT over WebSocket Sercure
 * ```ts
 * import { Mqtt, WebSocketMqttClient } from 'jsr:@ymjacky/mqtt5';
 *
 * const client = new WebSocketMqttClient({
 *   url: new URL('wss://127.0.0.1:8081'),
 *   clientId: 'clientA',
 *   protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
 * });
 * await client.connect();
 * ```
 *
 * @example Connect with MQTT V5.0 Propertires
 * ```ts
 * import { MqttClient, MqttProperties } from 'jsr:@ymjacky/mqtt5';
 *
 * const client = new MqttClient({});
 *
 * const properties: MqttProperties.ConnectProperties = {
 *   sessionExpiryInterval: 300,
 *   receiveMaximum: 10,
 *   maximumPacketSize: 128,
 *   topicAliasMaximum: 20,
 *   requestResponseInformation: false,
 *   requestProblemInformation: false,
 *   userProperties: [
 *     { key: 'userProp1', val: 'userData1' },
 *     { key: 'userProp2', val: 'userData2' },
 *     { key: 'userProp2', val: 'userData3' },
 *   ],
 * };
 * client.connect({ properties });
 * ```
 *
 * ## PUBLISH
 * @example publish example
 *
 * ```ts
 * import { Mqtt, MqttClient, MqttProperties } from 'jsr:@ymjacky/mqtt5';
 *
 * const main = async () => {
 *   const client = new MqttClient({});
 *   await client.connect();
 *
 *   await client.publish('topicA', 'payload1', { qos: Mqtt.QoS.AT_MOST_ONCE }); // qos 0
 *   await client.publish('topicA', 'payload2', { qos: Mqtt.QoS.AT_LEAST_ONCE }); // qos 1
 *   await client.publish('topicA', 'payload3', { qos: Mqtt.QoS.EXACTRY_ONCE }); // qos 2
 *
 *   const pubProperties: MqttProperties.UserPublishProperties = {
 *     payloadFormatIndicator: 1,
 *     messageExpiryInterval: 60,
 *     responseTopic: 'responseTopicA',
 *     correlationData: new TextEncoder().encode('correlationDataA'),
 *     userProperties: [
 *       { key: 'userProp1', val: 'userData1' },
 *       { key: 'userProp2', val: 'userData2' },
 *       { key: 'userProp2', val: 'userData3' },
 *     ],
 *     subscriptionIdentifier: 3,
 *     contentType: 'application/json',
 *   };
 *   await client.publish('topicA', 'payload4', { qos: Mqtt.QoS.AT_MOST_ONCE }, pubProperties);
 * };
 *
 * main();
 * ```
 *
 * @example publish result
 * ```ts
 * import { Mqtt, MqttClient } from 'jsr:@ymjacky/mqtt5';
 *
 * const main = async () => {
 *   const client = new MqttClient({});
 *   await client.connect();
 *
 *   client.publish('topicA', 'payload2', { qos: Mqtt.QoS.AT_LEAST_ONCE })
 *     .then((value) => {
 *       console.log(value.result == Mqtt.ReasonCode.Success); // true
 *     });
 * };
 *
 * main();
 * ```
 *
 * ## SUBSCRIBE
 * @example subscribe
 * ```ts
 * import { Mqtt, MqttClient, MqttProperties } from 'jsr:@ymjacky/mqtt5';
 *
 * const main = async () => {
 *   const client = new MqttClient({});
 *   await client.connect();
 *
 *   await client.subscribe('topicA', Mqtt.QoS.AT_LEAST_ONCE);
 *   await client.subscribe(['topicB', 'topicC', 'topicD'], Mqtt.QoS.AT_LEAST_ONCE);
 *
 *   const subPproperties: MqttProperties.SubscribeProperties = {
 *     userProperties: [
 *       { key: 'userProp1', val: 'userData1' },
 *       { key: 'userProp2', val: 'userData2' },
 *       { key: 'userProp2', val: 'userData3' },
 *     ],
 *     subscriptionIdentifier: 1,
 *   };
 *   await client.subscribe('topicE', Mqtt.QoS.AT_LEAST_ONCE, subPproperties);
 *
 *   client.subscribe('topicF', Mqtt.QoS.AT_LEAST_ONCE)
 *     .then((value) => {
 *       console.log(value.reasons[0] == Mqtt.ReasonCode.GrantedQoS1); // true
 *     });
 *
 *   // use wildcard
 *   await client.subscribe('topic/#', Mqtt.QoS.AT_LEAST_ONCE);
 *
 *   // shared subscriptions
 *   await client.subscribe('$share/sg1/topicZ', Mqtt.QoS.AT_LEAST_ONCE);
 * };
 *
 * main();
 * ```
 *
 * ## DISCONNECT
 * @example disconnect
 * ```ts
 * import { MqttClient } from 'jsr:@ymjacky/mqtt5';
 *
 * const logger = (msg: string, ...args: unknown[]) => {
 *   console.log('[client]', msg, ...args);
 * };
 *
 * const main = async () => {
 *   const client = new MqttClient({ logger: logger });
 *   await client.connect();
 *
 *   client.on('closed', () => {
 *     // connect again
 *     client.connect();
 *   });
 *   await client.disconnect();
 * };
 *
 * main();
 * ```
 *
 * @example force disconnect
 * ```ts
 * import { MqttClient } from 'jsr:@ymjacky/mqtt5';
 *
 * const logger = (msg: string, ...args: unknown[]) => {
 *   console.log('[client]', msg, ...args);
 * };
 *
 * const main = async () => {
 *   const client = new MqttClient({ logger: logger });
 *   await client.connect();
 *
 *   client.on('closed', () => {
 *     // connect again
 *     client.connect();
 *   });
 *   await client.disconnect(true); // force disconnect
 * };
 *
 * main();
 * ```
 *
 * @example disconnect with MQTT V5.0 Properties
 * ```ts
 * import { MqttClient, MqttProperties } from 'jsr:@ymjacky/mqtt5';
 *
 * const logger = (msg: string, ...args: unknown[]) => {
 *   console.log('[client]', msg, ...args);
 * };
 *
 * const main = async () => {
 *   const client = new MqttClient({ logger: logger });
 *   await client.connect();
 *
 *   const disconnectProperties: MqttProperties.DisconnectProperties = {
 *     reasonString: 'trouble',
 *     sessionExpiryInterval: 300,
 *   };
 *   await client.disconnect(false, disconnectProperties);
 * };
 *
 * main();
 * ```
 * @module
 */

export * as Mqtt from '../lib/mqtt/mod.ts';
export * as MqttPackets from '../lib/mqtt_packets/mod.ts';
export * as MqttProperties from '../lib/mqtt_properties/mod.ts';
export * from '../lib/client/mod.ts';
export * as Cache from '../lib/cache/mod.ts';

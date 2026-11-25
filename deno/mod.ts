/**
 * `mqtt5` is an MQTT client library for Deno and the browser. It supports MQTT 5.0 and 3.1.1.
 *
 * This is the entry point for **Deno**. The package has two entry points; the selector at the top of this page shows them as
 * `default` and `browser`:
 *
 * | Import (selector)                    | Use it for | Clients                                                     |
 * | ------------------------------------ | ---------- | ----------------------------------------------------------- |
 * | `@ymjacky/mqtt5` (`default`)         | Deno       | {@link MqttClient} (TCP / TLS), {@link WebSocketMqttClient} |
 * | `@ymjacky/mqtt5/browser` (`browser`) | Browser    | {@link WebSocketMqttClient} only                            |
 *
 * ## Where to start
 *
 * - Create a client: {@link MqttClient} connects over TCP (`mqtt://`) or TLS (`mqtts://`), and {@link WebSocketMqttClient} over
 *   WebSocket (`ws://`, `wss://`). Pass the options of {@link ClientTypes.ClientOptions} to the constructor.
 * - Use it: `connect()`, `publish()`, `subscribe()`, `unsubscribe()`, `disconnect()`, `auth()` and `on()` / `off()` are the same on both
 *   clients. They are listed under {@link BaseMqttClient}.
 * - Constants such as `Mqtt.QoS`, `Mqtt.ProtocolVersion` and `Mqtt.ReasonCode` are in the `Mqtt` namespace.
 * - Option and result types, such as `ClientTypes.ConnectOptions` and `ClientTypes.PublishOptions`, are in the `ClientTypes` namespace.
 * - Errors thrown by the client are in the `ClientErrors` namespace; check them with `instanceof`.
 * - MQTT 5.0 properties are described by the types in the `MqttProperties` namespace.
 * - To keep QoS 1 / QoS 2 messages in flight across restarts, use {@link KvOutgoingStore} (Deno KV, unstable).
 *
 * Connection options, TLS, error handling and browser usage are explained in the
 * {@link https://github.com/ymjacky/mqtt5#readme | readme}. Runnable programs are in the
 * {@link https://github.com/ymjacky/mqtt5/tree/main/examples/deno | examples} directory of the repository.
 *
 * @example Quick start
 * ```ts
 * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
 *
 * const client = new MqttClient({
 *   url: new URL('mqtt://127.0.0.1:1883'),
 *   clientId: 'clientA',
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
 * await client.publish('topicA', 'hello', { qos: Mqtt.QoS.AtLeastOnce });
 * await client.disconnect();
 * ```
 *
 * @example Publish with QoS, retain and properties
 * ```ts
 * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
 *
 * const client = new MqttClient({ clientId: 'publisherA' });
 * await client.connect();
 *
 * // QoS 0: resolves right after sending. The payload is a string or a Uint8Array.
 * await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AtMostOnce });
 *
 * // QoS 1: resolves when the broker acknowledges (PUBACK). `retain` asks the broker to keep the message.
 * await client.publish('topicA', new Uint8Array([1, 2, 3]), { qos: Mqtt.QoS.AtLeastOnce, retain: true });
 *
 * // QoS 2, with MQTT 5.0 properties as the fourth argument
 * const result = await client.publish('topicA', '{"temperature":23.5}', { qos: Mqtt.QoS.ExactlyOnce }, {
 *   contentType: 'application/json',
 *   messageExpiryInterval: 60,
 *   userProperties: [{ key: 'room', val: '1' }],
 * });
 * console.log(result.result === Mqtt.ReasonCode.Success);
 *
 * await client.disconnect();
 * ```
 *
 * @example Subscribe: wildcards, shared subscription and options
 * ```ts
 * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
 *
 * const client = new MqttClient({ clientId: 'subscriberA' });
 *
 * // Received messages are delivered as `publish` events. Register the listener before connect().
 * client.on('publish', (event) => {
 *   const packet = event.detail;
 *   console.log(packet.topic, new TextDecoder().decode(packet.payload));
 * });
 *
 * await client.connect();
 *
 * // Several topic filters at once; `+` matches one level, `#` matches the rest.
 * await client.subscribe(['topicB', 'sensors/+/temperature', 'logs/#'], Mqtt.QoS.AtLeastOnce);
 *
 * // Shared subscription: the messages are distributed among the clients of the group.
 * await client.subscribe('$share/group1/topicC', Mqtt.QoS.AtLeastOnce);
 *
 * // MQTT 5.0 subscription options. `reasons` has one entry per topic filter (0x80 or more is a failure).
 * const { reasons } = await client.subscribe({
 *   topicFilter: 'topicD',
 *   qos: Mqtt.QoS.AtLeastOnce,
 *   noLocal: true,
 *   retainAsPublished: true,
 *   retainHandling: Mqtt.RetainHandling.DoNotSend,
 * });
 * console.log(reasons);
 *
 * await client.unsubscribe(['topicB', 'logs/#']);
 * ```
 *
 * @example MQTT 3.1.1 with a user name and password
 * ```ts
 * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
 *
 * const client = new MqttClient({
 *   url: new URL('mqtt://127.0.0.1:1883'),
 *   clientId: 'clientA',
 *   username: 'user',
 *   password: 'pass',
 *   protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1,
 * });
 * await client.connect();
 * ```
 *
 * @example TLS (`mqtts://`) and client certificates
 * ```ts
 * import { MqttClient } from '@ymjacky/mqtt5';
 *
 * // A broker certificate signed by a publicly trusted CA: `caCerts` is not needed.
 * const client = new MqttClient({ url: new URL('mqtts://broker.example.com:8883'), clientId: 'clientA' });
 *
 * // A broker certificate signed by your own CA: trust it with `caCerts` (PEM).
 * const clientWithCa = new MqttClient({
 *   url: new URL('mqtts://127.0.0.1:8883'),
 *   clientId: 'clientB',
 *   caCerts: [Deno.readTextFileSync('ca.crt.pem')],
 * });
 *
 * // TLS client authentication
 * const clientWithCert = new MqttClient({
 *   url: new URL('mqtts://127.0.0.1:8883'),
 *   clientId: 'clientC',
 *   caCerts: [Deno.readTextFileSync('ca.crt.pem')],
 *   cert: Deno.readTextFileSync('client.crt.pem'),
 *   privateKey: Deno.readTextFileSync('client.key.pem'),
 * });
 * ```
 *
 * @example WebSocket (`ws://`, `wss://`)
 * ```ts
 * import { Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5';
 *
 * // `url` is required. For wss://, `caCerts` cannot be used: start Deno with `--cert ca.crt.pem` to trust your own CA.
 * const client = new WebSocketMqttClient({
 *   url: new URL('wss://127.0.0.1:8081'),
 *   clientId: 'clientA',
 *   protocolVersion: Mqtt.ProtocolVersion.MqttV5,
 * });
 * await client.connect();
 * ```
 *
 * @example Will message and CONNECT properties
 * ```ts
 * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
 *
 * const client = new MqttClient({ clientId: 'clientA' });
 *
 * // The broker publishes the will message when the client disappears without sending DISCONNECT.
 * const connack = await client.connect({
 *   properties: {
 *     sessionExpiryInterval: 300,
 *     receiveMaximum: 10,
 *   },
 *   will: {
 *     topic: 'clients/clientA/status',
 *     payload: new TextEncoder().encode('offline'),
 *     qos: Mqtt.QoS.AtLeastOnce,
 *     retain: true,
 *   },
 * });
 * console.log(connack.sessionPresent);
 * ```
 *
 * @example Error handling
 * ```ts
 * import { ClientErrors, Mqtt, MqttClient } from '@ymjacky/mqtt5';
 *
 * const client = new MqttClient({ clientId: 'clientA', connectTimeoutMS: 5000 });
 *
 * try {
 *   const connack = await client.connect();
 *   // When the broker refuses the connection, connect() still resolves, with the CONNACK.
 *   if (connack.reasonCode !== Mqtt.ReasonCode.Success) {
 *     console.error(`the broker refused the connection: ${connack.reasonCode}`);
 *   }
 *
 *   const result = await client.publish('sensors/room1/temperature', '23.5', { qos: Mqtt.QoS.AtLeastOnce });
 *   // A reason code of 0x80 (128) or more is a failure.
 *   if (result.result >= 0x80) {
 *     console.error(`the broker refused the message: ${result.result}`);
 *   }
 * } catch (err) {
 *   // A call rejects when the client cannot carry it out.
 *   if (err instanceof ClientErrors.ConnectTimeout) {
 *     console.error('no CONNACK within connectTimeoutMS');
 *   } else if (err instanceof Deno.errors.ConnectionRefused) {
 *     console.error('the broker is not running');
 *   } else if (err instanceof ClientErrors.InvalidTopicNameError) {
 *     console.error(err.message);
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @example Reconnect after the connection is closed
 * ```ts
 * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
 *
 * // The client does not reconnect by itself. A fixed client ID and `clean: false` keep the session,
 * // so QoS 1 / QoS 2 messages in flight are resent after reconnecting.
 * const client = new MqttClient({ clientId: 'reconnectClient', clean: false });
 *
 * client.on('closed', async () => {
 *   await new Promise((resolve) => setTimeout(resolve, 5000));
 *   await client.connect({ properties: { sessionExpiryInterval: 3600 } });
 *   await client.subscribe('topicA', Mqtt.QoS.AtLeastOnce);
 * });
 *
 * await client.connect({ properties: { sessionExpiryInterval: 3600 } });
 * await client.subscribe('topicA', Mqtt.QoS.AtLeastOnce);
 * ```
 *
 * @example Keep messages in flight across restarts (Deno KV)
 * ```ts
 * import { KvOutgoingStore, Mqtt, MqttClient } from '@ymjacky/mqtt5';
 *
 * // Run with `deno run --unstable-kv`. Deno KV is an unstable API of Deno.
 * using kv = await Deno.openKv();
 *
 * await using client = new MqttClient({
 *   clientId: 'clientA', // required with the store
 *   clean: false,
 *   outgoingStore: new KvOutgoingStore(kv),
 * });
 *
 * // The messages a previous process left are resent after connect() resolves, before the message of this publish().
 * await client.connect({ properties: { sessionExpiryInterval: 3600 } });
 * await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AtLeastOnce });
 *
 * // At the end of the module, client.disconnect() is called, then kv.close(): what is declared later is disposed of
 * // first, so the database is closed after the client has disconnected.
 * ```
 *
 * @module
 */

export * as Mqtt from '../lib/mqtt/mod.ts';
export * as MqttPackets from '../lib/mqtt_packets/mod.ts';
export * as MqttProperties from '../lib/mqtt_properties/mod.ts';
export { ClientErrors, ClientTypes, MqttClient, Store, WebSocketMqttClient } from '../lib/client/mod.ts';
export * as Cache from '../lib/cache/mod.ts';
export { KvOutgoingStore } from '../lib/mqtt_store/kv_store.ts';
export type { KvOutgoingStoreOptions } from '../lib/mqtt_store/kv_store.ts';
export type { BaseMqttClient } from '../lib/client/mod.ts';
export type { ConnectOptions, PublishOptions, PublishResult, SubscribeResults, SubscriptionOption, UnsubscribeResults } from '../lib/client/client_types.ts';

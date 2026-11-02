# mqtt5

[![jsr](https://jsr.io/badges/@ymjacky/mqtt5)](https://jsr.io/@ymjacky/mqtt5)

`mqtt5` is an MQTT client library written in TypeScript for Deno and the browser. It supports MQTT 5.0 and 3.1.1.

- **Deno**: connect over TCP (`mqtt://`), TLS (`mqtts://`), WebSocket (`ws://`) or WebSocket Secure (`wss://`).
- **Browser**: connect over WebSocket (`ws://`) or WebSocket Secure (`wss://`).

API reference: [jsr.io/@ymjacky/mqtt5/doc](https://jsr.io/@ymjacky/mqtt5/doc)

## Requirements

- Deno 2.3.1 or later
- For the browser: a browser that supports ES modules and WebSocket

## Installation

```sh
deno add jsr:@ymjacky/mqtt5
```

Then import from `@ymjacky/mqtt5`. You can also import without installing by using the `jsr:` specifier, e.g.
`import { MqttClient } from 'jsr:@ymjacky/mqtt5';`.

### Entry points

| Import                   | Exports                                                                   | Runtime       |
| ------------------------ | ------------------------------------------------------------------------- | ------------- |
| `@ymjacky/mqtt5`         | `MqttClient`, `WebSocketMqttClient`, `Mqtt`, `MqttProperties`, and others | Deno          |
| `@ymjacky/mqtt5/browser` | `WebSocketMqttClient`, `Mqtt`, `MqttProperties`, and others               | Browser, Deno |

`MqttClient` (TCP/TLS) uses Deno's networking APIs and is available on Deno only. In the browser, use `WebSocketMqttClient`.

## Quick start

```ts
import { Mqtt, MqttClient } from '@ymjacky/mqtt5';

const client = new MqttClient({
  url: new URL('mqtt://127.0.0.1:1883'),
  clientId: 'clientA',
  protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
});

client.on('publish', (event) => {
  const packet = event.detail;
  console.log(packet.topic, new TextDecoder().decode(packet.payload));
});

await client.connect();
await client.subscribe('topicA', Mqtt.QoS.AT_LEAST_ONCE);
await client.publish('topicA', 'hello', { qos: Mqtt.QoS.AT_LEAST_ONCE });

await client.disconnect();
```

## Connecting

### Client options

All options are optional.

| Option                          | Default                        | Description                                                                                       |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `url`                           | `mqtt://127.0.0.1:1883`        | Broker URL. `MqttClient`: `mqtt:` or `mqtts:`. `WebSocketMqttClient`: `ws:` or `wss:` (required). |
| `clientId`                      | `''`                           | Client identifier. With an empty ID, an MQTT 5.0 broker assigns one.                              |
| `username` / `password`         | -                              | Credentials sent in CONNECT.                                                                      |
| `protocolVersion`               | `Mqtt.ProtocolVersion.MQTT_V5` | `MQTT_V5` or `MQTT_V3_1_1`.                                                                       |
| `clean`                         | `true`                         | Clean Start (5.0) / Clean Session (3.1.1).                                                        |
| `keepAlive`                     | `10`                           | Keep alive interval in **seconds**.                                                               |
| `connectTimeoutMS`              | `10000`                        | Time to wait for CONNACK, in milliseconds.                                                        |
| `disconnectTimeoutMS`           | `1000`                         | Time to wait for the connection to close after DISCONNECT, in milliseconds.                       |
| `pingrespTimeoutMS`             | `2000`                         | Time to wait for PINGRESP, in milliseconds.                                                       |
| `caCerts`                       | -                              | CA certificates (PEM) for `mqtts:` (`MqttClient` only).                                           |
| `cert` / `privateKey`           | -                              | Client certificate and private key (PEM) for TLS client authentication (`MqttClient` only).       |
| `topicAliasMaximumAboutSend`    | -                              | MQTT 5.0: topic alias maximum for outgoing PUBLISH packets. See [Topic aliases](#topic-aliases).  |
| `topicAliasMaximumAboutReceive` | -                              | MQTT 5.0: topic alias maximum sent to the broker in CONNECT. See [Topic aliases](#topic-aliases). |
| `logger`                        | -                              | `(msg: string, ...args: unknown[]) => void`, called with debug logs.                              |

### MQTT 3.1.1

```ts
import { Mqtt, MqttClient } from '@ymjacky/mqtt5';

const client = new MqttClient({
  url: new URL('mqtt://127.0.0.1:1883'),
  clientId: 'clientA',
  username: 'user',
  password: 'pass',
  protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
});
await client.connect();
```

### TLS (`mqtts://`)

```ts
import { MqttClient } from '@ymjacky/mqtt5';

// A broker certificate trusted by the system
const client = new MqttClient({ url: new URL('mqtts://broker.example.com:8883'), clientId: 'clientA' });

// A broker certificate signed by your own CA
const clientWithCa = new MqttClient({
  url: new URL('mqtts://127.0.0.1:8883'),
  clientId: 'clientB',
  caCerts: [Deno.readTextFileSync('ca.crt.pem')],
});

// TLS client authentication
const clientWithCert = new MqttClient({
  url: new URL('mqtts://127.0.0.1:8883'),
  clientId: 'clientC',
  caCerts: [Deno.readTextFileSync('ca.crt.pem')],
  cert: Deno.readTextFileSync('client.crt.pem'),
  privateKey: Deno.readTextFileSync('client.key.pem'),
});
```

### WebSocket (`ws://`, `wss://`)

`WebSocketMqttClient` uses the `mqtt` WebSocket subprotocol and requires `url`.

```ts
import { Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5';

const client = new WebSocketMqttClient({
  url: new URL('wss://127.0.0.1:8081'),
  clientId: 'clientA',
  protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
});
await client.connect();
```

### CONNECT options and properties

```ts
import { Mqtt, MqttClient } from '@ymjacky/mqtt5';

const client = new MqttClient({ clientId: 'clientA' });

const connack = await client.connect({
  properties: {
    sessionExpiryInterval: 300,
    receiveMaximum: 10,
    userProperties: [{ key: 'userProp1', val: 'userData1' }],
  },
  will: {
    topic: 'clients/clientA/status',
    payload: new TextEncoder().encode('offline'),
    qos: Mqtt.QoS.AT_LEAST_ONCE,
    retain: true,
  },
});
console.log(connack.sessionPresent);
```

## Publishing

`publish()` resolves when the flow for the QoS level completes: immediately after sending for QoS 0, on PUBACK for QoS 1, and on PUBCOMP for QoS 2.

```ts
import { Mqtt, MqttClient } from '@ymjacky/mqtt5';

const client = new MqttClient({ clientId: 'clientA' });
await client.connect();

await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_MOST_ONCE });
await client.publish('topicA', new Uint8Array([1, 2, 3]), { qos: Mqtt.QoS.AT_LEAST_ONCE, retain: true });

const result = await client.publish('topicA', 'payload', { qos: Mqtt.QoS.EXACTRY_ONCE }, {
  contentType: 'application/json',
  messageExpiryInterval: 60,
  userProperties: [{ key: 'userProp1', val: 'userData1' }],
});
console.log(result.result === Mqtt.ReasonCode.Success);
```

## Subscribing

Received messages are delivered as `publish` events.

```ts
import { Mqtt, MqttClient } from '@ymjacky/mqtt5';

const client = new MqttClient({ clientId: 'clientA' });

client.on('publish', (event) => {
  const packet = event.detail;
  console.log(packet.topic, new TextDecoder().decode(packet.payload));
});

await client.connect();

await client.subscribe('topicA', Mqtt.QoS.AT_LEAST_ONCE);
await client.subscribe(['topicB', 'sensors/+/temperature', 'logs/#'], Mqtt.QoS.AT_LEAST_ONCE);

// Shared subscription
await client.subscribe('$share/group1/topicC', Mqtt.QoS.AT_LEAST_ONCE);

// MQTT 5.0 subscription options
const result = await client.subscribe({
  topicFilter: 'topicD',
  qos: Mqtt.QoS.AT_LEAST_ONCE,
  noLocal: true,
  retainAsPublished: true,
  retainHandling: Mqtt.RetainHandling.DoNotSend,
});
console.log(result.reasons);

await client.unsubscribe(['topicA', 'topicB']);
```

## Events

Register listeners with `client.on(type, listener)` and remove them with `client.off(type, listener)`. `event.detail` holds the packet.

| Event        | `event.detail`     | When                                                      |
| ------------ | ------------------ | --------------------------------------------------------- |
| `publish`    | `PublishPacket`    | A message is received.                                    |
| `connack`    | `ConnackPacket`    | CONNACK is received.                                      |
| `disconnect` | `DisconnectPacket` | The broker sends DISCONNECT (MQTT 5.0).                   |
| `auth`       | `AuthPacket`       | The broker sends AUTH (MQTT 5.0 enhanced authentication). |
| `closed`     | -                  | The connection is closed, for any reason.                 |

## Disconnecting and reconnecting

```ts
import { MqttClient } from '@ymjacky/mqtt5';

const client = new MqttClient({ clientId: 'clientA' });
await client.connect();

// The client does not reconnect automatically. Reconnect from the closed event if needed.
client.on('closed', () => {
  console.log('connection closed');
});

await client.disconnect(); // send DISCONNECT, then close
// await client.disconnect(true); // close without sending DISCONNECT (the broker publishes the will message)
// await client.disconnect(false, { reasonString: 'bye', sessionExpiryInterval: 300 }); // MQTT 5.0 properties
```

## Browser

Import `WebSocketMqttClient` from the `@ymjacky/mqtt5/browser` entry point.

The following command bundles the browser entry point into `browser/mqtt5.mjs`:

```sh
deno task build_ems
```

```html
<script type="module">
import { Mqtt, WebSocketMqttClient } from './mqtt5.mjs';

const client = new WebSocketMqttClient({
  url: new URL('wss://localhost:8081'),
  clientId: 'browserClient',
  protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
});
await client.connect();
</script>
```

## Features

- MQTT 3.1.1 and MQTT 5.0
- QoS 0, 1 and 2, including resending in-flight messages after reconnecting with an existing session
- MQTT 5.0 properties, reason codes and enhanced authentication (AUTH packet, `client.auth()`)
- Will messages
- Shared subscriptions: subscribe to a topic filter starting with `$share/{ShareName}/`
- Subscription options: No Local, Retain As Published, Retain Handling

### Topic aliases

MQTT 5.0 only.

- `topicAliasMaximumAboutSend`: when set, topic aliases are assigned to outgoing PUBLISH packets automatically, up to the smaller of this value and the broker's
  Topic Alias Maximum.
- `topicAliasMaximumAboutReceive`: when set, it is sent to the broker as the Topic Alias Maximum property of CONNECT, and topic aliases in incoming PUBLISH
  packets are resolved automatically.

### Server redirection

The client does not follow redirections. Check the `serverReference` property of CONNACK or DISCONNECT and reconnect yourself.

### Request / response

Request Response Information with the `requestResponseInformation` CONNECT property, then use the `responseInformation` property of CONNACK and the
`responseTopic` and `correlationData` PUBLISH properties.

### Session store

In-flight QoS 1/2 messages are kept in memory, so they are lost when the process exits. A persistent session store is planned.

## Not supported

- A persistent session store (planned).
- Specifying CA certificates for WebSocket Secure (`wss://`). The runtime's trust store is used.
- Disabling TLS certificate verification (`rejectUnauthorized`).
- Automatic reconnection.

## License

[Apache License 2.0](LICENSE)

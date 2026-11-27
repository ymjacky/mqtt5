# mqtt5

[![jsr](https://jsr.io/badges/@ymjacky/mqtt5)](https://jsr.io/@ymjacky/mqtt5)

`mqtt5` is an MQTT client library written in TypeScript for Deno and the browser. It supports MQTT 5.0 and 3.1.1.

- **Deno**: connect over TCP (`mqtt://`), TLS (`mqtts://`), WebSocket (`ws://`) or WebSocket Secure (`wss://`).
- **Browser**: connect over WebSocket (`ws://`) or WebSocket Secure (`wss://`).

API reference: [jsr.io/@ymjacky/mqtt5/doc](https://jsr.io/@ymjacky/mqtt5/doc)

## Requirements

- Deno 2.3.1 or later
- To use `KvOutgoingStore`, the persistent [session store](#session-store): run Deno with `--unstable-kv`
- For the browser: a browser that supports ES modules and WebSocket
- To build `mqtt5.mjs` yourself (`deno task build_esm`): Deno 2.4 or later

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
  protocolVersion: Mqtt.ProtocolVersion.MqttV5,
});

client.on('publish', (event) => {
  const packet = event.detail;
  console.log(packet.topic, new TextDecoder().decode(packet.payload));
});

await client.connect();
await client.subscribe('topicA', Mqtt.QoS.AtLeastOnce);
await client.publish('topicA', 'hello', { qos: Mqtt.QoS.AtLeastOnce });

await client.disconnect();
```

## Connecting

### Client options

All options are optional. The constructor throws `ClientErrors.InvalidArgumentError` when an option is invalid, e.g. a `keepAlive` that is not an integer
from 0 to 65535, or a `clientId` that contains U+0000.

| Option                          | Default                        | Description                                                                                                                           |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `url`                           | `mqtt://127.0.0.1:1883`        | Broker URL. `MqttClient`: `mqtt:` or `mqtts:`. `WebSocketMqttClient`: `ws:` or `wss:` (required).                                     |
| `clientId`                      | `''`                           | Client identifier. With an empty ID, an MQTT 5.0 broker assigns one.                                                                  |
| `username` / `password`         | -                              | Credentials sent in CONNECT. `password` is a string (sent as UTF-8) or a `Uint8Array` (sent as it is).                                |
| `protocolVersion`               | `Mqtt.ProtocolVersion.MqttV5`  | `MqttV5` or `MqttV3_1_1`.                                                                                                             |
| `clean`                         | `true`                         | Clean Start (5.0) / Clean Session (3.1.1).                                                                                            |
| `keepAlive`                     | `10`                           | Keep alive interval in **seconds**, from `0` to `65535`. `0` disables it. A Server Keep Alive in CONNACK (5.0) overrides it.          |
| `connectTimeoutMS`              | `10000`                        | Time to wait for CONNACK, in milliseconds.                                                                                            |
| `disconnectTimeoutMS`           | `1000`                         | Time to wait for the connection to close after DISCONNECT, in milliseconds.                                                           |
| `pingrespTimeoutMS`             | `2000`                         | Time to wait for PINGRESP, in milliseconds.                                                                                           |
| `caCerts`                       | -                              | CA certificates (PEM) to trust in addition to the default root certificates, for `mqtts:` (`MqttClient` only). See [TLS](#tls-mqtts). |
| `cert` / `privateKey`           | -                              | Client certificate and private key (PEM) for TLS client authentication (`MqttClient` only).                                           |
| `topicAliasMaximumAboutSend`    | -                              | MQTT 5.0: topic alias maximum for outgoing PUBLISH packets, from `0` to `65535`. See [Topic aliases](#topic-aliases).                 |
| `topicAliasMaximumAboutReceive` | -                              | MQTT 5.0: topic alias maximum sent to the broker in CONNECT, from `0` to `65535`. See [Topic aliases](#topic-aliases).                |
| `outgoingStore`                 | in memory                      | Where QoS 1 / QoS 2 messages in flight are kept. See [Session store](#session-store).                                                 |
| `logger`                        | -                              | `(msg: string, ...args: unknown[]) => void`, called with debug logs.                                                                  |

### MQTT 3.1.1

```ts
import { Mqtt, MqttClient } from '@ymjacky/mqtt5';

const client = new MqttClient({
  url: new URL('mqtt://127.0.0.1:1883'),
  clientId: 'clientA',
  username: 'user',
  password: 'pass',
  protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1,
});
await client.connect();
```

### TLS (`mqtts://`)

`caCerts` is optional. Without it, the broker certificate is verified against Deno's default root certificates (Mozilla's root store; set
`DENO_TLS_CA_STORE=system` to use the OS certificate store). Specify `caCerts` when the broker certificate is signed by a CA that is not in them, such as your
own private CA.

```ts
import { MqttClient } from '@ymjacky/mqtt5';

// A broker certificate signed by a publicly trusted CA: caCerts is not needed
const client = new MqttClient({ url: new URL('mqtts://broker.example.com:8883'), clientId: 'clientA' });

// A broker certificate signed by your own CA: specify it with caCerts
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

For `wss://`, a CA certificate **cannot** be specified in the client options (`caCerts`, `cert` and `privateKey` are ignored), because the WebSocket API does
not accept them. The broker certificate is verified against the runtime's trust store:

- Deno: the default root certificates. To trust your own CA, start Deno with `--cert ca.crt.pem` or set `DENO_CERT=ca.crt.pem`.
- Browser: the browser's certificate store.

```ts
import { Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5';

const client = new WebSocketMqttClient({
  url: new URL('wss://127.0.0.1:8081'),
  clientId: 'clientA',
  protocolVersion: Mqtt.ProtocolVersion.MqttV5,
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
    qos: Mqtt.QoS.AtLeastOnce,
    retain: true,
  },
});
console.log(connack.sessionPresent);
```

`maximumPacketSize` (MQTT 5.0) limits the size of the packets the broker sends. If the broker sends a larger one, the client does not receive it: it
sends DISCONNECT with the Reason Code 0x95 (Packet too large), as soon as the fixed header tells the size of the packet, and the connection is closed.

## Publishing

`publish()` resolves when the flow for the QoS level completes: immediately after sending for QoS 0, on PUBACK for QoS 1, and on PUBCOMP for QoS 2.

```ts
import { Mqtt, MqttClient } from '@ymjacky/mqtt5';

const client = new MqttClient({ clientId: 'clientA' });
await client.connect();

await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AtMostOnce });
await client.publish('topicA', new Uint8Array([1, 2, 3]), { qos: Mqtt.QoS.AtLeastOnce, retain: true });

const result = await client.publish('topicA', 'payload', { qos: Mqtt.QoS.ExactlyOnce }, {
  contentType: 'application/json',
  messageExpiryInterval: 60,
  userProperties: [{ key: 'userProp1', val: 'userData1' }],
});
console.log(result.result === Mqtt.ReasonCode.Success);
```

The broker tells in CONNACK what the client may send, and `publish()` respects it:

- **Receive Maximum** (MQTT 5.0): the broker accepts only so many QoS 1 / QoS 2 messages in flight at a time (65,535 if it does not say). When that many are
  waiting for PUBACK / PUBCOMP, `publish()` waits for one of them to complete before it sends the next message, and the `publish()` calls after it wait too,
  in order. If the connection is closed meanwhile, the waiting calls reject with `StateIsNotOnlineError`.
- **Maximum QoS** and **Retain Available**: a message with a QoS higher than the Maximum QoS, or with `retain: true` when the broker does not support
  retained messages, is rejected with `QoSNotSupportedError` or `RetainNotSupportedError` (both are `NotSupportedByBrokerError`) and nothing is sent.
  The broker would close the connection otherwise. `err.maximumQoS` of `QoSNotSupportedError` is the highest QoS the broker accepts.

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

await client.subscribe('topicA', Mqtt.QoS.AtLeastOnce);
await client.subscribe(['topicB', 'sensors/+/temperature', 'logs/#'], Mqtt.QoS.AtLeastOnce);

// Shared subscription
await client.subscribe('$share/group1/topicC', Mqtt.QoS.AtLeastOnce);

// MQTT 5.0 subscription options
const result = await client.subscribe({
  topicFilter: 'topicD',
  qos: Mqtt.QoS.AtLeastOnce,
  noLocal: true,
  retainAsPublished: true,
  retainHandling: Mqtt.RetainHandling.DoNotSend,
});
console.log(result.reasons);

await client.unsubscribe(['topicA', 'topicB']);
```

A broker can say in CONNACK (MQTT 5.0) that it does not support wildcard subscriptions, shared subscriptions or Subscription Identifiers. `subscribe()` then
rejects a topic filter with `+` / `#`, a `$share/...` topic filter or a `subscriptionIdentifier` with `WildcardSubscriptionsNotSupportedError`,
`SharedSubscriptionsNotSupportedError` or `SubscriptionIdentifiersNotSupportedError`, and nothing is sent. The broker would close the connection otherwise.

## Events

Register listeners with `client.on(type, listener)` and remove them with `client.off(type, listener)`. `event.detail` holds the packet.

| Event        | `event.detail`     | When                                                             |
| ------------ | ------------------ | ---------------------------------------------------------------- |
| `publish`    | `PublishPacket`    | A message is received.                                           |
| `connack`    | `ConnackPacket`    | CONNACK is received.                                             |
| `disconnect` | `DisconnectPacket` | The broker sends DISCONNECT (MQTT 5.0). Emitted before `closed`. |
| `auth`       | `AuthPacket`       | The broker sends AUTH (MQTT 5.0 enhanced authentication).        |
| `closed`     | -                  | The connection is closed, for any reason.                        |

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
// await client.disconnect(false, { reasonString: 'bye' }); // MQTT 5.0 properties
```

`disconnect()` sends DISCONNECT after the messages of the `publish()` calls made before it. Nothing is sent after DISCONNECT: until the connection is closed,
`publish()`, `subscribe()` and `unsubscribe()` reject with `StateIsNotOnlineError`.

A `sessionExpiryInterval` other than 0 can be set in the DISCONNECT properties only when `connect()` sent one other than 0. Otherwise the broker does not treat
DISCONNECT as valid and publishes the will message, so `disconnect()` rejects with `InvalidPropertyError` and nothing is sent.

While `connect()` is in progress, `disconnect()` waits for it and then disconnects; it resolves also when `connect()` fails. `disconnect(true)` gives up
`connect()` at once: `connect()` rejects with `ConnectionClosed`.

[examples/deno/reconnect.ts](https://github.com/ymjacky/mqtt5/blob/main/examples/deno/reconnect.ts) reconnects when the broker closes the connection, keeping
the session so that QoS 1 / QoS 2 messages in flight are resent.

### Disconnecting with `await using`

`MqttClient` and `WebSocketMqttClient` implement `Symbol.asyncDispose`, so a client can be declared with
[`await using`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/await_using). When the scope is left, also because of an error,
`client.disconnect()` is called. It does nothing if the client is not connected, e.g. when `connect()` has failed.

```ts
import { Mqtt, MqttClient } from '@ymjacky/mqtt5';

async function publishOnce(): Promise<void> {
  await using client = new MqttClient({ clientId: 'clientA' });
  await client.connect();
  await client.publish('topicA', 'hello', { qos: Mqtt.QoS.AtLeastOnce });
} // client.disconnect() is called here
```

What is declared later is disposed of first. Deno KV (`Deno.Kv`) can be declared with `using` too, so with the [session store](#session-store), declare the
database before the client: the client disconnects first, and then the database is closed.

```ts
import { KvOutgoingStore, Mqtt, MqttClient } from '@ymjacky/mqtt5';

async function publishWithStore(): Promise<void> {
  using kv = await Deno.openKv();
  await using client = new MqttClient({
    clientId: 'clientA',
    clean: false,
    outgoingStore: new KvOutgoingStore(kv),
  });

  await client.connect({ properties: { sessionExpiryInterval: 3600 } });
  await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AtLeastOnce });
} // client.disconnect(), then kv.close()
```

All the Deno versions this library supports (2.3.1 or later) can run `await using`. In the browser, Safari does not support it yet: see
[`await using` in the browser](#await-using-in-the-browser).

## Error handling

A call that fails is reported in one of two ways:

- **The promise rejects** when the client cannot carry out the call: an invalid argument, the client is not connected, a timeout, or the connection is closed.
  When an argument is invalid, nothing is sent. The errors are exported as `ClientErrors`; check them with `instanceof`.
- **The promise resolves with a reason code** when the broker refuses the request: `reasonCode` (MQTT 5.0) / `returnCode` (MQTT 3.1.1) of CONNACK, `result` of
  `publish()`, `reasons` of `subscribe()` and `reasonCodes` of `unsubscribe()`. A reason code of 0x80 (128) or more is a failure. In MQTT 3.1.1, a CONNACK
  return code other than 0 and a SUBACK return code of 0x80 are failures.

A rejected promise that is not awaited does not terminate the process, so await the calls whose failures you want to handle.

### Errors

| Error (`ClientErrors.*`)  | Rejected by                                                        | When                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ConnectTimeout`          | `connect()`                                                        | CONNACK is not received within `connectTimeoutMS`.                                                                                                           |
| `InvalidPacketBeforeConnackError` | `connect()`                                                | A packet that the client cannot accept is received before CONNACK, e.g. a malformed CONNACK, or a PUBLISH, which the broker must not send before CONNACK. The client closes the connection without sending DISCONNECT; `err.reasonCode` tells why, e.g. 0x81 (Malformed Packet). |
| `StateIsNotOfflineError`  | `connect()`                                                        | The client is already connected or connecting.                                                                                                               |
| `StateIsNotOnlineError`   | `publish()`, `subscribe()`, `unsubscribe()`                        | The client is not connected.                                                                                                                                 |
| `InvalidTopicNameError`   | `publish()`, `connect()`                                           | The topic, Response Topic or Will Topic is empty, or contains `+`, `#`, U+0000 or a lone surrogate (which UTF-8 cannot encode).                              |
| `InvalidTopicFilterError` | `subscribe()`, `unsubscribe()`                                     | A topic filter is invalid, e.g. `a/#/b`, `a+` or `$share/group`.                                                                                             |
| `InvalidArgumentError`    | `connect()`, `publish()`, `subscribe()`, `unsubscribe()`, the constructors (thrown) | Another argument is invalid, e.g. a QoS other than 0, 1 or 2, `dup: true` with QoS 0, a string payload that contains a lone surrogate (which UTF-8 cannot encode), an empty list of topic filters, or `noLocal` on a shared subscription. Constructors: an option is invalid, e.g. a `keepAlive` that is not an integer from 0 to 65535, or a `clientId` or `username` that contains U+0000 or a lone surrogate. |
| `InvalidPropertyError`    | `connect()`, `publish()`, `subscribe()`, `unsubscribe()`, `disconnect()` | An MQTT 5.0 property is invalid, e.g. out of range (`subscriptionIdentifier: 0`, `receiveMaximum: 0`) or a string that contains U+0000 or a lone surrogate. `disconnect()`: also a `sessionExpiryInterval` other than 0 when `connect()` sent none. |
| `PacketTooLargeError`     | `connect()`, `publish()`, `subscribe()`, `unsubscribe()`, `auth()` | The packet is larger than the Maximum Packet Size of the broker (MQTT 5.0) or than MQTT allows.                                                              |
| `NotSupportedByBrokerError` | `publish()`, `subscribe()` | The broker said in CONNACK (MQTT 5.0) that it does not support what the call asks for; nothing is sent. Catch it to handle all of the following. `QoSNotSupportedError`: a QoS above the Maximum QoS (`err.maximumQoS` is the highest the broker accepts). `RetainNotSupportedError`: `retain: true`. `WildcardSubscriptionsNotSupportedError`, `SharedSubscriptionsNotSupportedError` and `SubscriptionIdentifiersNotSupportedError`: a topic filter with `+` / `#`, a `$share/...` topic filter, or a `subscriptionIdentifier`. |
| `SessionLostError`        | `publish()` (QoS 1 and 2)                                          | The broker did not keep the session when reconnecting. The message may or may not have reached the broker.                                                   |
| `PacketIdsExhaustedError` | `publish()` (QoS 1 and 2), `subscribe()`, `unsubscribe()`          | All the packet IDs (1 to 65535) are in use by requests that have not completed; nothing is sent. Call again after some of them have completed.               |
| `ConnectionClosed`        | `connect()`, `subscribe()`, `unsubscribe()`                        | The connection is closed before CONNACK / SUBACK / UNSUBACK. For SUBACK / UNSUBACK, the broker may or may not have processed the request.                    |
| `SendPacketError`         | `auth()`                                                           | The client is not connected.                                                                                                                                 |
| `UnsupportedByProtocolVersionError` | `auth()`                                                 | The client uses MQTT 3.1.1, which has no AUTH; nothing is sent.                                                                                              |

Properties are checked only for MQTT 5.0, because MQTT 3.1.1 packets do not carry them. `MqttClient.connect()` also rejects with the errors of opening the
connection, e.g. `Deno.errors.ConnectionRefused` when the broker is not running, or `Deno.errors.InvalidData` when the certificate of the broker is not
trusted; `WebSocketMqttClient.connect()` rejects with `ConnectionClosed` then. When `connect()` rejects, or resolves with a CONNACK that refuses the
connection, the client has closed the connection and is offline again, so it can be called again right away.

All the errors above extend `ClientErrors.MqttClientError`, and so do the other error classes of this library, e.g.
`MqttPackets.MqttPacketsError.MqttPacketParseError`: catch it to handle all of them at once. The errors of opening the connection, e.g.
`Deno.errors.ConnectionRefused`, and of a session store, e.g. Deno KV, are not of it. `err.cause` is the error that caused one, when there is one.

### Connecting

```ts
import { ClientErrors, Mqtt, MqttClient } from '@ymjacky/mqtt5';

const client = new MqttClient({ clientId: 'clientA', connectTimeoutMS: 5000 });

try {
  const connack = await client.connect();
  // When the broker refuses the connection, connect() still resolves, with the CONNACK.
  // MQTT 3.1.1: check connack.returnCode against Mqtt.V3_1_1_ConnectReturnCode.ConnectionAccepted instead.
  if (connack.reasonCode !== Mqtt.ReasonCode.Success) {
    console.error(`the broker refused the connection: ${connack.reasonCode}`);
  }
} catch (err) {
  if (err instanceof ClientErrors.ConnectTimeout) {
    console.error('no CONNACK within connectTimeoutMS');
  } else if (err instanceof Deno.errors.ConnectionRefused) {
    console.error('the broker is not running');
  } else {
    throw err;
  }
}
```

[examples/deno/connect_retry.ts](https://github.com/ymjacky/mqtt5/blob/main/examples/deno/connect_retry.ts) retries `connect()` up to 5 times, 10 seconds apart.

### Publishing

```ts
import { ClientErrors, Mqtt, MqttClient } from '@ymjacky/mqtt5';

const client = new MqttClient({ clientId: 'clientA' });
await client.connect();

try {
  const result = await client.publish('sensors/room1/temperature', '23.5', { qos: Mqtt.QoS.AtLeastOnce });
  // QoS 1 and 2: the reason code of PUBACK / PUBREC (MQTT 5.0). 0x10 (NoMatchingSubscribers) is a success.
  if (result.result >= 0x80) {
    console.error(`the broker refused the message: ${result.result} ${result.reason ?? ''}`);
  }
} catch (err) {
  if (err instanceof ClientErrors.StateIsNotOnlineError) {
    console.error('not connected');
  } else if (err instanceof ClientErrors.InvalidTopicNameError || err instanceof ClientErrors.InvalidArgumentError) {
    console.error(err.message); // e.g. a topic with a wildcard: 'sensors/+/temperature'
  } else if (err instanceof ClientErrors.MqttClientError) {
    console.error(`${err.name}: ${err.message}`); // another error of this library, e.g. PacketTooLargeError
  } else {
    throw err;
  }
}
```

### Subscribing and unsubscribing

```ts
import { ClientErrors, Mqtt, MqttClient } from '@ymjacky/mqtt5';

const client = new MqttClient({ clientId: 'clientA' });
await client.connect();

const topicFilters = ['sensors/+/temperature', 'logs/#'];
try {
  const { reasons } = await client.subscribe(topicFilters, Mqtt.QoS.AtLeastOnce);
  // One per topic filter: the granted QoS (0, 1 or 2; it can be lower than requested), or 0x80 or more on failure.
  reasons.forEach((reason, i) => {
    if (reason >= 0x80) {
      console.error(`the broker refused ${topicFilters[i]}: ${reason}`);
    }
  });

  const { reasonCodes } = await client.unsubscribe(topicFilters);
  // MQTT 5.0 only. 0x11 (NoSubscriptionExisted) is a success.
  reasonCodes?.forEach((reasonCode, i) => {
    if (reasonCode >= 0x80) {
      console.error(`the broker refused to unsubscribe from ${topicFilters[i]}: ${reasonCode}`);
    }
  });
} catch (err) {
  if (err instanceof ClientErrors.InvalidTopicFilterError) {
    console.error(err.message); // e.g. 'logs/#/error'
  } else if (err instanceof ClientErrors.ConnectionClosed) {
    console.error('closed before SUBACK / UNSUBACK: the broker may or may not have processed the request');
  } else {
    throw err;
  }
}
```

## Browser

### Use `WebSocketMqttClient`

A browser can connect to a broker only over WebSocket, so use `WebSocketMqttClient` with a `ws://` or `wss://` URL. The broker must have a WebSocket listener
enabled. The browser entry point `@ymjacky/mqtt5/browser` exports `WebSocketMqttClient` and the related types, without `MqttClient`, which uses Deno's
networking APIs (`Deno.connect` / `Deno.connectTls`).

The package is published to JSR as TypeScript, so a browser cannot load it with a `jsr:` specifier. Use one of the following.

### With a bundler (Vite, esbuild, webpack, ...)

Install the package with the [JSR npm compatibility layer](https://jsr.io/docs/npm-compatibility), which provides it as JavaScript:

```sh
npx jsr add @ymjacky/mqtt5
```

Then import from `@ymjacky/mqtt5/browser`:

```ts
import { Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5/browser';

const client = new WebSocketMqttClient({
  url: new URL('wss://broker.example.com:8081'),
  clientId: 'browserClient',
  protocolVersion: Mqtt.ProtocolVersion.MqttV5,
});

client.on('publish', (event) => {
  const packet = event.detail;
  console.log(packet.topic, new TextDecoder().decode(packet.payload));
});

await client.connect();
await client.subscribe('topicA', Mqtt.QoS.AtLeastOnce);
```

### From a CDN (no build step)

[esm.sh](https://esm.sh) serves JSR packages as JavaScript modules. Without a version, the URL follows the latest release. To pin a version, which is safer for
production, write it after the package name, e.g. `https://esm.sh/jsr/@ymjacky/mqtt5@x.y.z/browser`.

```html
<script type="module">
import { Mqtt, WebSocketMqttClient } from 'https://esm.sh/jsr/@ymjacky/mqtt5/browser';

const client = new WebSocketMqttClient({
  url: new URL('wss://broker.example.com:8081'),
  clientId: 'browserClient',
  protocolVersion: Mqtt.ProtocolVersion.MqttV5,
});
await client.connect();
</script>
```

esm.sh is a third-party service. To serve everything from your own server, use `mqtt5.mjs` below.

### Self-hosted `mqtt5.mjs`

`mqtt5.mjs` is the browser entry point bundled into a single JavaScript module file. Get it in either way:

- Download `mqtt5.mjs` from the assets of a [GitHub Release](https://github.com/ymjacky/mqtt5/releases) (0.0.25 and later).
- Build it in a clone of this repository with `deno task build_esm` (uses `deno bundle`, Deno 2.4 or later). This creates `browser/mqtt5.mjs`.

Copy it to the directory your web page is served from and import it from a module script. Serve the page over HTTP(S); module scripts do not load from `file://`
URLs.

```html
<script type="module">
import { Mqtt, WebSocketMqttClient } from './mqtt5.mjs';

const client = new WebSocketMqttClient({
  url: new URL('wss://localhost:8081'),
  clientId: 'browserClient',
  protocolVersion: Mqtt.ProtocolVersion.MqttV5,
});

client.on('publish', (event) => {
  const packet = event.detail;
  console.log(packet.topic, new TextDecoder().decode(packet.payload));
});

await client.connect();
await client.subscribe('topicA', Mqtt.QoS.AtLeastOnce);
</script>
```

`browser/index.html` in this repository is a sample page that subscribes to a topic and lists received messages.

### `await using` in the browser

`WebSocketMqttClient` can be declared with `await using` (see [Disconnecting with `await using`](#disconnecting-with-await-using)) in the browsers that
support it: Chrome and Edge 134 or later, and Firefox 141 or later.

```ts
import { Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5/browser';

async function publishOnce(): Promise<void> {
  await using client = new WebSocketMqttClient({
    url: new URL('wss://broker.example.com:8081'),
    clientId: 'browserClient',
    protocolVersion: Mqtt.ProtocolVersion.MqttV5,
  });
  await client.connect();
  await client.publish('topicA', 'hello', { qos: Mqtt.QoS.AtLeastOnce });
} // client.disconnect() is called here
```

> **Safari does not support `await using` yet** (checked with Safari 27.2). The same goes for every browser on iOS and iPadOS, Chrome and Firefox included,
> as they use the engine of Safari. There a module that contains `await using` fails to load with a `SyntaxError`, and the client has no
> `[Symbol.asyncDispose]()` method, because the browser has no `Symbol.asyncDispose`. A page that has to work in Safari calls `disconnect()` in a `finally`
> block instead:

```ts
import { Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5/browser';

async function publishOnce(): Promise<void> {
  const client = new WebSocketMqttClient({
    url: new URL('wss://broker.example.com:8081'),
    clientId: 'browserClient',
    protocolVersion: Mqtt.ProtocolVersion.MqttV5,
  });
  try {
    await client.connect();
    await client.publish('topicA', 'hello', { qos: Mqtt.QoS.AtLeastOnce });
  } finally {
    await client.disconnect();
  }
}
```

### Vue

Keep the client out of the deep reactivity of Vue 3: hold it in a `shallowRef()`, or mark it with `markRaw()`. `ref()` and `reactive()` wrap an object, and
the objects in it, in a `Proxy`. The methods of the client then run on the proxy, which cannot read the private (`#`) fields of the client and of the objects it
keeps: they throw a `TypeError` such as "Cannot read private member from an object whose class did not declare it".

```ts ignore
import { markRaw, reactive, shallowRef } from 'vue';
import { Mqtt, WebSocketMqttClient } from '@ymjacky/mqtt5/browser';

// shallowRef(): `client.value` is the client itself, not a proxy.
const client = shallowRef(new WebSocketMqttClient({ url: new URL('wss://broker.example.com:8081') }));
await client.value.connect();
await client.value.subscribe('topicA', Mqtt.QoS.AtLeastOnce);

// markRaw(): the client is not wrapped, also in a reactive object.
const state = reactive({
  client: markRaw(new WebSocketMqttClient({ url: new URL('wss://broker.example.com:8081') })),
  messages: [] as string[], // the received messages can be reactive
});
state.client.on('publish', (event) => state.messages.push(new TextDecoder().decode(event.detail.payload)));
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
  Topic Alias Maximum. If the broker's CONNACK has no Topic Alias Maximum (or it is 0), no topic aliases are sent.
- `topicAliasMaximumAboutReceive`: when set, it is sent to the broker as the Topic Alias Maximum property of CONNECT, and topic aliases in incoming PUBLISH
  packets are resolved automatically. A `topicAliasMaximum` in the `properties` of `connect()` is sent in the same way, unless this option is set.

The broker must not send a topic alias that is 0 or greater than the Topic Alias Maximum of CONNECT (when it was not sent, any topic alias), nor an empty
Topic Name with a topic alias that it has not set on the connection. The client does not receive such a PUBLISH (no `publish` event, no PUBACK / PUBREC): it
sends DISCONNECT with the Reason Code 0x94 (Topic Alias invalid) or 0x82 (Protocol Error), and the connection is closed.

### Server redirection

MQTT 5.0 lets a broker redirect a client with the reason code `UseAnotherServer` (156) or `ServerMoved` (157) and a `serverReference` property in CONNACK or
DISCONNECT. The format of `serverReference` is not defined by the MQTT specification and depends on the broker (for example `host:port`, or a list of servers).
This library does not interpret it or reconnect automatically: it passes the string through as is. Parse it according to your broker and reconnect yourself.

`connect()` resolves with the CONNACK packet even when the broker rejects the connection, so check its reason code:

```ts
import { Mqtt, MqttClient } from '@ymjacky/mqtt5';

const isRedirect = (reasonCode?: number) => reasonCode === Mqtt.ReasonCode.UseAnotherServer || reasonCode === Mqtt.ReasonCode.ServerMoved;

const client = new MqttClient({ url: new URL('mqtt://broker-a.example.com:1883'), clientId: 'clientA' });

const connack = await client.connect();
if (isRedirect(connack.reasonCode)) {
  const serverReference = connack.properties?.serverReference; // broker specific format
  // parse serverReference and connect to the referenced server
}

client.on('disconnect', (event) => {
  if (isRedirect(event.detail.reasonCode)) {
    const serverReference = event.detail.properties?.serverReference;
    // parse serverReference and reconnect
  }
});
```

### Request / response

Request Response Information with the `requestResponseInformation` CONNECT property, then use the `responseInformation` property of CONNACK and the
`responseTopic` and `correlationData` PUBLISH properties.

### Session store

QoS 1 / QoS 2 messages in flight are kept until the broker acknowledges them, and are resent after reconnecting. By default they are kept in memory, so they are
lost when the process exits.

> **Deno only.** The persistent store below, `KvOutgoingStore`, uses [Deno KV](https://docs.deno.com/deploy/kv/). It is exported by `@ymjacky/mqtt5` only, not
> by `@ymjacky/mqtt5/browser`, and does not work in the browser. Deno KV needs the `--unstable-kv` flag.
>
> **Deno KV is an unstable (preview) API.** Deno may change it or remove it in a future version, without the usual compatibility of a stable API. When
> that happens, `KvOutgoingStore`, its size limit and the format of the stored messages may change too, or it may stop working until this library
> follows. Check it with your Deno version before relying on it.

[Deno KV](https://docs.deno.com/deploy/kv/) is the key-value database built into the Deno runtime, so nothing has to be installed:

- `await Deno.openKv()` opens the database, and `kv.close()` closes it.
- On your machine the data is kept in an SQLite file. `Deno.openKv('./session.sqlite')` chooses the file; without a path Deno chooses one for the script.
- It is still an unstable API of Deno: run the program with `--unstable-kv`, e.g. `deno run --unstable-kv --allow-net main.ts`. `Deno.openKv` does not exist
  without the flag.

With `KvOutgoingStore` the messages are kept in Deno KV, and a new process resends the messages the previous one left:

```ts
import { KvOutgoingStore, Mqtt, MqttClient } from '@ymjacky/mqtt5';

const kv = await Deno.openKv();

const client = new MqttClient({
  clientId: 'clientA', // required with the store
  clean: false,
  outgoingStore: new KvOutgoingStore(kv),
});

// the messages of a previous process are resent after connect() resolves, before the messages of later publish() calls
await client.connect({ properties: { sessionExpiryInterval: 3600 } });
await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AtLeastOnce });

await client.disconnect();
kv.close(); // after the client has disconnected
```

- **A fixed Client Identifier is required.** The broker finds the session by it, so a Client Identifier assigned by the broker cannot be used: a client without
  `clientId` cannot be created with the store. The messages are kept under it; the keys are `['mqtt5', clientId, 'outgoing', packetId]`.
- **The broker has to keep the session**: connect without Clean Start (`clean: false`) and with a Session Expiry Interval (MQTT 5.0). The messages are resent
  when CONNACK has Session Present, in the order they were published. Otherwise the session is new, and they are removed from the store.
- **`publish()` waits while the messages are resent.** `connect()` resolves after the messages of a previous process have been read from the store, and they
  are resent right after that, in order. A `publish()` called meanwhile is not rejected: it waits, and its message is sent after the resent ones. When there
  are more of them than the Receive Maximum of the broker, they are resent as the broker acknowledges the earlier ones, so that may take some time.
- **Size limit**: a QoS 1 / QoS 2 PUBLISH packet larger than 65,498 bytes (`KvOutgoingStore.maximumPacketSize`) cannot be kept, and `publish()` rejects
  with `PacketTooLargeError`. The lower of this limit and the Maximum Packet Size of the broker applies. QoS 0 is not stored, so it is not limited by the
  store. The limit comes from Deno KV, which at present (checked with Deno 2.3.1 and 2.9.8) keeps values of up to 65,536 bytes; it is a fixed value in
  this library and does not follow a change of Deno KV.
- **One process per database, one client per Client Identifier.** Use a database file of its own for each process: processes that share a file wait
  for each other on every write. Never use the same Client Identifier from more than one client at the same time: the stored messages and their
  order get mixed up. Clients with different Client Identifiers in the same process can share the database.
- The application opens and closes the database. Close it after the client has disconnected. Declaring the database with `using` before the client with
  `await using` does this in the right order: see [Disconnecting with `await using`](#disconnecting-with-await-using).
- The promise of a `publish()` is gone with its process: the next process resends the message and completes the flow, but nothing reports it.
- Received QoS 2 messages are not kept: a message that was being received when the process exited can be delivered again.

See [examples/deno/session_store_kv.ts](https://github.com/ymjacky/mqtt5/blob/main/examples/deno/session_store_kv.ts).

#### Removing the stored messages

A message is removed from the store when the broker acknowledges it. To remove the messages that are left, use one of the following:

- **Start a new session**: connect with Clean Start, `await client.connect({ clean: true })`. The broker discards its session too, and the client removes the
  messages of its Client Identifier from the store.
- **Delete the keys** of the Client Identifier, while no client uses them:

  ```ts
  const kv = await Deno.openKv();
  for await (const entry of kv.list({ prefix: ['mqtt5', 'clientA'] })) {
    await kv.delete(entry.key);
  }
  kv.close();
  ```

- **Delete the database file**, while it is not open. This removes everything in the database, not only the messages. With a path,
  `Deno.openKv('./session.sqlite')`, delete that file and the `-shm` and `-wal` files next to it. Without a path, the database is under the "Origin storage"
  directory that `deno info` shows.

## Not supported

- Specifying CA certificates for WebSocket Secure (`wss://`). The runtime's trust store is used.
- Disabling TLS certificate verification (`rejectUnauthorized`).
- Automatic reconnection. Reconnect from the `closed` event, as in
  [examples/deno/reconnect.ts](https://github.com/ymjacky/mqtt5/blob/main/examples/deno/reconnect.ts).

## License

[Apache License 2.0](LICENSE)

import { Mqtt, MqttClient, MqttPackets, MqttProperties, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assertEquals } from '@std/assert';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, label: string, ms = 3000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await delay(10);
  }
}

/** `bytes` with the UTF-8 of `placeholder`, which appears once, replaced by `replacement` of the same length. */
function replaceBytes(bytes: Uint8Array, placeholder: string, replacement: number[]): Uint8Array {
  const target = new TextEncoder().encode(placeholder);
  assertEquals(target.length, replacement.length);
  const positions = [];
  for (let i = 0; i + target.length <= bytes.length; i++) {
    if (target.every((byte, j) => bytes[i + j] === byte)) {
      positions.push(i);
    }
  }
  assertEquals(positions.length, 1, `${placeholder} must appear once`);
  const result = bytes.slice();
  result.set(replacement, positions[0]);
  return result;
}

/** The bytes of a QoS 0 PUBLISH. */
function publishBytes(
  topic: string,
  properties?: MqttPackets.PublishPacket['properties'],
  protocolVersion: Mqtt.ProtocolVersion = Mqtt.ProtocolVersion.MQTT_V5,
): Uint8Array {
  return MqttPackets.packetToBytes(
    { type: 'publish', topic, payload: new Uint8Array([0x78]), dup: false, retain: false, qos: Mqtt.QoS.AT_MOST_ONCE, properties },
    protocolVersion,
  );
}

/** The bytes of a QoS 0 PUBLISH whose Topic Name is `topic/` followed by `topicBytes`. */
function publishWithTopicBytes(topicBytes: number[], protocolVersion: Mqtt.ProtocolVersion = Mqtt.ProtocolVersion.MQTT_V5): Uint8Array {
  const placeholder = 'X'.repeat(topicBytes.length);
  return replaceBytes(publishBytes(`topic/${placeholder}`, undefined, protocolVersion), placeholder, topicBytes);
}

/** Topic Names that make a PUBLISH a Malformed Packet: ill-formed UTF-8 [MQTT-1.5.4-1] and U+0000 [MQTT-1.5.4-2]. */
const invalidTopicBytes: [string, number[]][] = [
  ['an invalid byte', [0xFF]],
  ['an encoded surrogate', [0xED, 0xA0, 0x80]],
  ['an overlong encoding', [0xC0, 0x80]],
  ['U+0000', [0x00]],
];

/** What a client receives and what the broker gets back: the topics of `publish` events and the DISCONNECT Reason Codes. */
function record(client: MqttClient | WebSocketMqttClient, broker: TestBroker | TestWsBroker) {
  const recorded = {
    topics: [] as string[],
    userProperties: [] as (MqttProperties.UserProperties | undefined)[],
    disconnects: [] as (number | undefined)[],
    closed: false,
  };
  client.on('publish', (event) => {
    recorded.topics.push(event.detail.topic);
    recorded.userProperties.push(event.detail.properties?.userProperties);
  });
  client.on('closed', () => {
    recorded.closed = true;
  });
  broker.on('disconnect', (event) => {
    recorded.disconnects.push(event.detail.reasonCode);
  });
  return recorded;
}

/** Makes the broker accept every CONNECT. */
function acceptConnect(broker: TestBroker | TestWsBroker): void {
  broker.on('connect', (event) => {
    const packet = event.detail;
    broker.sendConnack(packet.clientId, false, packet.protocolVersion);
  });
}

Deno.test({ name: '@receive strings that are not valid UTF-8 Encoded Strings', only: false }, async (context) => {
  await context.step(
    'MQTT 5.0: a PUBLISH whose Topic Name is ill-formed UTF-8 or contains U+0000 is not received, and the client sends DISCONNECT with Malformed Packet',
    async () => {
      for (const [name, topicBytes] of invalidTopicBytes) {
        const broker = new TestBroker();
        const client = new MqttClient({ clientId: 'cid', logger });
        try {
          broker.listen();
          acceptConnect(broker);
          const recorded = record(client, broker);
          await client.connect();

          await broker.sendRawBytes('cid', publishBytes('topic/ok'));
          await waitFor(() => recorded.topics.length === 1, `the valid PUBLISH (${name})`);

          await broker.sendRawBytes('cid', publishWithTopicBytes(topicBytes));
          await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, `DISCONNECT and the close (${name})`);
          assertEquals(recorded.disconnects, [Mqtt.ReasonCode.MalformedPacket], name);
          // The PUBLISH is not delivered, not even with U+FFFD in place of the ill-formed bytes.
          assertEquals(recorded.topics, ['topic/ok'], name);
        } finally {
          await client.disconnect(true);
          await broker.destroy();
        }
      }
    },
  );

  await context.step('MQTT 5.0: a PUBLISH with a User Property that is ill-formed UTF-8 is a Malformed Packet', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      broker.listen();
      acceptConnect(broker);
      const recorded = record(client, broker);
      await client.connect();

      const placeholder = 'XX';
      const publish = replaceBytes(publishBytes('topicA', { userProperties: [{ key: 'k', val: placeholder }] }), placeholder, [0x61, 0xFF]);
      await broker.sendRawBytes('cid', publish);
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.MalformedPacket]);
      assertEquals(recorded.topics, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('MQTT 3.1.1: the client closes the connection without sending DISCONNECT', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1 });
    try {
      broker.listen();
      acceptConnect(broker);
      const recorded = record(client, broker);
      await client.connect();

      // [MQTT-1.5.3-1] ill-formed UTF-8: the client closes the Network Connection.
      await broker.sendRawBytes('cid', publishWithTopicBytes([0xFF], Mqtt.ProtocolVersion.MQTT_V3_1_1));
      await waitFor(() => recorded.closed, 'the close');
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.topics, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('WebSocket: a PUBLISH whose Topic Name is ill-formed UTF-8 is not received, and the client sends DISCONNECT', async () => {
    const broker = new TestWsBroker();
    const client = new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger });
    try {
      broker.listen();
      acceptConnect(broker);
      const recorded = record(client, broker);
      await client.connect();

      await broker.sendRawBytes('cid', publishWithTopicBytes([0xED, 0xA0, 0x80]));
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.MalformedPacket]);
      assertEquals(recorded.topics, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

Deno.test({ name: '@receive U+FEFF at the start of a string', only: false }, async (context) => {
  await context.step('a Topic Name and a User Property that start with U+FEFF are received as they were sent [MQTT-1.5.4-3]', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      broker.listen();
      acceptConnect(broker);
      const recorded = record(client, broker);
      await client.connect();

      // TextEncoder encodes U+FEFF as 0xEF 0xBB 0xBF.
      await broker.sendRawBytes('cid', publishBytes('\u{FEFF}topicA', { userProperties: [{ key: '\u{FEFF}k', val: '\u{FEFF}' }] }));
      await waitFor(() => recorded.topics.length === 1, 'the PUBLISH');
      // The leading U+FEFF is not stripped as a BOM.
      assertEquals(recorded.topics, ['\u{FEFF}topicA']);
      assertEquals(recorded.userProperties, [[{ key: '\u{FEFF}k', val: '\u{FEFF}' }]]);
      assertEquals(recorded.disconnects, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

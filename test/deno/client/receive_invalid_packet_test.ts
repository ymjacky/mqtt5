import { Mqtt, MqttClient, MqttPackets, WebSocketMqttClient } from '../../../deno/mod.ts';
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

/** The bytes of a valid QoS 0 PUBLISH to `topic`. */
function validPublish(topic: string, protocolVersion: Mqtt.ProtocolVersion = Mqtt.ProtocolVersion.MqttV5): Uint8Array {
  return MqttPackets.packetToBytes(
    { type: 'publish', topic, payload: new Uint8Array([0x78]), dup: false, retain: false, qos: Mqtt.QoS.AtMostOnce },
    protocolVersion,
  );
}

/** A PUBLISH whose topic length is 10, but the packet ends after 'abc' (MQTT 5.0 and 3.1.1). */
const publishWithTopicPastTheEnd = new Uint8Array([0x30, 0x05, 0x00, 0x0A, 0x61, 0x62, 0x63]);

/**
 * A PUBLISH whose Property Length is 2, but the Message Expiry Interval in it needs 4 bytes. The payload is 'xyz': it was
 * read as the end of the Message Expiry Interval (7,895,418) and also delivered as the payload.
 */
const publishWithPropertyPastThePropertyLength = new Uint8Array([0x30, 0x09, 0x00, 0x01, 0x61, 0x02, 0x02, 0x00, 0x78, 0x79, 0x7A]);

/**
 * Packets whose fixed header has flags that their packet type cannot have, which the encoder does not write: a PUBREL must
 * have 0b0010, a PUBACK 0b0000. They are a Malformed Packet (MQTT 5.0 2.1.3), and with MQTT 3.1.1 the receiver closes the
 * connection [MQTT-2.2.2-2].
 */
const packetsWithInvalidFlags: [string, Uint8Array][] = [
  ['a PUBREL (packet ID 1) with the flags 0b0000', new Uint8Array([0x60, 0x02, 0x00, 0x01])],
  ['a PUBACK (packet ID 7) with the flags 0b0101', new Uint8Array([0x45, 0x02, 0x00, 0x07])],
];

/** A PUBLISH with the Response Topic twice: a Protocol Error (MQTT 5.0 3.3.2.3.5). */
const publishWithResponseTopicTwice = new Uint8Array([0x30, 0x0C, 0x00, 0x01, 0x61, 0x08, 0x08, 0x00, 0x01, 0x72, 0x08, 0x00, 0x01, 0x72]);

/** A QoS 1 PUBLISH with the packet ID 1, an empty Topic Name and no Topic Alias. */
function publishWithEmptyTopicName(protocolVersion: Mqtt.ProtocolVersion): Uint8Array {
  return MqttPackets.packetToBytes(
    { type: 'publish', topic: '', payload: new Uint8Array([0x78]), dup: false, retain: false, qos: Mqtt.QoS.AtLeastOnce, packetId: 1 },
    protocolVersion,
  );
}

/** A PUBLISH to 'topic/zero' with QoS 1 or QoS 2 and the packet ID 0, which the encoder does not write. */
function publishWithPacketIdZero(qos: 1 | 2, protocolVersion: Mqtt.ProtocolVersion): Uint8Array {
  const topic = [...new TextEncoder().encode('topic/zero')];
  const properties = protocolVersion === Mqtt.ProtocolVersion.MqttV5 ? [0x00] : [];
  const variableHeader = [0x00, topic.length, ...topic, 0x00, 0x00, ...properties];
  return Uint8Array.from([0x30 | (qos << 1), variableHeader.length + 1, ...variableHeader, 0x78]);
}

/** The bytes of a valid PUBLISH to `topic` with QoS 1 or QoS 2 and the packet ID 1. */
function validPublishWithPacketId(topic: string, qos: 1 | 2, protocolVersion: Mqtt.ProtocolVersion): Uint8Array {
  return MqttPackets.packetToBytes({ type: 'publish', topic, payload: new Uint8Array([0x78]), dup: false, retain: false, qos, packetId: 1 }, protocolVersion);
}

/** An AUTH with the Reason Code 0x18 (Continue authentication) and the Authentication Method 'M'. */
const validAuth = MqttPackets.packetToBytes(
  { type: 'auth', reasonCode: Mqtt.ReasonCode.ContinueAuthentication, properties: { authenticationMethod: 'M' } },
  Mqtt.ProtocolVersion.MqttV5,
);

/**
 * AUTHs without the Authentication Method (a Protocol Error, MQTT 5.0 3.15.2.2.2), which the encoder does not write: with the
 * Reason Code 0x18 and a Property Length of 0, and with a Remaining Length of 0, which 3.15.2.1 allows for 0x00 (Success)
 * without properties.
 */
const authsWithoutAuthenticationMethod: [string, Uint8Array][] = [
  ['the Reason Code 0x18 and no properties', new Uint8Array([0xF0, 0x02, 0x18, 0x00])],
  ['a Remaining Length of 0', new Uint8Array([0xF0, 0x00])],
];

/**
 * What a client receives and what the broker gets back: the topics of `publish` events, the Reason Codes of `auth` events,
 * the packet IDs of PUBACK, PUBREC and PUBCOMP and the DISCONNECT Reason Codes.
 */
function record(client: MqttClient | WebSocketMqttClient, broker: TestBroker | TestWsBroker) {
  const recorded = {
    topics: [] as string[],
    auths: [] as (number | undefined)[],
    pubacks: [] as number[],
    pubrecs: [] as number[],
    pubcomps: [] as number[],
    disconnects: [] as (number | undefined)[],
    disconnectEvents: [] as MqttPackets.DisconnectPacket[],
    closed: false,
  };
  client.on('publish', (event) => {
    recorded.topics.push(event.detail.topic);
  });
  client.on('auth', (event) => {
    recorded.auths.push(event.detail.reasonCode);
  });
  client.on('disconnect', (event) => {
    recorded.disconnectEvents.push(event.detail);
  });
  client.on('closed', () => {
    recorded.closed = true;
  });
  broker.on('puback', (event) => {
    recorded.pubacks.push(event.detail.packetId);
  });
  broker.on('pubrec', (event) => {
    recorded.pubrecs.push(event.detail.packetId);
  });
  broker.on('pubcomp', (event) => {
    recorded.pubcomps.push(event.detail.packetId);
  });
  broker.on('disconnect', (event) => {
    recorded.disconnects.push(event.detail.reasonCode);
  });
  broker.on('connect', (event) => {
    const packet = event.detail;
    broker.sendConnack(packet.clientId, false, packet.protocolVersion);
  });
  return recorded;
}

Deno.test({ name: '@receive packets whose fields do not fit them', only: false }, async (context) => {
  for (
    const [name, bytes] of [
      ['a topic that goes past the end of the packet', publishWithTopicPastTheEnd],
      ['a property that goes past the Property Length', publishWithPropertyPastThePropertyLength],
    ] as const
  ) {
    await context.step(`MQTT 5.0: a PUBLISH with ${name} is not delivered, and the client sends DISCONNECT with Malformed Packet`, async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger });
      try {
        broker.listen();
        const recorded = record(client, broker);
        await client.connect();

        await broker.sendRawBytes('cid', validPublish('topic/ok'));
        await waitFor(() => recorded.topics.length === 1, 'the valid PUBLISH');

        await broker.sendRawBytes('cid', bytes);
        await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
        assertEquals(recorded.disconnects, [Mqtt.ReasonCode.MalformedPacket]);
        assertEquals(recorded.topics, ['topic/ok']);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    });
  }

  await context.step('MQTT 3.1.1: the client closes the connection without sending DISCONNECT', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1 });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      await broker.sendRawBytes('cid', publishWithTopicPastTheEnd);
      await waitFor(() => recorded.closed, 'the close');
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.topics, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

Deno.test({ name: '@receive packets whose fixed header has flags that their packet type cannot have', only: false }, async (context) => {
  for (const [name, bytes] of packetsWithInvalidFlags) {
    await context.step(`MQTT 5.0: on ${name}, the client does not answer it and sends DISCONNECT with Malformed Packet`, async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger });
      try {
        broker.listen();
        const recorded = record(client, broker);
        await client.connect();

        await broker.sendRawBytes('cid', validPublish('topic/ok'));
        await waitFor(() => recorded.topics.length === 1, 'the valid PUBLISH');

        await broker.sendRawBytes('cid', bytes);
        await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
        assertEquals(recorded.disconnects, [Mqtt.ReasonCode.MalformedPacket]);
        assertEquals(recorded.pubcomps, []);
        assertEquals(recorded.topics, ['topic/ok']);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    });
  }

  await context.step('MQTT 3.1.1: the client does not answer it and closes the connection without sending DISCONNECT', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1 });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      await broker.sendRawBytes('cid', new Uint8Array([0x60, 0x02, 0x00, 0x01])); // PUBREL with the flags 0b0000
      await waitFor(() => recorded.closed, 'the close');
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.pubcomps, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('WebSocket: the client sends DISCONNECT with Malformed Packet', async () => {
    const broker = new TestWsBroker();
    const client = new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      broker.sendRawBytes('cid', new Uint8Array([0x60, 0x02, 0x00, 0x01])); // PUBREL with the flags 0b0000
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.MalformedPacket]);
      assertEquals(recorded.pubcomps, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

Deno.test({ name: '@receive packets that are a Protocol Error', only: false }, async (context) => {
  await context.step(
    'MQTT 5.0: a PUBLISH with a property included twice is not delivered, and the client sends DISCONNECT with Protocol Error',
    async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger });
      try {
        broker.listen();
        const recorded = record(client, broker);
        await client.connect();

        await broker.sendRawBytes('cid', validPublish('topic/ok'));
        await waitFor(() => recorded.topics.length === 1, 'the valid PUBLISH');

        await broker.sendRawBytes('cid', publishWithResponseTopicTwice);
        await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
        assertEquals(recorded.disconnects, [Mqtt.ReasonCode.ProtocolError]);
        assertEquals(recorded.topics, ['topic/ok']);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    },
  );

  await context.step('WebSocket: the client sends DISCONNECT with Protocol Error', async () => {
    const broker = new TestWsBroker();
    const client = new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      await broker.sendRawBytes('cid', publishWithResponseTopicTwice);
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.ProtocolError]);
      assertEquals(recorded.topics, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

Deno.test({ name: '@receive PUBLISH with an empty Topic Name and no Topic Alias', only: false }, async (context) => {
  await context.step('MQTT 5.0: not delivered, no PUBACK, and the client sends DISCONNECT with Protocol Error (3.3.2.1)', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      await broker.sendRawBytes('cid', validPublish('topic/ok'));
      await waitFor(() => recorded.topics.length === 1, 'the valid PUBLISH');

      await broker.sendRawBytes('cid', publishWithEmptyTopicName(Mqtt.ProtocolVersion.MqttV5));
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.ProtocolError]);
      assertEquals(recorded.topics, ['topic/ok']);
      assertEquals(recorded.pubacks, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('MQTT 3.1.1: not delivered, no PUBACK, and the client closes the connection without DISCONNECT [MQTT-4.7.3-1]', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1 });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      await broker.sendRawBytes('cid', validPublish('topic/ok', Mqtt.ProtocolVersion.MqttV3_1_1));
      await waitFor(() => recorded.topics.length === 1, 'the valid PUBLISH');

      await broker.sendRawBytes('cid', publishWithEmptyTopicName(Mqtt.ProtocolVersion.MqttV3_1_1));
      await waitFor(() => recorded.closed, 'the close');
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.topics, ['topic/ok']);
      assertEquals(recorded.pubacks, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('WebSocket: the client sends DISCONNECT with Protocol Error', async () => {
    const broker = new TestWsBroker();
    const client = new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      broker.sendRawBytes('cid', publishWithEmptyTopicName(Mqtt.ProtocolVersion.MqttV5));
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.ProtocolError]);
      assertEquals(recorded.topics, []);
      assertEquals(recorded.pubacks, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

// The broker must give a PUBLISH with QoS 1 or QoS 2 a packet ID other than 0 ([MQTT-2.2.1-4]; MQTT 3.1.1 [MQTT-2.3.1-1]).
Deno.test({ name: '@receive PUBLISH with QoS 1 or QoS 2 and a packet ID of 0', only: false }, async (context) => {
  for (const qos of [1, 2] as const) {
    const answer = qos === 1 ? 'PUBACK' : 'PUBREC';
    await context.step(`MQTT 5.0, QoS ${qos}: not delivered, no ${answer}, and the client sends DISCONNECT with Protocol Error`, async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger });
      try {
        broker.listen();
        const recorded = record(client, broker);
        await client.connect();

        await broker.sendRawBytes('cid', validPublishWithPacketId('topic/ok', qos, Mqtt.ProtocolVersion.MqttV5));
        await waitFor(() => recorded.topics.length === 1 && recorded.pubacks.length + recorded.pubrecs.length === 1, 'the valid PUBLISH');

        await broker.sendRawBytes('cid', publishWithPacketIdZero(qos, Mqtt.ProtocolVersion.MqttV5));
        await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
        assertEquals(recorded.disconnects, [Mqtt.ReasonCode.ProtocolError]);
        assertEquals(recorded.topics, ['topic/ok']);
        assertEquals(qos === 1 ? recorded.pubacks : recorded.pubrecs, [1]);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    });
  }

  await context.step('MQTT 3.1.1: not delivered, no PUBACK, and the client closes the connection without DISCONNECT', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1 });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      await broker.sendRawBytes('cid', validPublishWithPacketId('topic/ok', 1, Mqtt.ProtocolVersion.MqttV3_1_1));
      await waitFor(() => recorded.topics.length === 1 && recorded.pubacks.length === 1, 'the valid PUBLISH');

      await broker.sendRawBytes('cid', publishWithPacketIdZero(1, Mqtt.ProtocolVersion.MqttV3_1_1));
      await waitFor(() => recorded.closed, 'the close');
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.topics, ['topic/ok']);
      assertEquals(recorded.pubacks, [1]);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('WebSocket: the client sends DISCONNECT with Protocol Error', async () => {
    const broker = new TestWsBroker();
    const client = new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      broker.sendRawBytes('cid', publishWithPacketIdZero(1, Mqtt.ProtocolVersion.MqttV5));
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.ProtocolError]);
      assertEquals(recorded.topics, []);
      assertEquals(recorded.pubacks, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

Deno.test({ name: '@receive AUTH without an Authentication Method', only: false }, async (context) => {
  for (const [name, bytes] of authsWithoutAuthenticationMethod) {
    await context.step(`MQTT 5.0, ${name}: no auth event, and the client sends DISCONNECT with Protocol Error`, async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger });
      try {
        broker.listen();
        const recorded = record(client, broker);
        await client.connect();

        await broker.sendRawBytes('cid', validAuth);
        await waitFor(() => recorded.auths.length === 1, 'the valid AUTH');

        await broker.sendRawBytes('cid', bytes);
        await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
        assertEquals(recorded.disconnects, [Mqtt.ReasonCode.ProtocolError]);
        assertEquals(recorded.auths, [Mqtt.ReasonCode.ContinueAuthentication]);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    });
  }

  await context.step('WebSocket: the client sends DISCONNECT with Protocol Error', async () => {
    const broker = new TestWsBroker();
    const client = new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      broker.sendRawBytes('cid', new Uint8Array([0xF0, 0x02, 0x18, 0x00]));
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.ProtocolError]);
      assertEquals(recorded.auths, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

Deno.test({ name: '@receive DISCONNECT without a Reason Code', only: false }, async (context) => {
  await context.step('MQTT 5.0: the disconnect event has the Reason Code 0x00 (Normal disconnection)', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      // Remaining Length 0: the Reason Code 0x00 and the Property Length are omitted (MQTT 5.0 3.14.2.1).
      await broker.sendRawBytes('cid', new Uint8Array([0xE0, 0x00]));
      await waitFor(() => recorded.disconnectEvents.length === 1, 'the disconnect event');
      assertEquals(recorded.disconnectEvents, [{ type: 'disconnect', reasonCode: Mqtt.ReasonCode.NormalDisconnection }]);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

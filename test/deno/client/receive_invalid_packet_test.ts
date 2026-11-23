import { Mqtt, MqttClient, MqttPackets, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assertEquals } from 'std/assert/mod.ts';

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
function validPublish(topic: string, protocolVersion: Mqtt.ProtocolVersion = Mqtt.ProtocolVersion.MQTT_V5): Uint8Array {
  return MqttPackets.packetToBytes(
    { type: 'publish', topic, payload: new Uint8Array([0x78]), dup: false, retain: false, qos: Mqtt.QoS.AT_MOST_ONCE },
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

/** A PUBLISH with the Response Topic twice: a Protocol Error (MQTT 5.0 3.3.2.3.5). */
const publishWithResponseTopicTwice = new Uint8Array([0x30, 0x0C, 0x00, 0x01, 0x61, 0x08, 0x08, 0x00, 0x01, 0x72, 0x08, 0x00, 0x01, 0x72]);

/** What a client receives and what the broker gets back: the topics of `publish` events and the DISCONNECT Reason Codes. */
function record(client: MqttClient | WebSocketMqttClient, broker: TestBroker | TestWsBroker) {
  const recorded = {
    topics: [] as string[],
    disconnects: [] as (number | undefined)[],
    disconnectEvents: [] as MqttPackets.DisconnectPacket[],
    closed: false,
  };
  client.on('publish', (event) => {
    recorded.topics.push(event.detail.topic);
  });
  client.on('disconnect', (event) => {
    recorded.disconnectEvents.push(event.detail);
  });
  client.on('closed', () => {
    recorded.closed = true;
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
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1 });
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

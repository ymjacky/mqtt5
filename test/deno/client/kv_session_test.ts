import { ClientErrors, KvOutgoingStore, Mqtt, MqttClient, MqttPackets, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { kvStore } from '../store/outgoing_store_contract.ts';
import { assertEquals, assertRejects, assertStringIncludes, assertThrows } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean | Promise<boolean>, label: string, ms = 2000) {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > ms) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await delay(10);
  }
}

async function keys(kv: Deno.Kv): Promise<Deno.KvKey[]> {
  const found: Deno.KvKey[] = [];
  for await (const entry of kv.list({ prefix: [] })) {
    found.push(entry.key);
  }
  return found;
}

/**
 * A broker that records what it receives, e.g. `PUBLISH 1 A dup` or `PUBREL 1`, and answers nothing by itself
 * but CONNACK, with the Session Present and the properties set by the test.
 */
function recordingBroker() {
  const broker = new TestBroker();
  const state = {
    broker,
    received: [] as string[],
    sessionPresent: false,
    connackProperties: undefined as MqttProperties.Properties | undefined,
  };
  broker.listen();
  broker.on('connect', (event) => {
    const packet = event.detail;
    broker.sendConnack(packet.clientId, state.sessionPresent, packet.protocolVersion, Mqtt.ReasonCode.Success, state.connackProperties);
  });
  broker.on('publish', (event) => {
    const packet = event.detail;
    const payload = packet.payload.length > 100 ? `${packet.payload.length} bytes` : new TextDecoder().decode(packet.payload);
    state.received.push(`PUBLISH ${packet.packetId} ${payload}${packet.dup ? ' dup' : ''}`);
  });
  broker.on('pubrel', (event) => {
    state.received.push(`PUBREL ${event.detail.packetId}`);
  });
  return state;
}

/** The size of the payload that makes PUBLISH to 'topicA' with a packet ID `size` bytes. */
function payloadLengthForPacketSize(size: number, protocolVersion: Mqtt.ProtocolVersion): number {
  const encodedSize = (payloadLength: number) =>
    MqttPackets.packetToBytes(
      { type: 'publish', topic: 'topicA', payload: new Uint8Array(payloadLength), dup: false, retain: false, qos: 1, packetId: 1 },
      protocolVersion,
    ).length;
  let payloadLength = size - encodedSize(0);
  payloadLength -= encodedSize(payloadLength) - size; // the Remaining Length takes more bytes with the payload
  assertEquals(encodedSize(payloadLength), size);
  return payloadLength;
}

const v5 = Mqtt.ProtocolVersion.MQTT_V5;

function kvClient(kv: Deno.Kv, options?: Partial<ConstructorParameters<typeof MqttClient>[0]>): MqttClient {
  return new MqttClient({ clientId: 'cid', logger, clean: false, outgoingStore: new KvOutgoingStore(kv), ...options });
}

Deno.test({ name: '@session in Deno KV: after the process restarts', only: false }, async (context) => {
  await context.step('QoS 1 messages are resent in the order they were published, and a new publish() gets another packet ID', async () => {
    const kv = await Deno.openKv(':memory:');
    const b = recordingBroker();
    try {
      // The first process publishes and ends before every PUBACK.
      const first = kvClient(kv);
      await first.connect();
      const publishingA = first.publish('topicA', 'A', { qos: Mqtt.QoS.AT_LEAST_ONCE });
      first.publish('topicA', 'B', { qos: Mqtt.QoS.AT_LEAST_ONCE });
      first.publish('topicA', 'C', { qos: Mqtt.QoS.AT_LEAST_ONCE });
      await waitFor(() => b.received.length === 3, 'the messages of the first process');
      assertEquals(b.received, ['PUBLISH 1 A', 'PUBLISH 2 B', 'PUBLISH 3 C']);
      b.broker.sendPuback('cid', 1, v5); // only 'A' is acknowledged
      await publishingA;
      await first.disconnect(true);
      assertEquals(await keys(kv), [['mqtt5', 'cid', 'outgoing', 2], ['mqtt5', 'cid', 'outgoing', 3]]);

      // The second process has a new client and a new store on the same database. The broker has the session.
      b.received.length = 0;
      b.sessionPresent = true;
      const second = kvClient(kv);
      await second.connect();
      assertEquals(await second.publishInflightCount(), 2);
      const publishingD = second.publish('topicA', 'D', { qos: Mqtt.QoS.AT_LEAST_ONCE });
      await waitFor(() => b.received.length === 3, 'the resent and the new messages');
      // 'D' does not get the packet ID 2 or 3, which are not acknowledged yet
      assertEquals(b.received, ['PUBLISH 2 B dup', 'PUBLISH 3 C dup', 'PUBLISH 4 D']);

      for (const packetId of [2, 3, 4]) {
        b.broker.sendPuback('cid', packetId, v5);
      }
      assertEquals((await publishingD).result, Mqtt.ReasonCode.Success);
      assertEquals(await second.publishInflightCount(), 0);
      assertEquals(await keys(kv), []);
      await second.disconnect();
    } finally {
      await b.broker.destroy();
      kv.close();
    }
  });

  await context.step(
    'a resend that is cut is done again from the first message that is not acknowledged, in the order they were published and not of the packet IDs',
    async () => {
      const kv = await Deno.openKv(':memory:');
      const b = recordingBroker();
      try {
        // The first process publishes A, B, C, D. 'C' gets the packet ID 1 again, which 'X' gave back.
        const first = kvClient(kv);
        await first.connect();
        const publishingX = first.publish('topicA', 'X', { qos: Mqtt.QoS.AT_LEAST_ONCE });
        first.publish('topicA', 'A', { qos: Mqtt.QoS.AT_LEAST_ONCE });
        first.publish('topicA', 'B', { qos: Mqtt.QoS.AT_LEAST_ONCE });
        await waitFor(() => b.received.length === 3, 'X, A and B');
        b.broker.sendPuback('cid', 1, v5);
        await publishingX;
        first.publish('topicA', 'C', { qos: Mqtt.QoS.AT_LEAST_ONCE });
        first.publish('topicA', 'D', { qos: Mqtt.QoS.AT_LEAST_ONCE });
        await waitFor(() => b.received.length === 5, 'C and D');
        assertEquals(b.received, ['PUBLISH 1 X', 'PUBLISH 2 A', 'PUBLISH 3 B', 'PUBLISH 1 C', 'PUBLISH 4 D']);
        await first.disconnect(true);

        // The second process resends them; the connection is lost before any PUBACK.
        b.received.length = 0;
        b.sessionPresent = true;
        const second = kvClient(kv);
        let closed = Promise.withResolvers<void>();
        second.on('closed', () => closed.resolve());
        await second.connect();
        await waitFor(() => b.received.length === 4, 'the resent messages');
        assertEquals(b.received, ['PUBLISH 2 A dup', 'PUBLISH 3 B dup', 'PUBLISH 1 C dup', 'PUBLISH 4 D dup']);
        b.broker.closeConnectionFromBroker('cid');
        await closed.promise;

        // It reconnects and resends all of them again, from 'A'. This time 'A' is acknowledged before the connection is lost.
        b.received.length = 0;
        closed = Promise.withResolvers<void>();
        await second.connect();
        await waitFor(() => b.received.length === 4, 'the messages resent again');
        assertEquals(b.received, ['PUBLISH 2 A dup', 'PUBLISH 3 B dup', 'PUBLISH 1 C dup', 'PUBLISH 4 D dup']);
        b.broker.sendPuback('cid', 2, v5);
        await waitFor(async () => (await keys(kv)).length === 3, "PUBACK of 'A'");
        assertEquals(await keys(kv), [['mqtt5', 'cid', 'outgoing', 1], ['mqtt5', 'cid', 'outgoing', 3], ['mqtt5', 'cid', 'outgoing', 4]]);
        b.broker.closeConnectionFromBroker('cid');
        await closed.promise;

        // The third process resends from 'B'.
        b.received.length = 0;
        const third = kvClient(kv);
        await third.connect();
        await waitFor(() => b.received.length === 3, 'the messages resent by the third process');
        assertEquals(b.received, ['PUBLISH 3 B dup', 'PUBLISH 1 C dup', 'PUBLISH 4 D dup']);
        for (const packetId of [3, 1, 4]) {
          b.broker.sendPuback('cid', packetId, v5);
        }
        await waitFor(async () => (await keys(kv)).length === 0, 'the last PUBACK');
        assertEquals(await third.publishInflightCount(), 0);
        await third.disconnect();
      } finally {
        await b.broker.destroy();
        kv.close();
      }
    },
  );

  await context.step('a QoS 2 message waiting for PUBREC is resent as PUBLISH', async () => {
    const kv = await Deno.openKv(':memory:');
    const b = recordingBroker();
    try {
      const first = kvClient(kv);
      await first.connect();
      first.publish('topicA', 'A', { qos: Mqtt.QoS.EXACTLY_ONCE });
      await waitFor(() => b.received.length === 1, 'PUBLISH');
      await first.disconnect(true);

      b.received.length = 0;
      b.sessionPresent = true;
      const second = kvClient(kv);
      await second.connect();
      await waitFor(() => b.received.length === 1, 'the resent PUBLISH');
      b.broker.sendPubrec('cid', 1, v5);
      await waitFor(() => b.received.length === 2, 'PUBREL');
      assertEquals(b.received, ['PUBLISH 1 A dup', 'PUBREL 1']);
      b.broker.sendPubcomp('cid', 1, v5);
      await waitFor(async () => (await keys(kv)).length === 0, 'PUBCOMP');
      assertEquals(await second.publishInflightCount(), 0);
      await second.disconnect();
    } finally {
      await b.broker.destroy();
      kv.close();
    }
  });

  await context.step('a QoS 2 message waiting for PUBCOMP is resent as PUBREL, not as PUBLISH', async () => {
    const kv = await Deno.openKv(':memory:');
    const b = recordingBroker();
    try {
      const first = kvClient(kv);
      await first.connect();
      first.publish('topicA', 'A', { qos: Mqtt.QoS.EXACTLY_ONCE });
      await waitFor(() => b.received.length === 1, 'PUBLISH');
      b.broker.sendPubrec('cid', 1, v5);
      await waitFor(() => b.received.length === 2, 'PUBREL');
      await first.disconnect(true);

      b.received.length = 0;
      b.sessionPresent = true;
      const second = kvClient(kv);
      await second.connect();
      await waitFor(() => b.received.length === 1, 'the resent PUBREL');
      assertEquals(b.received, ['PUBREL 1']);
      b.broker.sendPubcomp('cid', 1, v5);
      await waitFor(async () => (await keys(kv)).length === 0, 'PUBCOMP');
      assertEquals(await second.publishInflightCount(), 0);
      await second.disconnect();
    } finally {
      await b.broker.destroy();
      kv.close();
    }
  });

  await context.step('nothing is resent and the messages are removed when the broker does not have the session', async () => {
    const kv = await Deno.openKv(':memory:');
    const b = recordingBroker();
    try {
      const first = kvClient(kv);
      await first.connect();
      first.publish('topicA', 'A', { qos: Mqtt.QoS.AT_LEAST_ONCE });
      first.publish('topicA', 'B', { qos: Mqtt.QoS.EXACTLY_ONCE });
      await waitFor(() => b.received.length === 2, 'the messages of the first process');
      await first.disconnect(true);
      // the messages of another client stay
      await kvStore(kv, 'other').store({ type: 'pubrel', packetId: 1 });

      b.received.length = 0;
      b.sessionPresent = false;
      const second = kvClient(kv);
      await second.connect();
      assertEquals(await second.publishInflightCount(), 0);
      assertEquals(await keys(kv), [['mqtt5', 'other', 'outgoing', 1]]);
      await delay(50);
      assertEquals(b.received, []);
      await second.disconnect();
    } finally {
      await b.broker.destroy();
      kv.close();
    }
  });

  await context.step('MQTT 3.1.1: a QoS 1 message is resent', async () => {
    const kv = await Deno.openKv(':memory:');
    const b = recordingBroker();
    const v311 = Mqtt.ProtocolVersion.MQTT_V3_1_1;
    try {
      const first = kvClient(kv, { protocolVersion: v311 });
      await first.connect();
      first.publish('topicA', 'A', { qos: Mqtt.QoS.AT_LEAST_ONCE });
      await waitFor(() => b.received.length === 1, 'PUBLISH');
      await first.disconnect(true);

      b.received.length = 0;
      b.sessionPresent = true;
      const second = kvClient(kv, { protocolVersion: v311 });
      await second.connect();
      await waitFor(() => b.received.length === 1, 'the resent PUBLISH');
      assertEquals(b.received, ['PUBLISH 1 A dup']);
      b.broker.sendPuback('cid', 1, v311);
      await waitFor(async () => (await keys(kv)).length === 0, 'PUBACK');
      await second.disconnect();
    } finally {
      await b.broker.destroy();
      kv.close();
    }
  });
});

Deno.test({ name: '@session in Deno KV: client options', only: false }, async (context) => {
  await context.step('the store is used with Clean Start too', async () => {
    const kv = await Deno.openKv(':memory:');
    const b = recordingBroker();
    try {
      const client = kvClient(kv, { clean: true });
      await client.connect();
      const publishing = client.publish('topicA', 'A', { qos: Mqtt.QoS.AT_LEAST_ONCE });
      await waitFor(() => b.received.length === 1, 'PUBLISH');
      assertEquals(await keys(kv), [['mqtt5', 'cid', 'outgoing', 1]]);
      b.broker.sendPuback('cid', 1, v5);
      await publishing;
      assertEquals(await keys(kv), []);
      await client.disconnect();
    } finally {
      await b.broker.destroy();
      kv.close();
    }
  });

  await context.step('a client without a Client Identifier cannot use the store', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      assertThrows(() => new MqttClient({ outgoingStore: new KvOutgoingStore(kv) }), ClientErrors.InvalidArgumentError, 'needs a client with a clientId');
      assertThrows(() => new MqttClient({ clientId: '', outgoingStore: new KvOutgoingStore(kv) }), ClientErrors.InvalidArgumentError);
    } finally {
      kv.close();
    }
  });

  await context.step('the store keeps the packets under the Client Identifier of its client', async () => {
    const kv = await Deno.openKv(':memory:');
    const b = recordingBroker();
    try {
      const client = new MqttClient({ clientId: 'clientB', logger, outgoingStore: new KvOutgoingStore(kv) });
      await client.connect();
      client.publish('topicA', 'A', { qos: Mqtt.QoS.AT_LEAST_ONCE });
      await waitFor(() => b.received.length === 1, 'PUBLISH');
      assertEquals(await keys(kv), [['mqtt5', 'clientB', 'outgoing', 1]]);
      await client.disconnect(true);
    } finally {
      await b.broker.destroy();
      kv.close();
    }
  });

  await context.step('a store cannot be given to clients of different Client Identifiers', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      const outgoingStore = new KvOutgoingStore(kv);
      new MqttClient({ clientId: 'clientA', outgoingStore });
      new MqttClient({ clientId: 'clientA', outgoingStore });
      assertThrows(
        () => new MqttClient({ clientId: 'clientB', outgoingStore }),
        ClientErrors.InvalidArgumentError,
        "already used with the Client Identifier 'clientA'",
      );
    } finally {
      kv.close();
    }
  });

  await context.step('a topic alias is not stored', async () => {
    const kv = await Deno.openKv(':memory:');
    const b = recordingBroker();
    b.connackProperties = { topicAliasMaximum: 10 };
    try {
      const client = kvClient(kv, { topicAliasMaximumAboutSend: 10 });
      await client.connect();
      client.publish('topicA', 'A', { qos: Mqtt.QoS.AT_LEAST_ONCE });
      client.publish('topicA', 'B', { qos: Mqtt.QoS.AT_LEAST_ONCE }); // sent with the alias and an empty Topic Name
      await waitFor(() => b.received.length === 2, 'the messages');

      const stored: MqttPackets.PublishPacket[] = [];
      for await (const packet of kvStore(kv, 'cid').resendIterator()) {
        stored.push(packet as MqttPackets.PublishPacket);
      }
      assertEquals(stored.map((packet) => [packet.topic, packet.properties?.topicAlias]), [['topicA', undefined], ['topicA', undefined]]);
      await client.disconnect(true);
    } finally {
      await b.broker.destroy();
      kv.close();
    }
  });
});

Deno.test({ name: '@session in Deno KV: packet size', only: false }, async (context) => {
  const storeMaximum = KvOutgoingStore.maximumPacketSize;

  for (const protocolVersion of [Mqtt.ProtocolVersion.MQTT_V5, Mqtt.ProtocolVersion.MQTT_V3_1_1]) {
    await context.step(`protocol version ${protocolVersion}: QoS 1 and 2 PUBLISH larger than the store can keep are rejected, QoS 0 is sent`, async () => {
      const kv = await Deno.openKv(':memory:');
      const b = recordingBroker();
      try {
        const client = kvClient(kv, { protocolVersion });
        await client.connect();
        const fits = new Uint8Array(payloadLengthForPacketSize(storeMaximum, protocolVersion));
        const tooLarge = new Uint8Array(fits.length + 1);

        for (const qos of [Mqtt.QoS.AT_LEAST_ONCE, Mqtt.QoS.EXACTLY_ONCE]) {
          const err = await assertRejects(() => client.publish('topicA', tooLarge, { qos }), ClientErrors.PacketTooLargeError);
          assertStringIncludes(err.message, `larger than the ${storeMaximum} bytes the session store can keep`);
        }
        assertEquals(await keys(kv), []);
        assertEquals(b.received, []);

        // QoS 0 is not stored. Its PUBLISH has no packet ID, so it is 2 bytes smaller.
        await client.publish('topicA', new Uint8Array(tooLarge.length + 10), { qos: Mqtt.QoS.AT_MOST_ONCE });
        await waitFor(() => b.received.length === 1, 'the QoS 0 message');

        // The largest PUBLISH is stored and sent, with the packet ID the rejected ones gave back.
        const publishing = client.publish('topicA', fits, { qos: Mqtt.QoS.AT_LEAST_ONCE });
        await waitFor(() => b.received.length === 2, 'the largest message');
        assertEquals(b.received, [`PUBLISH undefined ${tooLarge.length + 10} bytes`, `PUBLISH 1 ${fits.length} bytes`]);
        assertEquals(await keys(kv), [['mqtt5', 'cid', 'outgoing', 1]]);
        b.broker.sendPuback('cid', 1, protocolVersion);
        assertEquals((await publishing).result, Mqtt.ReasonCode.Success);
        await client.disconnect();
      } finally {
        await b.broker.destroy();
        kv.close();
      }
    });
  }

  await context.step('the lower of the Maximum Packet Size of the broker and the limit of the store applies', async () => {
    const kv = await Deno.openKv(':memory:');
    const b = recordingBroker();
    try {
      const client = kvClient(kv);
      const tooLargeForStore = new Uint8Array(payloadLengthForPacketSize(storeMaximum, v5) + 1);

      // The broker accepts less than the store.
      b.connackProperties = { maximumPacketSize: 1000 };
      await client.connect();
      let err = await assertRejects(() => client.publish('topicA', new Uint8Array(1000), { qos: Mqtt.QoS.AT_LEAST_ONCE }), ClientErrors.PacketTooLargeError);
      assertStringIncludes(err.message, 'larger than the Maximum Packet Size 1000 of the broker');
      err = await assertRejects(() => client.publish('topicA', tooLargeForStore, { qos: Mqtt.QoS.AT_LEAST_ONCE }), ClientErrors.PacketTooLargeError);
      assertStringIncludes(err.message, 'of the broker');
      await client.disconnect();

      // The broker accepts more than the store.
      b.connackProperties = { maximumPacketSize: 100000 };
      await client.connect();
      err = await assertRejects(() => client.publish('topicA', tooLargeForStore, { qos: Mqtt.QoS.AT_LEAST_ONCE }), ClientErrors.PacketTooLargeError);
      assertStringIncludes(err.message, 'the session store can keep');
      // QoS 0 has the limit of the broker only
      await client.publish('topicA', tooLargeForStore, { qos: Mqtt.QoS.AT_MOST_ONCE });
      await assertRejects(() => client.publish('topicA', new Uint8Array(100000), { qos: Mqtt.QoS.AT_MOST_ONCE }), ClientErrors.PacketTooLargeError);
      await waitFor(() => b.received.length === 1, 'the QoS 0 message');

      assertEquals(await keys(kv), []);
      await client.disconnect();
    } finally {
      await b.broker.destroy();
      kv.close();
    }
  });
});

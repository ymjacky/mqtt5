import { KvOutgoingStore, Mqtt, MqttPackets } from '../../../deno/mod.ts';
import { kvStore, publishPacket, resendOrder } from './outgoing_store_contract.ts';
import { assertEquals, assertRejects, assertThrows } from '@std/assert';

/** A PUBLISH whose MQTT 5.0 encoding is `size` bytes. */
function publishPacketOfSize(size: number): MqttPackets.PublishPacket {
  const packet = publishPacket(1, '');
  const encodedSize = (payloadLength: number) =>
    MqttPackets.packetToBytes({ ...packet, payload: new Uint8Array(payloadLength) }, Mqtt.ProtocolVersion.MQTT_V5).length;
  let payloadLength = size - encodedSize(0);
  payloadLength -= encodedSize(payloadLength) - size; // the Remaining Length takes more bytes with the payload
  packet.payload = new Uint8Array(payloadLength);
  assertEquals(encodedSize(payloadLength), size);
  return packet;
}

async function keys(kv: Deno.Kv, prefix: Deno.KvKey = []): Promise<Deno.KvKey[]> {
  const found: Deno.KvKey[] = [];
  for await (const entry of kv.list({ prefix })) {
    found.push(entry.key);
  }
  return found;
}

Deno.test({ name: '@KvOutgoingStore', only: false }, async (context) => {
  await context.step('an empty Client Identifier, and a second Client Identifier, are rejected', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      const store = new KvOutgoingStore(kv);
      assertThrows(() => store.setClientId(''), Error, 'needs a client with a clientId');
      store.setClientId('clientA');
      store.setClientId('clientA');
      assertThrows(() => store.setClientId('clientB'), Error, "already used with the Client Identifier 'clientA'");
    } finally {
      kv.close();
    }
  });

  await context.step('a store that no client uses yet rejects', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      const store = new KvOutgoingStore(kv);
      await assertRejects(() => store.store(publishPacket(1, 'A')), Error, 'not used by a client yet');
      await assertRejects(() => store.count(), Error, 'not used by a client yet');
      await assertRejects(() => store.clear(), Error, 'not used by a client yet');
      await assertRejects(() => resendOrder(store), Error, 'not used by a client yet');
    } finally {
      kv.close();
    }
  });

  await context.step('a new store on the same database has the packets in the same order, and continues after them', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      const before = kvStore(kv, 'cid');
      await before.store(publishPacket(3, 'A'));
      await before.store(publishPacket(1, 'B', Mqtt.QoS.EXACTLY_ONCE));
      await before.store(publishPacket(2, 'C'));
      await before.discard(3); // the first position is free again

      // the process restarts
      const after = kvStore(kv, 'cid');
      assertEquals(await after.count(), 2);
      assertEquals(await after.has(1), true);
      assertEquals(await after.has(3), false);
      assertEquals(await resendOrder(after), ['publish 1 B', 'publish 2 C']);

      await after.store(publishPacket(3, 'D')); // stored after the packets of the previous process
      await after.store({ type: 'pubrel', packetId: 1 }); // keeps the position of the previous process
      assertEquals(await resendOrder(after), ['pubrel 1', 'publish 2 C', 'publish 3 D']);
    } finally {
      kv.close();
    }
  });

  await context.step('the packets are read again after the database file is closed and opened', async () => {
    const path = await Deno.makeTempFile({ suffix: '.sqlite' });
    try {
      const kv = await Deno.openKv(path);
      const store = kvStore(kv, 'cid');
      await store.store(publishPacket(2, 'A'));
      await store.store(publishPacket(1, 'B'));
      kv.close();

      const reopened = await Deno.openKv(path);
      try {
        assertEquals(await resendOrder(kvStore(reopened, 'cid')), ['publish 2 A', 'publish 1 B']);
      } finally {
        reopened.close();
      }
    } finally {
      for (const file of [path, `${path}-shm`, `${path}-wal`]) {
        await Deno.remove(file).catch(() => {});
      }
    }
  });

  await context.step('the packets of another Client Identifier are not seen, nor removed by clear', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      const storeA = kvStore(kv, 'clientA');
      const storeB = kvStore(kv, 'clientB');
      await storeA.store(publishPacket(1, 'A'));
      await storeB.store(publishPacket(1, 'B'));
      await storeB.store(publishPacket(2, 'C'));
      assertEquals(await resendOrder(storeA), ['publish 1 A']);
      assertEquals(await resendOrder(storeB), ['publish 1 B', 'publish 2 C']);

      await storeB.clear();
      assertEquals(await storeA.count(), 1);
      assertEquals(await resendOrder(storeA), ['publish 1 A']);
      assertEquals(await keys(kv), [['mqtt5', 'clientA', 'outgoing', 1]]);
    } finally {
      kv.close();
    }
  });

  await context.step('the keys start with the prefix option', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      const store = kvStore(kv, 'cid', { prefix: ['myapp', 'mqtt'] });
      await store.store(publishPacket(7, 'A'));
      assertEquals(await keys(kv), [['myapp', 'mqtt', 'cid', 'outgoing', 7]]);
    } finally {
      kv.close();
    }
  });

  await context.step('clear removes the packets a previous process left, before the store has read them', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      await kvStore(kv, 'cid').store(publishPacket(1, 'A'));
      const store = kvStore(kv, 'cid');
      await store.clear();
      assertEquals(await keys(kv), []);
      assertEquals(await store.count(), 0);
    } finally {
      kv.close();
    }
  });

  await context.step('a packet of maximumPacketSize bytes is kept, as MQTT 5.0 and as MQTT 3.1.1', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      const store = kvStore(kv, 'cid');
      assertEquals(store.maximumPacketSize, KvOutgoingStore.maximumPacketSize);

      // MQTT 5.0: the client checks the size of the bytes that are stored.
      const packet = publishPacketOfSize(store.maximumPacketSize);
      await store.store(packet);
      // MQTT 3.1.1: PUBLISH has no properties, and is one byte longer when it is stored.
      const v311 = { ...publishPacketOfSize(store.maximumPacketSize + 1), packetId: 2 };
      assertEquals(MqttPackets.packetToBytes(v311, Mqtt.ProtocolVersion.MQTT_V3_1_1).length, store.maximumPacketSize);
      await store.store(v311);

      const sizes: number[] = [];
      for await (const stored of store.resendIterator()) {
        sizes.push((stored as MqttPackets.PublishPacket).payload.length);
      }
      assertEquals(sizes, [packet.payload.length, v311.payload.length]);
    } finally {
      kv.close();
    }
  });

  await context.step('a packet too large for Deno KV is rejected and not stored', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      const store = kvStore(kv, 'cid');
      await assertRejects(() => store.store(publishPacketOfSize(store.maximumPacketSize + 2)), Error, 'Deno KV can keep');
      assertEquals(await store.count(), 0);
      assertEquals(await keys(kv), []);
      // the position was not used
      await store.store(publishPacket(1, 'A'));
      assertEquals(await resendOrder(store), ['publish 1 A']);
    } finally {
      kv.close();
    }
  });

  await context.step('the stored bytes are the MQTT 5.0 packet', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      const store = kvStore(kv, 'cid');
      const packet = publishPacket(1, 'A');
      await store.store(packet);
      const entry = await kv.get<{ seq: number; bytes: Uint8Array }>(['mqtt5', 'cid', 'outgoing', 1]);
      assertEquals(entry.value, { seq: 1, bytes: MqttPackets.packetToBytes(packet, Mqtt.ProtocolVersion.MQTT_V5) });
    } finally {
      kv.close();
    }
  });

  await context.step('entries that cannot be read are removed and do not stop the others from being resent', async () => {
    const kv = await Deno.openKv(':memory:');
    try {
      await kvStore(kv, 'cid').store(publishPacket(2, 'A'));
      const bytes = MqttPackets.packetToBytes(publishPacket(5, 'B'), Mqtt.ProtocolVersion.MQTT_V5);
      await kv.set(['mqtt5', 'cid', 'outgoing', 1], 'not an entry');
      await kv.set(['mqtt5', 'cid', 'outgoing', 3], { seq: 9, bytes: new Uint8Array([1, 2, 3]) }); // not a packet
      await kv.set(['mqtt5', 'cid', 'outgoing', 4], { seq: 9, bytes }); // the packet ID is not the one of the key
      await kv.set(['mqtt5', 'cid', 'outgoing', 6], { bytes }); // no seq
      await kv.set(['mqtt5', 'cid', 'outgoing', 'x'], { seq: 9, bytes });

      const logs: string[] = [];
      const store = kvStore(kv, 'cid', { logger: (msg) => logs.push(msg) });
      assertEquals(await resendOrder(store), ['publish 2 A']);
      assertEquals(await store.count(), 1);
      assertEquals(await keys(kv), [['mqtt5', 'cid', 'outgoing', 2]]);
      assertEquals(logs.length, 5);
    } finally {
      kv.close();
    }
  });

  await context.step('store and discard reject when the database is closed', async () => {
    const kv = await Deno.openKv(':memory:');
    const store = kvStore(kv, 'cid');
    await store.store(publishPacket(1, 'A'));
    kv.close();
    await assertRejects(() => store.store(publishPacket(2, 'B')));
    await assertRejects(() => store.discard(1));
    // what the store knows did not change
    assertEquals(await store.count(), 1);

    // a store that could not read the database at first
    const closed = await Deno.openKv(':memory:');
    closed.close();
    const unread = kvStore(closed, 'cid');
    await assertRejects(() => unread.count());
    await assertRejects(() => unread.store(publishPacket(1, 'A')));
  });
});

import { KvOutgoingStore, Mqtt, type MqttPackets, type Store } from '../../../deno/mod.ts';
import type { KvOutgoingStoreOptions } from '../../../deno/mod.ts';
import { assertEquals, assertRejects } from '@std/assert';

type StoredPacket = MqttPackets.PublishPacketWithId | MqttPackets.PubrelPacket;

export function publishPacket(
  packetId: number,
  payload: string,
  qos: MqttPackets.PublishPacketWithId['qos'] = Mqtt.QoS.AT_LEAST_ONCE,
): MqttPackets.PublishPacketWithId {
  return { type: 'publish', topic: 'topicA', payload: new TextEncoder().encode(payload), dup: false, retain: false, qos, packetId };
}

/** A {@link KvOutgoingStore} with the Client Identifier set, as a client does. */
export function kvStore(kv: Deno.Kv, clientId: string, options?: KvOutgoingStoreOptions): KvOutgoingStore {
  const store = new KvOutgoingStore(kv, options);
  store.setClientId(clientId);
  return store;
}

/** The stored packets in the order they are resent, e.g. `['publish 1 A', 'pubrel 2']`. */
export async function resendOrder(store: Store.OutgoingStore): Promise<string[]> {
  const order: string[] = [];
  for await (const packet of store.resendIterator()) {
    order.push(packet.type === 'publish' ? `publish ${packet.packetId} ${new TextDecoder().decode(packet.payload)}` : `pubrel ${packet.packetId}`);
  }
  return order;
}

/**
 * The tests every {@link Store.OutgoingStore} has to pass.
 * @param createStore creates an empty store. The returned `close` is called when the step ends.
 */
export async function testOutgoingStoreContract(
  context: Deno.TestContext,
  createStore: () => Promise<{ store: Store.OutgoingStore; close?: () => void }>,
): Promise<void> {
  async function step(name: string, fn: (store: Store.OutgoingStore) => Promise<void>) {
    await context.step(name, async () => {
      const { store, close } = await createStore();
      try {
        await fn(store);
      } finally {
        close?.();
      }
    });
  }

  await step('a stored packet is returned with the same content', async (store) => {
    const packet: MqttPackets.PublishPacketWithId = {
      type: 'publish',
      topic: 'topic/日本語',
      payload: new Uint8Array([0, 1, 2, 255]),
      dup: false,
      retain: true,
      qos: Mqtt.QoS.EXACTLY_ONCE,
      packetId: 10,
      properties: {
        payloadFormatIndicator: 1,
        messageExpiryInterval: 60,
        responseTopic: 'responseTopicA',
        correlationData: new Uint8Array([9, 8, 7]),
        userProperties: [{ key: 'k1', val: 'v1' }, { key: 'k1', val: 'v2' }],
        contentType: 'application/json',
      },
    };
    await store.store(packet);

    const resent: StoredPacket[] = [];
    for await (const stored of store.resendIterator()) {
      resent.push(stored);
    }
    assertEquals(resent, [packet]);
  });

  await step('packets are resent in the order they were stored, whatever their packet IDs', async (store) => {
    await store.store(publishPacket(3, 'A'));
    await store.store(publishPacket(1, 'B'));
    await store.store(publishPacket(65535, 'C'));
    await store.store(publishPacket(2, 'D'));
    assertEquals(await resendOrder(store), ['publish 3 A', 'publish 1 B', 'publish 65535 C', 'publish 2 D']);
  });

  await step('iterating again, after an iteration that was not finished, starts from the first packet', async (store) => {
    for (const [packetId, payload] of [[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D']] as const) {
      await store.store(publishPacket(packetId, payload));
    }
    for await (const _packet of store.resendIterator()) {
      break; // the resend is interrupted after 'A'
    }
    assertEquals(await resendOrder(store), ['publish 1 A', 'publish 2 B', 'publish 3 C', 'publish 4 D']);
    assertEquals(await resendOrder(store), ['publish 1 A', 'publish 2 B', 'publish 3 C', 'publish 4 D']);
  });

  await step('PUBREL replaces the PUBLISH of its packet ID and keeps its position', async (store) => {
    await store.store(publishPacket(1, 'A', Mqtt.QoS.EXACTLY_ONCE));
    await store.store(publishPacket(2, 'B', Mqtt.QoS.EXACTLY_ONCE));
    await store.store(publishPacket(3, 'C', Mqtt.QoS.EXACTLY_ONCE));
    await store.store({ type: 'pubrel', packetId: 2 });
    assertEquals(await resendOrder(store), ['publish 1 A', 'pubrel 2', 'publish 3 C']);
    assertEquals(await store.count(), 3);
  });

  await step('a packet ID stored again after it was removed goes to the end', async (store) => {
    await store.store(publishPacket(1, 'A'));
    await store.store(publishPacket(2, 'B'));
    await store.discard(1);
    await store.store(publishPacket(1, 'C'));
    assertEquals(await resendOrder(store), ['publish 2 B', 'publish 1 C']);
  });

  await step('discard removes a packet, and ignores a packet ID that is not stored', async (store) => {
    await store.store(publishPacket(1, 'A'));
    await store.store(publishPacket(2, 'B'));
    await store.discard(1);
    await store.discard(100);
    assertEquals(await resendOrder(store), ['publish 2 B']);
    assertEquals(await store.has(1), false);
    assertEquals(await store.has(2), true);
  });

  await step('count follows store, replace, discard and clear', async (store) => {
    assertEquals(await store.count(), 0);
    await store.store(publishPacket(1, 'A', Mqtt.QoS.EXACTLY_ONCE));
    await store.store(publishPacket(2, 'B'));
    assertEquals(await store.count(), 2);
    await store.store({ type: 'pubrel', packetId: 1 });
    assertEquals(await store.count(), 2);
    await store.discard(2);
    assertEquals(await store.count(), 1);
    await store.clear();
    assertEquals(await store.count(), 0);
  });

  await step('clear removes every packet', async (store) => {
    await store.store(publishPacket(1, 'A'));
    await store.store(publishPacket(2, 'B'));
    await store.clear();
    assertEquals(await resendOrder(store), []);
    assertEquals(await store.has(1), false);
    // the store can be used again
    await store.store(publishPacket(1, 'C'));
    assertEquals(await resendOrder(store), ['publish 1 C']);
  });

  await step('a packet without a packet ID is rejected', async (store) => {
    // The type does not allow it, but a JavaScript caller can pass one.
    await assertRejects(() => store.store({ ...publishPacket(1, 'A'), packetId: undefined } as unknown as StoredPacket));
    await assertRejects(() => store.store({ ...publishPacket(1, 'A'), packetId: 0 }));
    assertEquals(await store.count(), 0);
  });
}

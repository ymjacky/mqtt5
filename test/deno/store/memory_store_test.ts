import { MemoryStore } from '../../../lib/mqtt_store/mod.ts';
import { Mqtt } from '../../../lib/mod.ts';

import { assertEquals, assertFalse } from 'std/assert/mod.ts';

Deno.test({ name: '@MemoryStore', only: false }, async (context) => {
  await context.step(
    'store',
    async () => {
      const store: MemoryStore = new MemoryStore();

      await store.store(
        {
          type: 'publish',
          topic: 'topicA',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 1,
          properties: {},
        },
      );
    },
  );

  await context.step(
    'iterator',
    async () => {
      const store: MemoryStore = new MemoryStore();
      await store.store(
        {
          type: 'publish',
          topic: 'topicA',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 1,
          properties: {},
        },
      );

      await store.store(
        {
          type: 'publish',
          topic: 'topicA',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 2,
          properties: {},
        },
      );

      await store.store(
        {
          type: 'publish',
          topic: 'topicA',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 3,
          properties: {},
        },
      );

      let expectedPacketId = 1;
      const it = store.resendIterator();
      for await (const entry of it) {
        assertEquals(entry.packetId, expectedPacketId++);
      }
      assertEquals(4, expectedPacketId);
    },
  );

  await context.step(
    'discard',
    async () => {
      const store: MemoryStore = new MemoryStore();
      await store.store(
        {
          type: 'publish',
          topic: 'topicA',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 1,
          properties: {},
        },
      );

      await store.store(
        {
          type: 'publish',
          topic: 'topicB',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 2,
          properties: {},
        },
      );

      await store.store(
        {
          type: 'publish',
          topic: 'topicC',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 3,
          properties: {},
        },
      );

      assertEquals(await store.count(), 3);

      await store.discard(2);
      assertEquals(await store.count(), 2);
      assertFalse(await store.has(2));

      const packetIds: number[] = [];
      for await (const packet of store.resendIterator()) {
        packetIds.push(packet.packetId!);
      }

      assertEquals(packetIds.sort(), [1, 3]);
    },
  );

  await context.step(
    'clear',
    async () => {
      const store: MemoryStore = new MemoryStore();

      await store.store(
        {
          type: 'publish',
          topic: 'topicA',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 1,
          properties: {},
        },
      );

      await store.store(
        {
          type: 'publish',
          topic: 'topicB',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 2,
          properties: {},
        },
      );

      assertEquals(await store.count(), 2);

      await store.clear();

      assertEquals(await store.count(), 0);

      let packetCount = 0;
      for await (const _packet of store.resendIterator()) {
        packetCount++;
      }
      assertEquals(packetCount, 0);
    },
  );

  await context.step(
    'count',
    async () => {
      const store: MemoryStore = new MemoryStore();

      assertEquals(await store.count(), 0);

      await store.store(
        {
          type: 'publish',
          topic: 'topicA',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 1,
          properties: {},
        },
      );
      assertEquals(await store.count(), 1);

      await store.store(
        {
          type: 'publish',
          topic: 'topicB',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 2,
          properties: {},
        },
      );
      assertEquals(await store.count(), 2);

      await store.discard(1);
      assertEquals(await store.count(), 1);
    },
  );

  await context.step(
    'has',
    async () => {
      const store: MemoryStore = new MemoryStore();

      assertFalse(await store.has(1));

      await store.store(
        {
          type: 'publish',
          topic: 'topicA',
          payload: new TextEncoder().encode('payload'),
          dup: false,
          retain: false,
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          packetId: 1,
          properties: {},
        },
      );

      assertEquals(await store.has(1), true);

      assertFalse(await store.has(2));
    },
  );

  await context.step(
    'pubrel packet',
    async () => {
      const store: MemoryStore = new MemoryStore();

      await store.store(
        {
          type: 'pubrel',
          packetId: 1,
          reasonCode: Mqtt.ReasonCode.Success,
          properties: {},
        },
      );

      assertEquals(await store.count(), 1);
      assertEquals(await store.has(1), true);

      for await (const packet of store.resendIterator()) {
        assertEquals(packet.type, 'pubrel');
        assertEquals(packet.packetId, 1);
      }

      await store.discard(1);
      assertEquals(await store.count(), 0);
    },
  );
});

import { MemoryStore } from '../../../lib/mqtt_store/mod.ts';
import { Mqtt } from '../../../lib/mod.ts';

import { assertEquals } from 'std/assert/mod.ts';

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
});

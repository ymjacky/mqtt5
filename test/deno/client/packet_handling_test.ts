import { Mqtt, MqttClient, Store } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

// An IncomingStore whose store() completes asynchronously after a delay, like
// a persistent store backed by a database.
class SlowIncomingStore implements Store.IncomingStore {
  packets = new Set<number>();
  timers = new Set<ReturnType<typeof setTimeout>>();

  store(packetId: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.packets.add(packetId);
        resolve();
      }, 50);
      this.timers.add(timer);
    });
  }
  has(packetId: number): Promise<boolean> {
    return Promise.resolve(this.packets.has(packetId));
  }
  discard(packetId: number): Promise<void> {
    this.packets.delete(packetId);
    return Promise.resolve();
  }
  clear() {
    this.timers.forEach((timer) => clearTimeout(timer));
  }
}

// An IncomingStore whose has() always fails.
class FailingIncomingStore implements Store.IncomingStore {
  store(_packetId: number): Promise<void> {
    return Promise.resolve();
  }
  has(_packetId: number): Promise<boolean> {
    return Promise.reject(new Error('store failure'));
  }
  discard(_packetId: number): Promise<void> {
    return Promise.resolve();
  }
}

// Regression tests for received packets being handled concurrently, without
// awaiting the async handlers (see issue #15).
Deno.test({ name: '@packet handling', only: false }, async (context) => {
  await context.step(
    'packets are handled in the order they arrived',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();
      const incomingStore = new SlowIncomingStore();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 10,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
          incomingStore,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, true, packet.protocolVersion);
        });

        await client.connect();

        broker.on('pubcomp', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          // The PUBREL must be handled after the PUBLISH has been stored.
          // An omitted Reason Code means Success.
          assertEquals(packet.reasonCode ?? Mqtt.ReasonCode.Success, Mqtt.ReasonCode.Success);
          resolve();
        });

        // Send PUBREL right after PUBLISH without waiting for PUBREC.
        await broker.sendPublish(
          client.getClientId(),
          1,
          'topicA',
          Mqtt.ProtocolVersion.MQTT_V5,
          new TextEncoder().encode('payload A'),
          Mqtt.QoS.EXACTLY_ONCE,
        );
        await broker.sendPubrel(client.getClientId(), 1, Mqtt.ProtocolVersion.MQTT_V5);

        await promise;
        await client.disconnect();
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        incomingStore.clear();
        await broker.destroy();
      }
    },
  );

  await context.step(
    'a failure in a packet handler does not cause an unhandled rejection',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 10,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
          incomingStore: new FailingIncomingStore(),
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, true, packet.protocolVersion);
        });

        await client.connect();

        // The client keeps working after the handler failure.
        client.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.topic, 'topicB');
          resolve();
        });

        // handlePubrel() fails because incomingStore.has() rejects.
        await broker.sendPubrel(client.getClientId(), 1, Mqtt.ProtocolVersion.MQTT_V5);
        await broker.sendPublish(
          client.getClientId(),
          0,
          'topicB',
          Mqtt.ProtocolVersion.MQTT_V5,
          new TextEncoder().encode('payload B'),
          Mqtt.QoS.AT_MOST_ONCE,
        );

        await promise;
        await client.disconnect();
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
});

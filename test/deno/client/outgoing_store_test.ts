import { Mqtt, MqttClient, MqttPackets, Store } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertRejects, fail } from '@std/assert';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean) {
  while (!condition()) {
    await delay(10);
  }
}

// Rejects if the promise does not settle within `ms`, instead of letting the test hang.
async function settleWithin<T>(promise: Promise<T>, label: string, ms = 1000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function connectBroker(broker: TestBroker) {
  broker.listen();
  broker.on('connect', (event) => {
    const packet = event.detail;
    broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success);
  });
}

Deno.test({ name: '@slow outgoing store', only: false }, async (context) => {
  for (
    const [ending, qos] of [
      ['PUBACK', Mqtt.QoS.AT_LEAST_ONCE],
      ['PUBCOMP', Mqtt.QoS.EXACTLY_ONCE],
      ['PUBREC with an error Reason Code', Mqtt.QoS.EXACTLY_ONCE],
    ] as const
  ) {
    await context.step(
      `a publish() while a flow ending with ${ending} is removed from the store does not reuse its packet ID`,
      async () => {
        // Removing a packet from the store takes time.
        const discardStarted = Promise.withResolvers<void>();
        class SlowDiscardStore extends Store.MemoryStore {
          override async discard(packetId: number): Promise<void> {
            discardStarted.resolve();
            await delay(100);
            return super.discard(packetId);
          }
        }
        const store = new SlowDiscardStore();

        const broker = new TestBroker();
        try {
          connectBroker(broker);
          // Ends the flow of 'A' only. 'B' is acknowledged later by the test.
          const received: { message: string; packetId?: number }[] = [];
          broker.on('publish', (event) => {
            const packet = event.detail;
            const message = new TextDecoder().decode(packet.payload);
            received.push({ message, packetId: packet.packetId });
            if (message !== 'A') {
              return;
            }
            if (ending === 'PUBACK') {
              broker.sendPuback('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
            } else if (ending === 'PUBCOMP') {
              broker.sendPubrec('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
            } else {
              broker.sendPubrec('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5, Mqtt.ReasonCode.UnspecifiedError);
            }
          });
          broker.on('pubrel', (event) => {
            broker.sendPubcomp('cid', event.detail.packetId, Mqtt.ProtocolVersion.MQTT_V5);
          });

          const client = new MqttClient({ clientId: 'cid', logger: logger, clean: false, outgoingStore: store });
          await client.connect();

          const a = client.publish('topicA', 'A', { qos });
          await discardStarted.promise; // the flow of 'A' is ending
          const b = client.publish('topicA', 'B', { qos: Mqtt.QoS.AT_LEAST_ONCE });

          const expected = ending === 'PUBREC with an error Reason Code' ? Mqtt.ReasonCode.UnspecifiedError : Mqtt.ReasonCode.Success;
          assertEquals((await settleWithin(a, "publish() of 'A'")).result, expected);

          // 'B' did not get the packet ID of 'A' and is still waiting for its PUBACK.
          await waitFor(() => received.length === 2);
          assertEquals(received, [{ message: 'A', packetId: 1 }, { message: 'B', packetId: 2 }]);
          assertEquals(await client.publishInflightCount(), 1);

          broker.sendPuback('cid', 2, Mqtt.ProtocolVersion.MQTT_V5);
          assertEquals((await settleWithin(b, "publish() of 'B'")).result, Mqtt.ReasonCode.Success);
          assertEquals(await client.publishInflightCount(), 0);

          await client.disconnect();
        } catch (err) {
          fail(`error occured: ${err}`);
        } finally {
          await broker.destroy();
        }
      },
    );
  }

  await context.step(
    'PUBREL is sent after it is stored, and is not left in the store after PUBCOMP',
    async () => {
      const events: string[] = [];
      // Storing PUBREL takes time.
      class SlowPubrelStore extends Store.MemoryStore {
        override async store(packet: MqttPackets.PublishPacket | MqttPackets.PubrelPacket): Promise<void> {
          if (packet.type === 'pubrel') {
            await delay(100);
          }
          await super.store(packet);
          events.push(`stored ${packet.type.toUpperCase()}`);
        }
      }

      const broker = new TestBroker();
      try {
        connectBroker(broker);
        broker.on('publish', (event) => {
          events.push('broker received PUBLISH');
          broker.sendPubrec('cid', event.detail.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
        });
        broker.on('pubrel', (event) => {
          events.push('broker received PUBREL');
          broker.sendPubcomp('cid', event.detail.packetId, Mqtt.ProtocolVersion.MQTT_V5);
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger, clean: false, outgoingStore: new SlowPubrelStore() });
        await client.connect();

        const result = await settleWithin(client.publish('topicA', 'A', { qos: Mqtt.QoS.EXACTLY_ONCE }), 'publish()');
        assertEquals(result.result, Mqtt.ReasonCode.Success);

        await waitFor(() => events.length === 4);
        assertEquals(events, ['stored PUBLISH', 'broker received PUBLISH', 'stored PUBREL', 'broker received PUBREL']);
        assertEquals(await client.publishInflightCount(), 0);

        await client.disconnect();
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @slow outgoing store

Deno.test({ name: '@failing outgoing store', only: false }, async (context) => {
  await context.step(
    'a PUBLISH that cannot be stored is not sent, publish() rejects, and its packet ID is released',
    async () => {
      // Fails to store the PUBLISH with the payload 'A'.
      class FailingStore extends Store.MemoryStore {
        override store(packet: MqttPackets.PublishPacket | MqttPackets.PubrelPacket): Promise<void> {
          if (packet.type === 'publish' && new TextDecoder().decode(packet.payload) === 'A') {
            return Promise.reject(new Error('store failed'));
          }
          return super.store(packet);
        }
      }

      const broker = new TestBroker();
      try {
        connectBroker(broker);
        const received: { message: string; packetId?: number }[] = [];
        broker.on('publish', (event) => {
          const packet = event.detail;
          received.push({ message: new TextDecoder().decode(packet.payload), packetId: packet.packetId });
          broker.sendPuback('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger, clean: false, outgoingStore: new FailingStore() });
        await client.connect();

        await assertRejects(() => client.publish('topicA', 'A', { qos: Mqtt.QoS.AT_LEAST_ONCE }), Error, 'store failed');
        assertEquals(await client.publishInflightCount(), 0);

        // The packet ID of 'A' is free again.
        const result = await settleWithin(client.publish('topicA', 'B', { qos: Mqtt.QoS.AT_LEAST_ONCE }), "publish() of 'B'");
        assertEquals(result.result, Mqtt.ReasonCode.Success);
        assertEquals(received, [{ message: 'B', packetId: 1 }]);

        await client.disconnect();
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'when PUBREL cannot be stored, the connection is closed, and the flow completes after reconnecting',
    async () => {
      // Fails to store PUBREL the first time.
      let pubrelFailures = 0;
      class FailingPubrelStore extends Store.MemoryStore {
        override store(packet: MqttPackets.PublishPacket | MqttPackets.PubrelPacket): Promise<void> {
          if (packet.type === 'pubrel' && pubrelFailures++ === 0) {
            return Promise.reject(new Error('store failed'));
          }
          return super.store(packet);
        }
      }

      const broker = new TestBroker();
      try {
        broker.listen();
        // The broker keeps the session.
        let connectCount = 0;
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, connectCount++ > 0, packet.protocolVersion, Mqtt.ReasonCode.Success);
        });
        const received: string[] = [];
        broker.on('publish', (event) => {
          const packet = event.detail;
          received.push(`PUBLISH dup=${packet.dup}`);
          broker.sendPubrec('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
        });
        broker.on('pubrel', (event) => {
          received.push('PUBREL');
          broker.sendPubcomp('cid', event.detail.packetId, Mqtt.ProtocolVersion.MQTT_V5);
        });
        broker.on('disconnect', (event) => {
          received.push(`DISCONNECT reasonCode=${event.detail.reasonCode}`);
        });

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          outgoingStore: new FailingPubrelStore(),
          disconnectTimeoutMS: 100,
        });
        const closed = Promise.withResolvers<void>();
        client.on('closed', () => closed.resolve());
        await client.connect();

        const publishing = client.publish('topicA', 'A', { qos: Mqtt.QoS.EXACTLY_ONCE });
        await settleWithin(closed.promise, 'the connection');
        assertEquals(received, ['PUBLISH dup=false', `DISCONNECT reasonCode=${Mqtt.ReasonCode.UnspecifiedError}`]);

        // After reconnecting, PUBLISH is resent, and PUBREL is stored and sent for the PUBREC.
        await client.connect();
        assertEquals((await settleWithin(publishing, 'publish()')).result, Mqtt.ReasonCode.Success);
        assertEquals(received, [
          'PUBLISH dup=false',
          `DISCONNECT reasonCode=${Mqtt.ReasonCode.UnspecifiedError}`,
          'PUBLISH dup=true',
          'PUBREL',
        ]);
        assertEquals(await client.publishInflightCount(), 0);

        await client.disconnect();
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  const disconnected = `DISCONNECT reasonCode=${Mqtt.ReasonCode.UnspecifiedError}`;
  for (
    const [ending, qos, expected] of [
      ['PUBACK', Mqtt.QoS.AT_LEAST_ONCE, ['PUBLISH dup=false', disconnected, 'PUBLISH dup=true']],
      ['PUBCOMP', Mqtt.QoS.EXACTLY_ONCE, ['PUBLISH dup=false', 'PUBREL', disconnected, 'PUBREL']],
      ['PUBREC with an error Reason Code', Mqtt.QoS.EXACTLY_ONCE, ['PUBLISH dup=false', disconnected, 'PUBLISH dup=true']],
    ] as const
  ) {
    await context.step(
      `when the flow cannot be removed from the store on ${ending}, the connection is closed, and the flow completes after reconnecting`,
      async () => {
        // Fails to remove a packet the first time.
        let discardFailures = 0;
        class FailingDiscardStore extends Store.MemoryStore {
          override discard(packetId: number): Promise<void> {
            if (discardFailures++ === 0) {
              return Promise.reject(new Error('discard failed'));
            }
            return super.discard(packetId);
          }
        }

        const broker = new TestBroker();
        try {
          broker.listen();
          // The broker keeps the session.
          let connectCount = 0;
          broker.on('connect', (event) => {
            const packet = event.detail;
            broker.sendConnack(packet.clientId, connectCount++ > 0, packet.protocolVersion, Mqtt.ReasonCode.Success);
          });
          const received: string[] = [];
          broker.on('publish', (event) => {
            const packet = event.detail;
            received.push(`PUBLISH dup=${packet.dup}`);
            if (ending === 'PUBACK') {
              broker.sendPuback('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
            } else if (ending === 'PUBCOMP') {
              broker.sendPubrec('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
            } else {
              broker.sendPubrec('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5, Mqtt.ReasonCode.UnspecifiedError);
            }
          });
          broker.on('pubrel', (event) => {
            received.push('PUBREL');
            broker.sendPubcomp('cid', event.detail.packetId, Mqtt.ProtocolVersion.MQTT_V5);
          });
          broker.on('disconnect', (event) => {
            received.push(`DISCONNECT reasonCode=${event.detail.reasonCode}`);
          });

          const client = new MqttClient({
            clientId: 'cid',
            logger: logger,
            clean: false,
            outgoingStore: new FailingDiscardStore(),
            disconnectTimeoutMS: 100,
          });
          const closed = Promise.withResolvers<void>();
          client.on('closed', () => closed.resolve());
          await client.connect();

          // The acknowledgment is handled as not received: publish() keeps waiting.
          const publishing = client.publish('topicA', 'A', { qos });
          await settleWithin(closed.promise, 'the connection');
          assertEquals(await client.publishInflightCount(), 1);

          // After reconnecting, the stored packet is resent and acknowledged again.
          await client.connect();
          const result = ending === 'PUBREC with an error Reason Code' ? Mqtt.ReasonCode.UnspecifiedError : Mqtt.ReasonCode.Success;
          assertEquals((await settleWithin(publishing, 'publish()')).result, result);
          assertEquals(received, [...expected]);
          assertEquals(await client.publishInflightCount(), 0);

          await client.disconnect();
        } catch (err) {
          fail(`error occured: ${err}`);
        } finally {
          await broker.destroy();
        }
      },
    );
  }
}); // @failing outgoing store

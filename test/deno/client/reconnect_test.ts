import { ClientErrors, Mqtt, MqttClient, MqttPackets } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertExists, assertInstanceOf, assertRejects, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@reconnect', only: false }, async (context) => {
  await context.step(
    'reconnect',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      const broker = new TestBroker();
      try {
        broker.listen();

        const firstConnack = (event: CustomEvent<MqttPackets.ConnectPacket>) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success);
        };
        broker.on('connect', firstConnack);

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        await client.connect();
        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        await client.disconnect();
        await client.connect();
        await client.disconnect();
        resolve();

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'reconnect, sessionPresent true',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();

        const firstConnack = (event: CustomEvent<MqttPackets.ConnectPacket>) => {
          const packet = event.detail;
          if (packet.clean) {
            broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success);
          } else {
            broker.sendConnack(packet.clientId, true, packet.protocolVersion, Mqtt.ReasonCode.Success);
          }
        };
        broker.on('connect', firstConnack);

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        await client.connect().then((connack) => {
          assertEquals(connack.sessionPresent, false);
        });
        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        await client.disconnect();

        await client.connect({ clean: false }).then((connack) => {
          assertEquals(connack.sessionPresent, true);
        });
        await client.disconnect();
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  for (const sessionPresent of [false, true]) {
    await context.step(
      `connection closed before SUBACK / UNSUBACK, sessionPresent ${sessionPresent}`,
      async () => {
        const broker = new TestBroker();
        let timer: ReturnType<typeof setTimeout> | undefined;

        try {
          broker.listen();

          const client = new MqttClient({
            clientId: 'cid',
            logger: logger,
            clean: !sessionPresent,
            connectTimeoutMS: 10000,
            keepAlive: 10,
          });

          let connectCount = 0;
          broker.on('connect', (event) => {
            const packet = event.detail;
            connectCount++;
            broker.sendConnack(packet.clientId, sessionPresent && connectCount > 1, packet.protocolVersion);
          });

          await client.connect();

          // the broker does not acknowledge anything
          const packetIds: number[] = [];
          broker.on('subscribe', (event) => {
            packetIds.push(event.detail.packetId);
          });
          broker.on('unsubscribe', (event) => {
            packetIds.push(event.detail.packetId);
          });

          const settled = (promise: Promise<unknown>) => promise.then(() => 'resolved', (err) => err);
          const results = Promise.all([
            settled(client.subscribe('topicA')),
            settled(client.unsubscribe('topicB')),
          ]);

          while (packetIds.length < 2) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          const closed = Promise.withResolvers<void>();
          client.on('closed', () => closed.resolve());
          await broker.closeConnectionFromBroker(client.getClientId());
          await closed.promise;

          // rejected when the connection is closed, without waiting for a reconnect
          const timeout = new Promise<string[]>((resolve) => {
            timer = setTimeout(() => resolve(['timeout']), 3000);
          });
          for (const result of await Promise.race([results, timeout])) {
            assertInstanceOf(result, ClientErrors.ConnectionClosed);
          }

          // the packet IDs are released
          await client.connect();
          client.subscribe('topicC'); // ignored on purpose: rejected by disconnect() without an unhandled rejection
          while (packetIds.length < 3) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          assertEquals(packetIds, [1, 2, 1]);

          await client.disconnect();
        } catch (err) {
          fail(`error occured: ${err}`);
        } finally {
          clearTimeout(timer);
          await broker.destroy();
        }
      },
    );
  }

  await context.step(
    'reconnect, sessionPresent false rejects publish waiting for an acknowledgment',
    async () => {
      const broker = new TestBroker();
      let timer: ReturnType<typeof setTimeout> | undefined;

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        // the broker does not acknowledge anything
        let received = 0;
        broker.on('publish', () => {
          received++;
        });

        const settled = (promise: Promise<unknown>) => promise.then(() => 'resolved', (err) => err);
        const results = Promise.all([
          settled(client.publish('topicA', 'qos1', { qos: Mqtt.QoS.AT_LEAST_ONCE })),
          settled(client.publish('topicA', 'qos2', { qos: Mqtt.QoS.EXACTLY_ONCE })),
        ]);
        client.publish('topicA', 'ignored', { qos: Mqtt.QoS.AT_LEAST_ONCE }); // ignored on purpose: no unhandled rejection

        while (received < 3) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        const closed = Promise.withResolvers<void>();
        client.on('closed', () => closed.resolve());
        await broker.closeConnectionFromBroker(client.getClientId());
        await closed.promise;

        await client.connect(); // CONNACK Session Present is 0

        const timeout = new Promise<string[]>((resolve) => {
          timer = setTimeout(() => resolve(['timeout']), 3000);
        });
        for (const result of await Promise.race([results, timeout])) {
          assertInstanceOf(result, ClientErrors.SessionLostError);
        }
        assertEquals(await client.publishInflightCount(), 0);

        await client.disconnect();
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        clearTimeout(timer);
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe and unsubscribe while not connected are rejected without using a packet ID',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        const connect = Promise.withResolvers<MqttPackets.ConnectPacket>();
        broker.on('connect', (event) => {
          connect.resolve(event.detail);
        });

        // offline
        await assertRejects(() => client.subscribe('topicA'), ClientErrors.StateIsNotOnlineError);
        await assertRejects(() => client.unsubscribe('topicA'), ClientErrors.StateIsNotOnlineError);

        // connecting: CONNACK has not been received yet
        const connected = client.connect();
        const connectPacket = await connect.promise;
        await assertRejects(() => client.subscribe('topicA'), ClientErrors.StateIsNotOnlineError);
        await assertRejects(() => client.unsubscribe('topicA'), ClientErrors.StateIsNotOnlineError);

        // Session Present 1 keeps the packet IDs in use, so a leaked ID would not be reused
        broker.sendConnack(connectPacket.clientId, true, connectPacket.protocolVersion);
        await connected;

        const { promise, resolve } = Promise.withResolvers<number>();
        broker.on('subscribe', (event) => {
          resolve(event.detail.packetId);
        });
        client.subscribe('topicB'); // ignored on purpose: rejected by disconnect() without an unhandled rejection
        assertEquals(await promise, 1);

        await client.disconnect();
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @reconnect

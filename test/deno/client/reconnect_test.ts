import { Mqtt, MqttClient, MqttPackets } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertExists, fail } from 'std/assert/mod.ts';

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
        broker.startRead(client.getClientId());
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
        broker.startRead(client.getClientId());
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
}); // @reconnect

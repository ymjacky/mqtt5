import { Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@connack reaction', only: false }, async (context) => {
  await context.step(
    'Assigned Client Identifier',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;

          const connackProperties: MqttProperties.ConnackProperties = {
            assignedClientIdentifier: 'generated_cid',
          };
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success, connackProperties);
        });

        const client = new MqttClient({
          clientId: undefined,
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        const connack = await client.connect();
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
        assertEquals(connack.properties?.assignedClientIdentifier, 'generated_cid');
        assertEquals(client.getClientId(), 'generated_cid');
      } catch (err) {
        fail(err);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'server keep alive',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestBroker();
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          assertEquals(packet.keepAlive, 10);
          const connackProperties: MqttProperties.ConnackProperties = {
            serverKeepAlive: 3,
          };
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success, connackProperties);
        });

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        const connack = await client.connect();
        assertEquals(connack.properties?.serverKeepAlive, 3);

        broker.startRead(client.getClientId());

        const timerId = setTimeout(() => {
          reject();
        }, 10 * 1000);
        broker.on('pingreq', () => {
          clearTimeout(timerId);
          resolve();
        });

        await promise;
      } catch (err) {
        fail(err);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @connack reaction

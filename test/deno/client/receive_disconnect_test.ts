import { Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@receive disconnect', only: false }, async (context) => {
  await context.step(
    'receive disconnect',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestBroker();

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
        broker.startRead(client.getClientId());

        const properties: MqttProperties.DisconnectProperties = {
          reasonString: 'trouble',
          sessionExpiryInterval: 300,
        };

        client.on('disconnect', (event) => {
          const packet = event.detail;
          assertEquals(packet.reasonCode, Mqtt.ReasonCode.ServerShuttingDown);
          assertEquals(packet.properties?.reasonString, 'trouble');
          assertEquals(packet.properties?.sessionExpiryInterval, 300);
          resolve();
        });
        await broker.sendDisconnect('cid', Mqtt.ReasonCode.ServerShuttingDown, properties);

        await promise;
      } catch (err) {
        reject();
        fail(err);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // disconnect

import { Mqtt, MqttProperties, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@receive disconnect', only: false }, async (context) => {
  await context.step(
    'receive disconnect',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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

        const properties: MqttProperties.DisconnectProperties = {
          reasonString: 'trouble',
          sessionExpiryInterval: 300,
        };

        client.on('disconnect', (event) => {
          const packet = event.detail;
          assertEquals(packet.reasonCode, Mqtt.ReasonCode.ServerShuttingDown);
          assertEquals(packet.properties?.reasonString, 'trouble');
          assertEquals(packet.properties?.sessionExpiryInterval, 300);
        });

        client.on('closed', () => {
          resolve();
        });

        await broker.sendDisconnect('cid', Mqtt.ReasonCode.ServerShuttingDown, properties);

        await promise;
      } catch (err) {
        reject();
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // disconnect

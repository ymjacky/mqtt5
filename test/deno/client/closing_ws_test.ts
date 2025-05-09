import { MqttProperties, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assertEquals, assertExists, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@closing', only: false }, async (context) => {
  await context.step(
    'disconnect',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          resolve();
        });
        await client.disconnect();

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect, wait closed',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        client.on('closed', () => {
          resolve();
        });
        await client.disconnect();

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect, close myself',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
        });

        client.on('closed', () => {
          resolve();
        });
        await client.disconnect();

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect with properties',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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
        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertEquals(packet.properties?.reasonString, 'trouble');
          assertEquals(packet.properties?.sessionExpiryInterval, 300);
          resolve();
        });
        await client.disconnect(false, properties);

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect force',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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

        broker.on('closed', () => {
          resolve();
        });
        await client.disconnect(true);

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // closing

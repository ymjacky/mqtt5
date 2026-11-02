import { MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertExists, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@closing', only: false }, async (context) => {
  await context.step(
    'disconnect',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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

  await context.step(
    'disconnect twice',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          resolve();
        });
        client.disconnect();

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect called concurrently',
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

        let disconnectCount = 0;
        broker.on('disconnect', () => {
          disconnectCount++;
          broker.closeConnectionFromBroker('cid');
        });

        const timeout = new Promise<string>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), 3000);
        });
        const result = await Promise.race([
          Promise.all([client.disconnect(), client.disconnect()]).then(() => 'resolved'),
          timeout,
        ]);

        // both calls resolve when the connection is closed, and DISCONNECT is sent only once
        assertEquals(result, 'resolved');
        assertEquals(disconnectCount, 1);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        clearTimeout(timer);
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect force while a disconnect is in progress',
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
          disconnectTimeoutMS: 10000,
          keepAlive: 10,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        // the broker does not close the connection after DISCONNECT
        let disconnectCount = 0;
        const received = Promise.withResolvers<void>();
        broker.on('disconnect', () => {
          disconnectCount++;
          received.resolve();
        });

        const first = client.disconnect();
        await received.promise;

        const timeout = new Promise<string>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), 3000);
        });
        const result = await Promise.race([
          Promise.all([first, client.disconnect(true)]).then(() => 'resolved'),
          timeout,
        ]);

        // force closes the connection without waiting for disconnectTimeoutMS
        assertEquals(result, 'resolved');
        assertEquals(disconnectCount, 1);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        clearTimeout(timer);
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect while connecting',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      let succeeded = false;
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

        const properties: MqttProperties.DisconnectProperties = {
          reasonString: 'trouble',
          sessionExpiryInterval: 300,
        };

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertEquals(packet.properties?.reasonString, 'trouble');
          assertEquals(packet.properties?.sessionExpiryInterval, 300);
          succeeded = true;
          resolve();
        });
        broker.on('connect', (event) => {
          const packet = event.detail;
          client.disconnect(false, properties);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        client.on('closed', () => {
          if (!succeeded) {
            reject('Disconnect packet has not been verified');
          }
        });
        client.connect();

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // closing

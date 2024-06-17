import { MqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@send topic alias', only: false }, async (context) => {
  await context.step(
    'send publish using topic alias ',
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
          topicAliasMaximumAboutSend: 3,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        broker.on('publish', (event) => {
          const packet = event.detail;
          const message = new TextDecoder().decode(packet.payload);
          if (message === '1st') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 1);
          } else if (message === '2nd') {
            assertEquals(packet.topic, ''); // It should be empty.
            assertEquals(packet.properties?.topicAlias, 1);
          } else {
            assertEquals(message, '3rd'); // It should be empty.
            assertEquals(packet.topic, ''); // It should be empty.
            assertEquals(packet.properties?.topicAlias, 1);
            resolve();
          }
        });

        await client.publish('topicA', new TextEncoder().encode('1st'));
        await client.publish('topicA', new TextEncoder().encode('2nd'));
        await client.publish('topicA', new TextEncoder().encode('3rd'));

        await promise;
      } catch (err) {
        reject();
        fail(err);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'send publish using topic alias, reach maximum',
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
          topicAliasMaximumAboutSend: 3,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        broker.on('publish', (event) => {
          const packet = event.detail;
          const message = new TextDecoder().decode(packet.payload);
          if (message === '1st') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 1);
          } else if (message === '2nd') {
            assertEquals(packet.topic, 'topicB');
            assertEquals(packet.properties?.topicAlias, 2);
          } else if (message === '3rd') {
            assertEquals(packet.topic, 'topicC');
            assertEquals(packet.properties?.topicAlias, 3);
          } else if (message === '4th') {
            assertEquals(packet.topic, 'topicD');
            assertEquals(packet.properties?.topicAlias, 1);
          } else if (message === '5th') {
            assertEquals(packet.topic, '');
            assertEquals(packet.properties?.topicAlias, 3);
          } else if (message === '6th') {
            assertEquals(packet.topic, '');
            assertEquals(packet.properties?.topicAlias, 1);
          } else if (message === '7th') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 2);
          } else {
            assertEquals(message, '8th');
            assertEquals(packet.topic, 'topicB');
            assertEquals(packet.properties?.topicAlias, 2);
            resolve();
          }
        });

        await client.publish('topicA', new TextEncoder().encode('1st')); // topic alias 1
        await client.publish('topicB', new TextEncoder().encode('2nd')); // topic alias 2
        await client.publish('topicC', new TextEncoder().encode('3rd')); // topic alias 3
        await client.publish('topicD', new TextEncoder().encode('4th')); // topic alias 1

        await client.publish('topicC', new TextEncoder().encode('5th')); // topic alias 3
        await client.publish('topicD', new TextEncoder().encode('6th')); // topic alias 1
        await client.publish('topicA', new TextEncoder().encode('7th')); // topic alias 2
        await client.publish('topicB', new TextEncoder().encode('8th')); // topic alias 2

        await promise;
      } catch (err) {
        reject();
        fail(err);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // topic alias

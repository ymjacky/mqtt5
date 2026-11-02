import { Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
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
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, 0, { topicAliasMaximum: 3 });
        });

        await client.connect();

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
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'send publish using topic alias, reach maximum (CONNACK Topic Alias Maximum is higher)',
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
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, 0, { topicAliasMaximum: 10 }); // higher than topicAliasMaximumAboutSend
        });

        await client.connect();

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
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  for (
    const [name, connackProperties] of [
      ['CONNACK has no Topic Alias Maximum', undefined],
      ['CONNACK Topic Alias Maximum is 0', { topicAliasMaximum: 0 }],
    ] as const
  ) {
    await context.step(
      `send publish without topic alias, ${name}`,
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
            broker.sendConnack(packet.clientId, false, packet.protocolVersion, 0, connackProperties);
          });

          await client.connect();

          broker.on('publish', (event) => {
            const packet = event.detail;
            const message = new TextDecoder().decode(packet.payload);
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, undefined);
            if (message === '2nd') {
              resolve();
            }
          });

          await client.publish('topicA', new TextEncoder().encode('1st'));
          await client.publish('topicA', new TextEncoder().encode('2nd'));

          await promise;
        } catch (err) {
          reject();
          fail(`error occured: ${err}`);
        } finally {
          await broker.destroy();
        }
      },
    );
  }

  await context.step(
    'send publish using topic alias, reach maximum (CONNACK Topic Alias Maximum is lower)',
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
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, 0, { topicAliasMaximum: 2 });
        });

        await client.connect();

        broker.on('publish', (event) => {
          const packet = event.detail;
          const message = new TextDecoder().decode(packet.payload);
          if (message === '1st') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 1);
          } else if (message === '2nd') {
            assertEquals(packet.topic, 'topicB');
            assertEquals(packet.properties?.topicAlias, 2);
          } else {
            assertEquals(message, '3rd');
            assertEquals(packet.topic, 'topicC');
            assertEquals(packet.properties?.topicAlias, 1);
            resolve();
          }
        });

        await client.publish('topicA', new TextEncoder().encode('1st')); // topic alias 1
        await client.publish('topicB', new TextEncoder().encode('2nd')); // topic alias 2
        await client.publish('topicC', new TextEncoder().encode('3rd')); // topic alias 1

        await promise;
      } catch (err) {
        reject();
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'send concurrent publishes sharing one properties object',
    async () => {
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
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, 0, { topicAliasMaximum: 3 });
        });

        await client.connect();

        const received: { topic: string; topicAlias?: number }[] = [];
        broker.on('publish', (event) => {
          const packet = event.detail;
          received.push({ topic: packet.topic, topicAlias: packet.properties?.topicAlias });
          broker.sendPuback('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
        });

        const properties: MqttProperties.UserPublishProperties = { contentType: 'text/plain' };
        await Promise.all([
          client.publish('topicA', new TextEncoder().encode('1st'), { qos: Mqtt.QoS.AT_LEAST_ONCE }, properties), // topic alias 1
          client.publish('topicB', new TextEncoder().encode('2nd'), { qos: Mqtt.QoS.AT_LEAST_ONCE }, properties), // topic alias 2
        ]);

        assertEquals(received, [
          { topic: 'topicA', topicAlias: 1 },
          { topic: 'topicB', topicAlias: 2 },
        ]);
        // the topic alias is not written into the caller's object
        assertEquals(properties, { contentType: 'text/plain' });

        await client.disconnect();
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'send publish without topic alias after reconnecting to a broker that does not allow it',
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
          topicAliasMaximumAboutSend: 3,
        });

        // The 1st connection allows topic aliases, the 2nd does not.
        let connectCount = 0;
        broker.on('connect', (event) => {
          const packet = event.detail;
          connectCount++;
          const connackProperties = connectCount === 1 ? { topicAliasMaximum: 3 } : undefined;
          broker.sendConnack(packet.clientId, connectCount > 1, packet.protocolVersion, 0, connackProperties);
        });

        await client.connect();

        const received: { message: string; topic: string; topicAlias?: number }[] = [];
        let sendPuback = true;
        broker.on('publish', (event) => {
          const packet = event.detail;
          const message = new TextDecoder().decode(packet.payload);
          received.push({ message, topic: packet.topic, topicAlias: packet.properties?.topicAlias });
          if (sendPuback) {
            broker.sendPuback('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
          }
        });

        const properties: MqttProperties.UserPublishProperties = { contentType: 'text/plain' };
        await client.publish('topicA', new TextEncoder().encode('1st'), { qos: Mqtt.QoS.AT_LEAST_ONCE }, properties); // topic alias 1

        // not acknowledged, so it is resent after reconnecting
        sendPuback = false;
        const pubResult = client.publish('topicB', new TextEncoder().encode('2nd'), { qos: Mqtt.QoS.AT_LEAST_ONCE }); // topic alias 2

        const closed = Promise.withResolvers<void>();
        client.on('closed', () => closed.resolve());
        while (received.length < 2) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await broker.closeConnectionFromBroker(client.getClientId());
        await closed.promise;

        sendPuback = true;
        await client.connect();
        assertEquals((await pubResult).result, Mqtt.ReasonCode.Success);
        await client.publish('topicC', new TextEncoder().encode('3rd'), { qos: Mqtt.QoS.AT_LEAST_ONCE }, properties);

        assertEquals(received, [
          { message: '1st', topic: 'topicA', topicAlias: 1 },
          { message: '2nd', topic: 'topicB', topicAlias: 2 },
          // topic aliases are valid only on the connection they were sent on
          { message: '2nd', topic: 'topicB', topicAlias: undefined },
          { message: '3rd', topic: 'topicC', topicAlias: undefined },
        ]);

        await client.disconnect();
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // topic alias

import { ClientErrors, Mqtt, MqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertRejects, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@will', only: false }, async (context) => {
  await context.step(
    'register will',
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
          assertEquals(packet.will?.retain, false);
          assertEquals(packet.will?.qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.will?.payload, new TextEncoder().encode('will-message'));
          assertEquals(
            packet.will?.properties?.userProperties,
            [
              { key: 'userProp1', val: 'userData1' },
            ],
          );
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
          resolve();
        });

        await client.connect(
          {
            will: {
              topic: 'topicA',
              qos: Mqtt.QoS.AT_LEAST_ONCE,
              payload: new TextEncoder().encode('will-message'),
              properties: { userProperties: [{ key: 'userProp1', val: 'userData1' }] },
            },
          },
        );

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'register will, MQTT V3.1.1',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertEquals(packet.will?.retain, true);
          assertEquals(packet.will?.qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.will?.payload, new TextEncoder().encode('will-message'));
          assertEquals(packet.will?.properties, undefined);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
          resolve();
        });

        await client.connect(
          {
            will: {
              retain: true,
              topic: 'topicA',
              qos: Mqtt.QoS.AT_LEAST_ONCE,
              payload: new TextEncoder().encode('will-message'),
            },
          },
        );

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'register will, topic only will',
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
          assertEquals(packet.will?.retain, false);
          assertEquals(packet.will?.qos, Mqtt.QoS.AT_MOST_ONCE);
          assertEquals(packet.will?.payload, new Uint8Array(0));
          assertEquals(packet.will?.properties, undefined);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
          resolve();
        });

        await client.connect(
          {
            will: {
              topic: 'topicA',
            },
          },
        );

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // will

Deno.test({ name: '@will invalid', only: false }, async (context) => {
  await context.step(
    'connect rejects an invalid will and opens no connection',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();

        const willTopics: (string | undefined)[] = [];
        broker.on('connect', (event) => {
          const packet = event.detail;
          willTopics.push(packet.will?.topic);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        const payload = new TextEncoder().encode('will-message');
        for (const topic of ['', 'a/+', 'a/#', 'a\u0000b']) {
          await assertRejects(() => client.connect({ will: { topic, payload } }), ClientErrors.InvalidTopicNameError);
        }
        await assertRejects(
          () => client.connect({ will: { topic: 'topicA', payload, properties: { responseTopic: 'response/#' } } }),
          ClientErrors.InvalidTopicNameError,
        );
        await assertRejects(
          () => client.connect({ will: { topic: 'topicA', qos: 3 as Mqtt.QoS, payload } }),
          ClientErrors.InvalidArgumentError,
        );
        await assertRejects(
          () => client.connect({ will: { topic: 'topicA', payload: new Uint8Array(65_536) } }),
          ClientErrors.InvalidArgumentError,
        );
        await assertRejects(
          () => client.connect({ will: { topic: 'topicA', payload, properties: { willDelayInterval: -1 } } }),
          ClientErrors.InvalidPropertyError,
        );
        await assertRejects(
          () => client.connect({ properties: { receiveMaximum: 0 }, will: { topic: 'topicA', payload } }),
          ClientErrors.InvalidPropertyError,
        );
        // An ignored rejection does not become an unhandled rejection.
        client.connect({ will: { topic: 'a/#', payload } });

        // The client stayed offline and sent nothing: the next valid connect is the first CONNECT.
        await client.connect({ will: { topic: 'topicA', payload } });
        assertEquals(willTopics, ['topicA']);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @will invalid

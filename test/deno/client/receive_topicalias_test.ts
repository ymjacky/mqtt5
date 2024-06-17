import { Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@receive topic alias', only: false }, async (context) => {
  await context.step(
    'receive publish with topic alias',
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
          topicAliasMaximumAboutReceive: 3,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertEquals(packet.properties?.topicAliasMaximum, 3);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        client.on('publish', (event) => {
          const packet = event.detail;
          const message = new TextDecoder().decode(packet.payload);
          if (message === '1st') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 1);
          } else if (message === '2nd') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 1);
          } else {
            assertEquals(message, '3rd');
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 1);
            resolve();
          }
        });

        const properties: MqttProperties.PublishProperties = {
          topicAlias: 1,
        };
        broker.sendPublish(
          client.getClientId(),
          0,
          'topicA',
          Mqtt.ProtocolVersion.MQTT_V5,
          new TextEncoder().encode('1st'),
          Mqtt.QoS.AT_MOST_ONCE,
          false,
          false,
          properties,
        );

        broker.sendPublish(
          client.getClientId(),
          0,
          '',
          Mqtt.ProtocolVersion.MQTT_V5,
          new TextEncoder().encode('2nd'),
          Mqtt.QoS.AT_MOST_ONCE,
          false,
          false,
          properties,
        );

        broker.sendPublish(
          client.getClientId(),
          0,
          '',
          Mqtt.ProtocolVersion.MQTT_V5,
          new TextEncoder().encode('3rd'),
          Mqtt.QoS.AT_MOST_ONCE,
          false,
          false,
          properties,
        );

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
    'receive publish with topic alias, overwrite ',
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
          topicAliasMaximumAboutReceive: 3,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertEquals(packet.properties?.topicAliasMaximum, 3);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        client.on('publish', (event) => {
          const packet = event.detail;
          const message = new TextDecoder().decode(packet.payload);
          if (message === '1st') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 1);
          } else if (message === '2nd') {
            assertEquals(packet.topic, 'topicB');
            assertEquals(packet.properties?.topicAlias, 1);
          } else if (message === '3rd') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 2);
          } else {
            assertEquals(message, '4th');
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 2);
            resolve();
          }
        });

        broker.sendPublish(
          client.getClientId(),
          0,
          'topicA',
          Mqtt.ProtocolVersion.MQTT_V5,
          new TextEncoder().encode('1st'),
          Mqtt.QoS.AT_MOST_ONCE,
          false,
          false,
          { topicAlias: 1 },
        );

        broker.sendPublish(
          client.getClientId(),
          0,
          'topicB',
          Mqtt.ProtocolVersion.MQTT_V5,
          new TextEncoder().encode('2nd'),
          Mqtt.QoS.AT_MOST_ONCE,
          false,
          false,
          { topicAlias: 1 },
        );

        broker.sendPublish(
          client.getClientId(),
          0,
          'topicA',
          Mqtt.ProtocolVersion.MQTT_V5,
          new TextEncoder().encode('3rd'),
          Mqtt.QoS.AT_MOST_ONCE,
          false,
          false,
          { topicAlias: 2 },
        );

        broker.sendPublish(
          client.getClientId(),
          0,
          '',
          Mqtt.ProtocolVersion.MQTT_V5,
          new TextEncoder().encode('4th'),
          Mqtt.QoS.AT_MOST_ONCE,
          false,
          false,
          { topicAlias: 2 },
        );

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

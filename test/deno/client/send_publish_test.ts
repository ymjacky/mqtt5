import { ClientErrors, ClientTypes, Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertRejects, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@publish_qos0', only: false }, async (context) => {
  await context.step(
    'publish mqtt v3.1.1',
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
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.AT_MOST_ONCE);
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);

          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          assertEquals(packet.properties, undefined);
          resolve();
        });
        await client.publish('topicA', new TextEncoder().encode('payloadA'));

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'publish byteArray',
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

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.AT_MOST_ONCE);
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);

          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          assertEquals(packet.properties, undefined);
          resolve();
        });
        await client.publish('topicA', new TextEncoder().encode('payloadA'));

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'publish string',
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

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.AT_MOST_ONCE);
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);

          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          assertEquals(packet.properties, undefined);
          resolve();
        });
        await client.publish('topicA', 'payloadA');

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'publish dup and retain',
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

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          // QoS 1: publish() rejects `dup: true` with QoS 0 ([MQTT-3.3.1-2]).
          assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.dup, true);
          assertEquals(packet.retain, true);

          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          assertEquals(packet.properties, undefined);
          broker.sendPuback('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
          resolve();
        });
        await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'), // payload
          {
            qos: Mqtt.QoS.AT_LEAST_ONCE,
            dup: true,
            retain: true,
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
    'publish with prpoerties',
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

        // test
        const properties: MqttProperties.UserPublishProperties = {
          payloadFormatIndicator: 1,
          messageExpiryInterval: 60,
          responseTopic: 'responseTopicA',
          correlationData: new TextEncoder().encode('correlationDataA'),
          userProperties: [
            { key: 'userProp1', val: 'userData1' },
            { key: 'userProp2', val: 'userData2' },
            { key: 'userProp2', val: 'userData3' },
          ],
          contentType: 'application/json',
        };

        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.AT_MOST_ONCE);

          assertEquals(packet.topic, 'topicA');
          assertEquals(
            packet.payload,
            new TextEncoder().encode('payloadA'),
          );

          assertEquals(packet.properties?.payloadFormatIndicator, 1);
          assertEquals(packet.properties?.messageExpiryInterval, 60);
          assertEquals(packet.properties?.responseTopic, 'responseTopicA');
          assertEquals(
            packet.properties?.correlationData,
            new TextEncoder().encode('correlationDataA'),
          );
          assertEquals(
            packet.properties?.userProperties,
            [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
          );
          assertEquals(packet.properties?.contentType, 'application/json');
          resolve();
        });

        await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          {},
          properties,
        );

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @publish_qos0

Deno.test({ name: '@publish_qos1', only: false }, async (context) => {
  await context.step(
    'publish mqtt v3.1.1',
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
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);
          assertEquals(packet.packetId, 1);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          assertEquals(packet.properties, undefined);

          broker.sendPuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
          );
          resolve();
        });
        const result: ClientTypes.PublishResult = await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          {
            qos: Mqtt.QoS.AT_LEAST_ONCE,
          },
        );
        assertEquals(result.result, 0); // 0 success

        assertEquals(await client.publishInflightCount(), 0);

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'publish v5.0',
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

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);
          assertEquals(packet.packetId, 1);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          assertEquals(packet.properties, undefined);

          broker.sendPuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
          );
          resolve();
        });
        const result = await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          { qos: Mqtt.QoS.AT_LEAST_ONCE },
        );
        assertEquals(result.result, Mqtt.ReasonCode.Success);
        assertEquals(result.reason, undefined);

        assertEquals(await client.publishInflightCount(), 0);
        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'publish v5.0 return error',
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

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);
          assertEquals(packet.packetId, 1);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          assertEquals(packet.properties, undefined);

          const pubAckProperties: MqttProperties.PubackProperties = {
            reasonString: 'Quota exceeded',
            userProperties: [{ key: 'userProp', val: 'userPropVal' }],
          };
          broker.sendPuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            Mqtt.ReasonCode.QuotaExceeded,
            pubAckProperties,
          );
          resolve();
        });
        const result = await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          { qos: Mqtt.QoS.AT_LEAST_ONCE },
        );
        assertEquals(result.result, Mqtt.ReasonCode.QuotaExceeded);
        assertEquals(result.reason, 'Quota exceeded');

        assertEquals(await client.publishInflightCount(), 0);

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'publish with prpoerties',
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

        // test
        const properties: MqttProperties.UserPublishProperties = {
          payloadFormatIndicator: 1,
          messageExpiryInterval: 60,
          responseTopic: 'responseTopicA',
          correlationData: new TextEncoder().encode('correlationDataA'),
          userProperties: [
            { key: 'userProp1', val: 'userData1' },
            { key: 'userProp2', val: 'userData2' },
            { key: 'userProp2', val: 'userData3' },
          ],
          contentType: 'application/json',
        };

        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.packetId, 1);
          assertEquals(packet.topic, 'topicA');
          assertEquals(
            packet.payload,
            new TextEncoder().encode('payloadA'),
          );

          assertEquals(packet.properties?.payloadFormatIndicator, 1);
          assertEquals(packet.properties?.messageExpiryInterval, 60);
          assertEquals(packet.properties?.responseTopic, 'responseTopicA');
          assertEquals(
            packet.properties?.correlationData,
            new TextEncoder().encode('correlationDataA'),
          );
          assertEquals(
            packet.properties?.userProperties,
            [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
          );
          assertEquals(packet.properties?.contentType, 'application/json');

          broker.sendPuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
          );
          resolve();
        });

        const result = await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          { qos: Mqtt.QoS.AT_LEAST_ONCE },
          properties,
        );
        assertEquals(result.result, Mqtt.ReasonCode.Success);
        assertEquals(result.reason, undefined);

        assertEquals(await client.publishInflightCount(), 0);

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @publish_qos1

Deno.test({ name: '@publish_qos2', only: false }, async (context) => {
  await context.step(
    'publish mqtt v3.1.1',
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
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.EXACTLY_ONCE);
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);
          assertEquals(packet.packetId, 1);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          assertEquals(packet.properties, undefined);

          broker.sendPubrec(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
          );
        });

        broker.on('pubrel', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          assertEquals(packet.properties, undefined);

          broker.sendPubcomp(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
          );
          resolve();
        });

        const result: ClientTypes.PublishResult = await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          {
            qos: Mqtt.QoS.EXACTLY_ONCE,
          },
        );
        assertEquals(result.result, 0); // 0 success

        assertEquals(await client.publishInflightCount(), 0);

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'publish v5.0',
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

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.EXACTLY_ONCE);
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);
          assertEquals(packet.packetId, 1);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          assertEquals(packet.properties, undefined);

          broker.sendPubrec(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
          );
        });

        broker.on('pubrel', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          assertEquals(packet.properties, undefined);

          broker.sendPubcomp(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
          );
          resolve();
        });

        const result = await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          { qos: Mqtt.QoS.EXACTLY_ONCE },
        );
        assertEquals(result.result, Mqtt.ReasonCode.Success);
        assertEquals(result.reason, undefined);

        assertEquals(await client.publishInflightCount(), 0);

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'publish v5.0 return error',
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

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.EXACTLY_ONCE);
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);
          assertEquals(packet.packetId, 1);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          assertEquals(packet.properties, undefined);

          const pubAckProperties: MqttProperties.PubrecProperties = {
            reasonString: 'Quota exceeded',
            userProperties: [{ key: 'userProp', val: 'userPropVal' }],
          };
          broker.sendPubrec(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            Mqtt.ReasonCode.QuotaExceeded,
            pubAckProperties,
          );
          resolve();
        });

        const result = await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          { qos: Mqtt.QoS.EXACTLY_ONCE },
        );
        assertEquals(result.result, Mqtt.ReasonCode.QuotaExceeded);
        assertEquals(result.reason, 'Quota exceeded');

        assertEquals(await client.publishInflightCount(), 0);

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'publish with prpoerties',
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

        // test
        const properties: MqttProperties.UserPublishProperties = {
          payloadFormatIndicator: 1,
          messageExpiryInterval: 60,
          responseTopic: 'responseTopicA',
          correlationData: new TextEncoder().encode('correlationDataA'),
          userProperties: [
            { key: 'userProp1', val: 'userData1' },
            { key: 'userProp2', val: 'userData2' },
            { key: 'userProp2', val: 'userData3' },
          ],
          contentType: 'application/json',
        };

        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.EXACTLY_ONCE);
          assertEquals(packet.packetId, 1);
          assertEquals(packet.topic, 'topicA');
          assertEquals(
            packet.payload,
            new TextEncoder().encode('payloadA'),
          );

          assertEquals(packet.properties?.payloadFormatIndicator, 1);
          assertEquals(packet.properties?.messageExpiryInterval, 60);
          assertEquals(packet.properties?.responseTopic, 'responseTopicA');
          assertEquals(
            packet.properties?.correlationData,
            new TextEncoder().encode('correlationDataA'),
          );
          assertEquals(
            packet.properties?.userProperties,
            [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
          );
          assertEquals(packet.properties?.contentType, 'application/json');

          broker.sendPubrec(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
          );
        });

        broker.on('pubrel', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          assertEquals(packet.properties, undefined);

          broker.sendPubcomp(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
          );
          resolve();
        });

        const result = await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          { qos: Mqtt.QoS.EXACTLY_ONCE },
          properties,
        );
        assertEquals(result.result, Mqtt.ReasonCode.Success);
        assertEquals(result.reason, undefined);

        assertEquals(await client.publishInflightCount(), 0);

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'publish v5.0 pubcomp return error',
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

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.EXACTLY_ONCE);
          assertEquals(packet.packetId, 1);

          broker.sendPubrec(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
          );
        });

        broker.on('pubrel', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);

          const pubcompProperties: MqttProperties.PubcompProperties = {
            reasonString: 'Packet identifier not found',
          };
          broker.sendPubcomp(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            Mqtt.ReasonCode.PacketIdentifierNotFound,
            pubcompProperties,
          );
          resolve();
        });

        const result = await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          { qos: Mqtt.QoS.EXACTLY_ONCE },
        );
        assertEquals(result.result, Mqtt.ReasonCode.PacketIdentifierNotFound);
        assertEquals(result.reason, 'Packet identifier not found');

        assertEquals(await client.publishInflightCount(), 0);

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @publish_qos2

Deno.test({ name: '@receive malformed puback', only: false }, async (context) => {
  await context.step(
    'receive malformed puback (invalid properties) mqtt v5.0',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 10,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, true, packet.protocolVersion);
        });

        const connack = await client.connect();
        assertEquals(
          connack,
          {
            type: 'connack',
            sessionPresent: true,
            reasonCode: Mqtt.ReasonCode.Success,
          },
        );

        // Monitor DISCONNECT event
        broker.on('disconnect', (event) => {
          const packet = event.detail;
          logger('Broker received DISCONNECT', packet);
          assertEquals(packet.reasonCode, Mqtt.ReasonCode.MalformedPacket);
          resolve();
        });

        client.on('closed', () => {
          logger('Client connection closed');
        });

        // Publish QoS 1 message to get a packet ID
        broker.on('publish', (event) => {
          const packet = event.detail;
          // Send malformed PUBACK with invalid property ID
          // PUBACK packet structure: Fixed Header | Packet ID | Reason Code | Properties Length | Properties
          // Fixed Header: 0x40 (PUBACK packet type)
          // Packet ID: same as publish
          // Reason Code: 0x00 (Success)
          // Properties Length: 0x01 (1 byte)
          // Property ID: 0xFF (INVALID - not defined in MQTT spec)
          const malformedPacket = new Uint8Array([
            0x40, // Fixed header: PUBACK packet type
            0x05, // Remaining length: 5 bytes
            (packet.packetId! >> 8) & 0xFF, // Packet ID high byte
            packet.packetId! & 0xFF, // Packet ID low byte
            0x00, // Reason Code: Success
            0x01, // Properties Length: 1 byte
            0xFF, // Property ID: 0xFF (INVALID)
          ]);

          broker.sendRawBytes(client.getClientId(), malformedPacket);
        });

        client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_LEAST_ONCE });

        await promise;
      } catch (err) {
        reject(err);
        fail(`error occurred: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @receive malformed puback

Deno.test({ name: '@receive malformed pubrec', only: false }, async (context) => {
  await context.step(
    'receive malformed pubrec (invalid properties) mqtt v5.0',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 10,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, true, packet.protocolVersion);
        });

        const connack = await client.connect();
        assertEquals(
          connack,
          {
            type: 'connack',
            sessionPresent: true,
            reasonCode: Mqtt.ReasonCode.Success,
          },
        );

        // Monitor DISCONNECT event
        broker.on('disconnect', (event) => {
          const packet = event.detail;
          logger('Broker received DISCONNECT', packet);
          assertEquals(packet.reasonCode, Mqtt.ReasonCode.MalformedPacket);
          resolve();
        });

        client.on('closed', () => {
          logger('Client connection closed');
        });

        // Publish QoS 2 message to get a packet ID
        broker.on('publish', (event) => {
          const packet = event.detail;
          // Send malformed PUBREC with invalid property ID
          // PUBREC packet structure: Fixed Header | Packet ID | Reason Code | Properties Length | Properties
          // Fixed Header: 0x50 (PUBREC packet type)
          // Property ID: 0xFF (INVALID - not defined in MQTT spec)
          const malformedPacket = new Uint8Array([
            0x50, // Fixed header: PUBREC packet type
            0x05, // Remaining length: 5 bytes
            (packet.packetId! >> 8) & 0xFF, // Packet ID high byte
            packet.packetId! & 0xFF, // Packet ID low byte
            0x00, // Reason Code: Success
            0x01, // Properties Length: 1 byte
            0xFF, // Property ID: 0xFF (INVALID)
          ]);

          broker.sendRawBytes(client.getClientId(), malformedPacket);
        });

        client.publish('topicA', 'payload', { qos: Mqtt.QoS.EXACTLY_ONCE });

        await promise;
      } catch (err) {
        reject(err);
        fail(`error occurred: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @receive malformed pubrec

Deno.test({ name: '@receive malformed pubcomp', only: false }, async (context) => {
  await context.step(
    'receive malformed pubcomp (invalid properties) mqtt v5.0',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 10,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, true, packet.protocolVersion);
        });

        const connack = await client.connect();
        assertEquals(
          connack,
          {
            type: 'connack',
            sessionPresent: true,
            reasonCode: Mqtt.ReasonCode.Success,
          },
        );

        // Monitor DISCONNECT event
        broker.on('disconnect', (event) => {
          const packet = event.detail;
          logger('Broker received DISCONNECT', packet);
          assertEquals(packet.reasonCode, Mqtt.ReasonCode.MalformedPacket);
          resolve();
        });

        client.on('closed', () => {
          logger('Client connection closed');
        });

        // Publish QoS 2 message and send valid PUBREC, then send malformed PUBCOMP
        broker.on('publish', (event) => {
          const packet = event.detail;
          // First send valid PUBREC
          broker.sendPubrec(client.getClientId(), packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
        });

        broker.on('pubrel', (event) => {
          const packet = event.detail;
          // Send malformed PUBCOMP with invalid property ID
          // PUBCOMP packet structure: Fixed Header | Packet ID | Reason Code | Properties Length | Properties
          // Fixed Header: 0x70 (PUBCOMP packet type)
          // Property ID: 0xFF (INVALID - not defined in MQTT spec)
          const malformedPacket = new Uint8Array([
            0x70, // Fixed header: PUBCOMP packet type
            0x05, // Remaining length: 5 bytes
            (packet.packetId >> 8) & 0xFF, // Packet ID high byte
            packet.packetId & 0xFF, // Packet ID low byte
            0x00, // Reason Code: Success
            0x01, // Properties Length: 1 byte
            0xFF, // Property ID: 0xFF (INVALID)
          ]);

          broker.sendRawBytes(client.getClientId(), malformedPacket);
        });

        client.publish('topicA', 'payload', { qos: Mqtt.QoS.EXACTLY_ONCE });

        await promise;
      } catch (err) {
        reject(err);
        fail(`error occurred: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @receive malformed pubcomp

Deno.test({ name: '@publish invalid topic', only: false }, async (context) => {
  await context.step(
    'rejects an invalid topic, qos or property and sends nothing',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        await client.connect();

        const { promise, resolve } = Promise.withResolvers<void>();
        const receivedTopics: string[] = [];
        broker.on('publish', (event) => {
          receivedTopics.push(event.detail.topic);
          resolve();
        });

        for (const topic of ['', 'a/#', '#', 'a/+/b', '+', 'a\u0000b']) {
          await assertRejects(() => client.publish(topic, 'x'), ClientErrors.InvalidTopicNameError);
        }
        await assertRejects(
          () => client.publish('topicA', 'x', { qos: Mqtt.QoS.AT_LEAST_ONCE }, { responseTopic: 'response/#' }),
          ClientErrors.InvalidTopicNameError,
        );
        await assertRejects(
          () => client.publish('topicA', 'x', { qos: Mqtt.QoS.EXACTLY_ONCE }, { responseTopic: '' }),
          ClientErrors.InvalidTopicNameError,
        );
        await assertRejects(() => client.publish('topicA', 'x', { qos: 3 as Mqtt.QoS }), ClientErrors.InvalidArgumentError);
        // [MQTT-3.3.1-2] The DUP flag must be 0 for QoS 0.
        await assertRejects(() => client.publish('topicA', 'x', { dup: true }), ClientErrors.InvalidArgumentError, 'dup');
        await assertRejects(
          () => client.publish('topicA', 'x', { qos: Mqtt.QoS.AT_LEAST_ONCE }, { messageExpiryInterval: -1 }),
          ClientErrors.InvalidPropertyError,
        );
        await assertRejects(
          () => client.publish('topicA', 'x', { qos: Mqtt.QoS.AT_LEAST_ONCE }, { payloadFormatIndicator: 7 }),
          ClientErrors.InvalidPropertyError,
        );
        await assertRejects(
          () => client.publish('topicA', 'x', { qos: Mqtt.QoS.AT_LEAST_ONCE }, { contentType: 'a\u0000b' }),
          ClientErrors.InvalidPropertyError,
        );
        // An ignored rejection does not become an unhandled rejection.
        client.publish('a/#', 'x');

        // Nothing was sent: the next valid publish is the first PUBLISH the broker receives.
        await client.publish('topicA', 'x');
        await promise;
        assertEquals(receivedTopics, ['topicA']);
        // The rejected QoS 1 / QoS 2 publishes did not acquire a packet ID or enter the session.
        assertEquals(await client.publishInflightCount(), 0);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @publish invalid topic

Deno.test({ name: '@publish too large', only: false }, async (context) => {
  await context.step(
    'QoS 1: a packet larger than MQTT allows is not kept in the session, and its packet ID is released',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger });
        await client.connect();

        const packetIds: number[] = [];
        broker.on('publish', (event) => {
          const packet = event.detail;
          packetIds.push(packet.packetId!);
          broker.sendPuback('cid', packet.packetId!, Mqtt.ProtocolVersion.MQTT_V5);
        });

        // With the topic and the packet ID, the Remaining Length is larger than 268,435,455.
        const payload = new Uint8Array(268_435_455);
        await assertRejects(
          () => client.publish('topicA', payload, { qos: Mqtt.QoS.AT_LEAST_ONCE }),
          ClientErrors.PacketTooLargeError,
          'Remaining Length',
        );
        assertEquals(await client.publishInflightCount(), 0);

        // The released packet ID 1 is used again.
        await client.publish('topicA', 'x', { qos: Mqtt.QoS.AT_LEAST_ONCE });
        assertEquals(packetIds, [1]);
        assertEquals(await client.publishInflightCount(), 0);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'a packet larger than the Maximum Packet Size of the broker is rejected, and its topic alias is released',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success, {
            topicAliasMaximum: 10,
            maximumPacketSize: 64,
          });
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger, topicAliasMaximumAboutSend: 10 });
        await client.connect();

        const { promise, resolve } = Promise.withResolvers<void>();
        const received: { topic: string; topicAlias?: number; size: number }[] = [];
        broker.on('publish', (event) => {
          const packet = event.detail;
          received.push({ topic: packet.topic, topicAlias: packet.properties?.topicAlias, size: packet.payload.length });
          resolve();
        });

        for (const qos of [Mqtt.QoS.AT_MOST_ONCE, Mqtt.QoS.AT_LEAST_ONCE]) {
          await assertRejects(
            () => client.publish('topicA', new Uint8Array(100), { qos }),
            ClientErrors.PacketTooLargeError,
            'Maximum Packet Size 64',
          );
        }
        assertEquals(await client.publishInflightCount(), 0);

        // The broker never received the alias, so the next PUBLISH registers it again with the topic name.
        await client.publish('topicA', new Uint8Array(10));
        await promise;
        assertEquals(received, [{ topic: 'topicA', topicAlias: 1, size: 10 }]);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @publish too large

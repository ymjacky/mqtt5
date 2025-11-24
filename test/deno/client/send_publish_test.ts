import { ClientTypes, Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

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
        broker.startRead(client.getClientId());

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
        broker.startRead(client.getClientId());

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
        broker.startRead(client.getClientId());

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
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.AT_MOST_ONCE);
          assertEquals(packet.dup, true);
          assertEquals(packet.retain, true);

          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          assertEquals(packet.properties, undefined);
          resolve();
        });
        await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'), // payload
          {
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
        broker.startRead(client.getClientId());

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
          subscriptionIdentifier: 3,
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
          assertEquals(packet.properties?.subscriptionIdentifier, 3);
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
        broker.startRead(client.getClientId());

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
        broker.startRead(client.getClientId());

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
        broker.startRead(client.getClientId());

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
        broker.startRead(client.getClientId());

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
          subscriptionIdentifier: 3,
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
          assertEquals(packet.properties?.subscriptionIdentifier, 3);
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
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.EXACTRY_ONCE);
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
            qos: Mqtt.QoS.EXACTRY_ONCE,
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
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.EXACTRY_ONCE);
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
          { qos: Mqtt.QoS.EXACTRY_ONCE },
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
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.EXACTRY_ONCE);
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
          { qos: Mqtt.QoS.EXACTRY_ONCE },
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
        broker.startRead(client.getClientId());

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
          subscriptionIdentifier: 3,
          contentType: 'application/json',
        };

        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.EXACTRY_ONCE);
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
          assertEquals(packet.properties?.subscriptionIdentifier, 3);
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
          { qos: Mqtt.QoS.EXACTRY_ONCE },
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

        broker.startRead(client.getClientId());

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

        broker.startRead(client.getClientId());

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

        client.publish('topicA', 'payload', { qos: Mqtt.QoS.EXACTRY_ONCE });

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

        broker.startRead(client.getClientId());

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

        client.publish('topicA', 'payload', { qos: Mqtt.QoS.EXACTRY_ONCE });

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

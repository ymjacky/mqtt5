import { ClientTypes, Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertExists, assertFalse, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@resend from MemoryStore', only: false }, async (context) => {
  await context.step(
    're publish mqtt v5.0 qos1',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();
      let sessionExists = false;
      let expectedPacketId = 1;

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 3,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertFalse(packet.clean);
          broker.sendConnack(packet.clientId, sessionExists, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', (event) => {
          if (sessionExists) {
            const packet = event.detail;
            assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
            assertEquals(packet.dup, true);
            assertEquals(packet.retain, false);
            assertEquals(packet.packetId, expectedPacketId++);
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

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

            if (expectedPacketId > 3) {
              resolve();
            }
          }
        });

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

        const pubResult1 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE }, properties);
        const pubResult2 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE }, properties);
        const pubResult3 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE }, properties);

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        client.on('closed', async () => {
          if (sessionExists) {
            assertEquals(await client.publishInflightCount(), 0);
          } else {
            sessionExists = true;
            assertEquals(await client.publishInflightCount(), 3);
            // reconnect
            logger('try to reconnect');

            await client.connect();
            broker.startRead(client.getClientId());

            assertEquals((await pubResult1).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult2).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult3).result, Mqtt.ReasonCode.Success);
            assertEquals(await client.publishInflightCount(), 0);

            await client.disconnect();
          }
        });

        broker.closeConnectionFromBroker(client.getClientId());

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    're publish mqtt v3.1.1 qos1',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();
      let sessionExists = false;
      let expectedPacketId = 1;

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 3,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertFalse(packet.clean);
          broker.sendConnack(packet.clientId, sessionExists, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', (event) => {
          if (sessionExists) {
            const packet = event.detail;
            assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
            assertEquals(packet.dup, true);
            assertEquals(packet.retain, false);
            assertEquals(packet.packetId, expectedPacketId++);
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

            assertEquals(packet.properties, undefined);

            broker.sendPuback(
              'cid',
              packet.packetId!,
              Mqtt.ProtocolVersion.MQTT_V3_1_1,
            );

            if (expectedPacketId > 3) {
              resolve();
            }
          }
        });

        const pubResult1 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE });
        const pubResult2 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE });
        const pubResult3 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE });

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        client.on('closed', async () => {
          if (sessionExists) {
            assertEquals(await client.publishInflightCount(), 0);
          } else {
            sessionExists = true;
            assertEquals(await client.publishInflightCount(), 3);
            // reconnect
            logger('try to reconnect');

            await client.connect();
            broker.startRead(client.getClientId());

            assertEquals((await pubResult1).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult2).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult3).result, Mqtt.ReasonCode.Success);
            assertEquals(await client.publishInflightCount(), 0);

            await client.disconnect();
          }
        });

        broker.closeConnectionFromBroker(client.getClientId());

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    're publish mqtt v5.0 qos2',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();
      let sessionExists = false;
      let expectedPacketId = 1;

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 3,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertFalse(packet.clean);
          broker.sendConnack(packet.clientId, sessionExists, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', (event) => {
          if (sessionExists) {
            const packet = event.detail;
            assertEquals(packet.qos, Mqtt.QoS.EXACTRY_ONCE);
            assertEquals(packet.dup, true);
            assertEquals(packet.retain, false);
            assertEquals(packet.packetId, expectedPacketId++);
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

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

            if (expectedPacketId > 3) {
              resolve();
            }
          }
        });

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

        const pubResult1 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE }, properties);
        const pubResult2 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE }, properties);
        const pubResult3 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE }, properties);

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        client.on('closed', async () => {
          if (sessionExists) {
            assertEquals(await client.publishInflightCount(), 0);
          } else {
            sessionExists = true;
            assertEquals(await client.publishInflightCount(), 3);
            // reconnect
            logger('try to reconnect');

            await client.connect();
            broker.startRead(client.getClientId());

            assertEquals((await pubResult1).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult2).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult3).result, Mqtt.ReasonCode.Success);
            assertEquals(await client.publishInflightCount(), 0);

            await client.disconnect();
          }
        });

        broker.closeConnectionFromBroker(client.getClientId());

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    're publish mqtt v3.1.1 qos2',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();
      let sessionExists = false;
      let expectedPacketId = 1;

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 3,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertFalse(packet.clean);
          broker.sendConnack(packet.clientId, sessionExists, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', (event) => {
          if (sessionExists) {
            const packet = event.detail;
            assertEquals(packet.qos, Mqtt.QoS.EXACTRY_ONCE);
            assertEquals(packet.dup, true);
            assertEquals(packet.retain, false);
            assertEquals(packet.packetId, expectedPacketId++);
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

            assertEquals(packet.properties, undefined);

            broker.sendPuback(
              'cid',
              packet.packetId!,
              Mqtt.ProtocolVersion.MQTT_V3_1_1,
            );

            if (expectedPacketId > 3) {
              resolve();
            }
          }
        });

        const pubResult1 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE });
        const pubResult2 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE });
        const pubResult3 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE });

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        client.on('closed', async () => {
          if (sessionExists) {
            assertEquals(await client.publishInflightCount(), 0);
          } else {
            sessionExists = true;
            assertEquals(await client.publishInflightCount(), 3);
            // reconnect
            logger('try to reconnect');

            await client.connect();
            broker.startRead(client.getClientId());

            assertEquals((await pubResult1).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult2).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult3).result, Mqtt.ReasonCode.Success);
            assertEquals(await client.publishInflightCount(), 0);

            await client.disconnect();
          }
        });

        broker.closeConnectionFromBroker(client.getClientId());

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    're pubrel mqtt v5.0',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();
      let sessionExists = false;
      let expectedPublishPacketId = 1;
      let expectedPubrelPacketId = 1;

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 3,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertFalse(packet.clean);
          broker.sendConnack(packet.clientId, sessionExists, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.EXACTRY_ONCE);
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);
          assertEquals(packet.packetId, expectedPublishPacketId++);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

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
          if (sessionExists) {
            const packet = event.detail;
            assertEquals(packet.packetId, expectedPubrelPacketId++);

            broker.sendPubcomp(
              'cid',
              packet.packetId!,
              Mqtt.ProtocolVersion.MQTT_V5,
            );
            if (expectedPubrelPacketId > 3) {
              resolve();
            }
          } else {
            broker.closeConnectionFromBroker(client.getClientId());
          }
        });

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

        const pubResult1 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE }, properties);
        const pubResult2 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE }, properties);
        const pubResult3 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE }, properties);

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        client.on('closed', async () => {
          if (sessionExists) {
            assertEquals(await client.publishInflightCount(), 0);
          } else {
            sessionExists = true;
            assertEquals(await client.publishInflightCount(), 3);
            // reconnect
            logger('try to reconnect');

            await client.connect();
            broker.startRead(client.getClientId());

            assertEquals((await pubResult1).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult2).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult3).result, Mqtt.ReasonCode.Success);
            assertEquals(await client.publishInflightCount(), 0);

            await client.disconnect();
          }
        });

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    're pubrel mqtt v3.1.1',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();
      let sessionExists = false;
      let expectedPublishPacketId = 1;
      let expectedPubrelPacketId = 1;

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 3,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertFalse(packet.clean);
          broker.sendConnack(packet.clientId, sessionExists, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.qos, Mqtt.QoS.EXACTRY_ONCE);
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);
          assertEquals(packet.packetId, expectedPublishPacketId++);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

          broker.sendPubrec(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
          );
        });

        broker.on('pubrel', (event) => {
          if (sessionExists) {
            const packet = event.detail;
            assertEquals(packet.packetId, expectedPubrelPacketId++);

            broker.sendPubcomp(
              'cid',
              packet.packetId!,
              Mqtt.ProtocolVersion.MQTT_V5,
            );
            if (expectedPubrelPacketId > 3) {
              resolve();
            }
          } else {
            broker.closeConnectionFromBroker(client.getClientId());
          }
        });

        const pubResult1 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE });
        const pubResult2 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE });
        const pubResult3 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE });

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        client.on('closed', async () => {
          if (sessionExists) {
            assertEquals(await client.publishInflightCount(), 0);
          } else {
            sessionExists = true;
            assertEquals(await client.publishInflightCount(), 3);
            // reconnect
            logger('try to reconnect');

            await client.connect();
            broker.startRead(client.getClientId());

            assertEquals((await pubResult1).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult2).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult3).result, Mqtt.ReasonCode.Success);
            assertEquals(await client.publishInflightCount(), 0);

            await client.disconnect();
          }
        });

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    're publish using topic alias',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      const broker = new TestBroker();
      let sessionExists = false;
      let expectedPacketId = 1;

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 3,
          topicAliasMaximumAboutSend: 3,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertFalse(packet.clean);
          broker.sendConnack(packet.clientId, sessionExists, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', (event) => {
          const packet = event.detail;

          if (sessionExists) {
            assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
            assertEquals(packet.dup, true);
            assertEquals(packet.retain, false);
            assertEquals(packet.packetId, expectedPacketId);
            assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

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

            assertEquals(packet.topic, 'topicA');
            assertFalse(packet.properties?.topicAlias);

            broker.sendPuback(
              'cid',
              packet.packetId!,
              Mqtt.ProtocolVersion.MQTT_V5,
            );

            expectedPacketId++;
            if (expectedPacketId > 3) {
              resolve();
            }
          } else {
            assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
            assertEquals(packet.dup, false);
            assertEquals(packet.retain, false);
            assertEquals(packet.packetId, expectedPacketId);
            assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

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

            assertEquals(packet.properties?.topicAlias, 1);
            if (packet.packetId === 1) {
              assertEquals(packet.topic, 'topicA');
              // Only the first message returns puback
              broker.sendPuback(
                'cid',
                packet.packetId!,
                Mqtt.ProtocolVersion.MQTT_V5,
              );
            } else {
              assertEquals(packet.topic, ''); // Empty string due to topic alias
            }

            expectedPacketId++;
            if (expectedPacketId > 3) {
              expectedPacketId = 2; // Since 1 has already returned puback, the next one should be retransmitted from 2.

              broker.closeConnectionFromBroker(client.getClientId());
            }
          }
        });

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

        const pubResult1 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE }, properties);
        const pubResult2 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE }, properties);
        const pubResult3 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE }, properties);

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        client.on('closed', async () => {
          if (sessionExists) {
            assertEquals(await client.publishInflightCount(), 0);
          } else {
            sessionExists = true;
            assertEquals(await client.publishInflightCount(), 2);
            // reconnect
            logger('try to reconnect');

            await client.connect();
            broker.startRead(client.getClientId());

            assertEquals((await pubResult1).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult2).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult3).result, Mqtt.ReasonCode.Success);
            assertEquals(await client.publishInflightCount(), 0);

            await client.disconnect();
          }
        });

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'check overtake',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      let pubResult1: Promise<ClientTypes.PublishResult>;
      let pubResult2: Promise<ClientTypes.PublishResult>;
      let pubResult3: Promise<ClientTypes.PublishResult>;
      let pubResult4: Promise<ClientTypes.PublishResult>;

      const broker = new TestBroker();
      let sessionExists = false;
      const expectedPacketIds = [2, 3, 1];
      let expectedPacketIdsCPosition = 0;

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 3,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertFalse(packet.clean);
          broker.sendConnack(packet.clientId, sessionExists, packet.protocolVersion);
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('publish', async (event) => {
          const packet = event.detail;
          if (sessionExists) {
            assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
            assertEquals(packet.dup, true);
            assertEquals(packet.retain, false);
            assertEquals(packet.payload, new TextEncoder().encode('payloadA'));

            assertEquals(packet.packetId, expectedPacketIds[expectedPacketIdsCPosition]);
            if (expectedPacketIdsCPosition++ === 2) {
              assertEquals(packet.topic, 'topicC');
            } else {
              assertEquals(packet.topic, 'topicB');
            }

            broker.sendPuback(
              'cid',
              packet.packetId!,
              Mqtt.ProtocolVersion.MQTT_V5,
            );
          } else {
            if (packet.topic === 'topicA') {
              assertEquals(packet.packetId, 1);
              broker.sendPuback(
                'cid',
                packet.packetId!,
                Mqtt.ProtocolVersion.MQTT_V5,
              );

              assertEquals((await pubResult1).result, Mqtt.ReasonCode.Success);
              pubResult4 = client.publish('topicC', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE });
            }

            if (packet.topic === 'topicC') {
              assertEquals(packet.packetId, 1); // 1 = reused packetId
              broker.closeConnectionFromBroker(client.getClientId());
            }
          }
        });

        pubResult1 = client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE });
        pubResult2 = client.publish('topicB', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE });
        pubResult3 = client.publish('topicB', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.AT_LEAST_ONCE });

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        client.on('closed', async () => {
          if (sessionExists) {
            assertEquals(await client.publishInflightCount(), 0);
          } else {
            sessionExists = true;
            assertEquals(await client.publishInflightCount(), 3);
            // reconnect
            logger('try to reconnect');

            await client.connect();
            broker.startRead(client.getClientId());

            assertEquals((await pubResult2).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult3).result, Mqtt.ReasonCode.Success);
            assertEquals((await pubResult4).result, Mqtt.ReasonCode.Success);
            assertEquals(await client.publishInflightCount(), 0);
            resolve();
            await client.disconnect();
          }
        });

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @resend from MemoryStore

import { Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@receive publish_qos0', only: false }, async (context) => {
  await context.step(
    'receive publish mqtt v3.1.1',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 10,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, true, packet.protocolVersion);
        });

        const connack = await client.connect();
        assertEquals(
          connack, // actual
          {
            type: 'connack',
            sessionPresent: true,
            returnCode: Mqtt.V3_1_1_ConnectReturnCode.ConnectionAccepted,
          },
        );

        client.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, undefined);
          assertEquals(packet.qos, Mqtt.QoS.AT_MOST_ONCE);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payload A'));
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);

          resolve();
        });

        broker.sendPublish(
          client.getClientId(),
          0,
          'topicA',
          Mqtt.ProtocolVersion.MQTT_V3_1_1,
          new Uint8Array(new TextEncoder().encode('payload A')),
          Mqtt.QoS.AT_MOST_ONCE,
          false,
          false,
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
    'receive publish mqtt v5.0',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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
          connack, // actual
          {
            type: 'connack',
            sessionPresent: true,
            reasonCode: Mqtt.ReasonCode.Success,
          },
        );

        client.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, undefined);
          assertEquals(packet.qos, Mqtt.QoS.AT_MOST_ONCE);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payload A'));
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);

          assertEquals(packet.properties?.payloadFormatIndicator, 1);
          assertEquals(packet.properties?.messageExpiryInterval, 60);
          assertEquals(packet.properties?.topicAlias, 2);
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

        const properties: MqttProperties.PublishProperties = {
          payloadFormatIndicator: 1,
          messageExpiryInterval: 60,
          topicAlias: 2,
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
        broker.sendPublish(
          client.getClientId(),
          0,
          'topicA',
          Mqtt.ProtocolVersion.MQTT_V5,
          new Uint8Array(new TextEncoder().encode('payload A')),
          Mqtt.QoS.AT_MOST_ONCE,
          false,
          false,
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
}); // @receive publish_qos0

Deno.test({ name: '@receive publish_qos1', only: false }, async (context) => {
  await context.step(
    'receive publish mqtt v3.1.1',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 10,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, true, packet.protocolVersion);
        });

        const connack = await client.connect();
        assertEquals(
          connack, // actual
          {
            type: 'connack',
            sessionPresent: true,
            returnCode: Mqtt.V3_1_1_ConnectReturnCode.ConnectionAccepted,
          },
        );
        broker.startRead(client.getClientId());

        client.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payload A'));
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);
        });

        broker.on('puback', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          resolve();
        });

        broker.sendPublish(
          client.getClientId(),
          1,
          'topicA',
          Mqtt.ProtocolVersion.MQTT_V3_1_1,
          new Uint8Array(new TextEncoder().encode('payload A')),
          Mqtt.QoS.AT_LEAST_ONCE,
          false,
          false,
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
    'receive publish mqtt v5.0',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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
          connack, // actual
          {
            type: 'connack',
            sessionPresent: true,
            reasonCode: Mqtt.ReasonCode.Success,
          },
        );

        broker.startRead(client.getClientId());

        client.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          assertEquals(packet.qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payload A'));
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);

          assertEquals(packet.properties?.payloadFormatIndicator, 1);
          assertEquals(packet.properties?.messageExpiryInterval, 60);
          assertEquals(packet.properties?.topicAlias, 2);
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
        });

        broker.on('puback', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          assertEquals(packet.reasonCode, undefined);
          assertEquals(packet.properties, undefined);
          resolve();
        });

        const properties: MqttProperties.PublishProperties = {
          payloadFormatIndicator: 1,
          messageExpiryInterval: 60,
          topicAlias: 2,
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
        broker.sendPublish(
          client.getClientId(),
          1,
          'topicA',
          Mqtt.ProtocolVersion.MQTT_V5,
          new Uint8Array(new TextEncoder().encode('payload A')),
          Mqtt.QoS.AT_LEAST_ONCE,
          false,
          false,
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
}); // @receive publish_qos1

Deno.test({ name: '@receive publish_qos2', only: false }, async (context) => {
  await context.step(
    'receive publish mqtt v3.1.1',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          keepAlive: 10,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, true, packet.protocolVersion);
        });

        const connack = await client.connect();
        assertEquals(
          connack, // actual
          {
            type: 'connack',
            sessionPresent: true,
            returnCode: Mqtt.V3_1_1_ConnectReturnCode.ConnectionAccepted,
          },
        );
        broker.startRead(client.getClientId());

        client.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          assertEquals(packet.qos, Mqtt.QoS.EXACTRY_ONCE);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payload A'));
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);
        });

        broker.on('pubrec', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);

          broker.sendPubrel(
            client.getClientId(),
            packet.packetId,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
          );
        });
        broker.on('pubcomp', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          resolve();
        });

        broker.sendPublish(
          client.getClientId(),
          1,
          'topicA',
          Mqtt.ProtocolVersion.MQTT_V3_1_1,
          new Uint8Array(new TextEncoder().encode('payload A')),
          Mqtt.QoS.EXACTRY_ONCE,
          false,
          false,
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
    'receive publish mqtt v5.0',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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
          connack, // actual
          {
            type: 'connack',
            sessionPresent: true,
            reasonCode: Mqtt.ReasonCode.Success,
          },
        );

        broker.startRead(client.getClientId());

        client.on('publish', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          assertEquals(packet.qos, Mqtt.QoS.EXACTRY_ONCE);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, new TextEncoder().encode('payload A'));
          assertEquals(packet.dup, false);
          assertEquals(packet.retain, false);

          assertEquals(packet.properties?.payloadFormatIndicator, 1);
          assertEquals(packet.properties?.messageExpiryInterval, 60);
          assertEquals(packet.properties?.topicAlias, 2);
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
        });

        broker.on('pubrec', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          assertEquals(packet.reasonCode, undefined);
          assertEquals(packet.properties, undefined);

          broker.sendPubrel(
            client.getClientId(),
            packet.packetId,
            Mqtt.ProtocolVersion.MQTT_V5,
          );
        });
        broker.on('pubcomp', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 1);
          assertEquals(packet.reasonCode, undefined);
          assertEquals(packet.properties, undefined);
          resolve();
        });

        const properties: MqttProperties.PublishProperties = {
          payloadFormatIndicator: 1,
          messageExpiryInterval: 60,
          topicAlias: 2,
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
        broker.sendPublish(
          client.getClientId(),
          1,
          'topicA',
          Mqtt.ProtocolVersion.MQTT_V5,
          new Uint8Array(new TextEncoder().encode('payload A')),
          Mqtt.QoS.EXACTRY_ONCE,
          false,
          false,
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
}); // @receive publish_qos2

Deno.test({ name: '@receive malformed publish', only: false }, async (context) => {
  await context.step(
    'receive malformed publish (invalid QoS 3) mqtt v3.1.1',
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
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
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
            returnCode: Mqtt.V3_1_1_ConnectReturnCode.ConnectionAccepted,
          },
        );

        broker.startRead(client.getClientId());

        // Monitor disconnect event
        broker.on('disconnect', (event) => {
          const packet = event.detail;
          logger('Broker received DISCONNECT from client', packet);
          assertEquals(packet.type, 'disconnect');
          resolve();
        });

        client.on('closed', () => {
          logger('Client connection closed');
        });

        // Create malformed PUBLISH packet with invalid QoS (3)
        // MQTT packet structure: Fixed Header | Variable Header | Payload
        // Fixed Header byte 1: PacketType(4bit) | DUP(1bit) | QoS(2bit) | RETAIN(1bit)
        // PUBLISH = 0x30, QoS=3 (0b11) -> 0x36
        const malformedPacket = new Uint8Array([
          0x36, // Fixed header: PUBLISH, QoS=3 (invalid), DUP=0, RETAIN=0
          0x0A, // Remaining length: 10 bytes
          0x00,
          0x05, // Topic length: 5
          0x74,
          0x6F,
          0x70,
          0x69,
          0x63, // Topic: "topic"
          0x00,
          0x01, // Packet ID: 1
          0x64,
          0x61,
          0x74,
          0x61, // Payload: "data"
        ]);

        await broker.sendRawBytes(client.getClientId(), malformedPacket);

        await promise;
      } catch (err) {
        reject(err);
        fail(`error occurred: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'receive malformed publish (invalid QoS 3) mqtt v5.0',
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

        // Monitor DISCONNECT (no PUBACK/PUBREC for malformed packets)
        broker.on('disconnect', (event) => {
          const packet = event.detail;
          logger('Broker received DISCONNECT', packet);
          assertEquals(packet.reasonCode, Mqtt.ReasonCode.MalformedPacket);
          resolve();
        });

        client.on('closed', () => {
          logger('Client connection closed');
        });

        // Create malformed PUBLISH packet with invalid QoS (3)
        const malformedPacket = new Uint8Array([
          0x36, // Fixed header: PUBLISH, QoS=3 (invalid), DUP=0, RETAIN=0
          0x0B, // Remaining length: 11 bytes
          0x00,
          0x05, // Topic length: 5
          0x74,
          0x6F,
          0x70,
          0x69,
          0x63, // Topic: "topic"
          0x00,
          0x01, // Packet ID: 1
          0x00, // Properties length: 0
          0x64,
          0x61,
          0x74,
          0x61, // Payload: "data"
        ]);

        await broker.sendRawBytes(client.getClientId(), malformedPacket);

        await promise;
      } catch (err) {
        reject(err);
        fail(`error occurred: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @receive malformed publish

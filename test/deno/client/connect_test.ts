import { Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertExists } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}
Deno.test({ name: '@connect', only: false }, async (context) => {
  await context.step(
    'connect default value (v5.0)',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;

          assertEquals(packet.clientId, 'cid');
          assertEquals(packet.clean, true);
          assertEquals(packet.username, undefined);
          assertEquals(packet.password, undefined);
          assertEquals(packet.protocolVersion, Mqtt.ProtocolVersion.MQTT_V5);
          assertEquals(packet.keepAlive, 10);
          assertEquals(packet.properties, undefined);

          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        const connack = await client.connect();

        assertEquals(
          connack, // actual
          {
            type: 'connack',
            sessionPresent: false,
            reasonCode: Mqtt.ReasonCode.Success,
          },
        );
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'connect v3.1.1',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          url: new URL('mqtt://127.0.0.1:1883'),
          username: 'myname',
          password: 'mypass',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          protocolVersion: 4,
          keepAlive: 20,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;

          assertEquals(packet.clientId, 'cid');
          assertEquals(packet.clean, false);
          assertEquals(packet.username, 'myname');
          assertEquals(packet.password, 'mypass');
          assertEquals(packet.protocolVersion, Mqtt.ProtocolVersion.MQTT_V3_1_1);
          assertEquals(packet.keepAlive, 20);
          assertEquals(packet.properties, undefined);

          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        const connack = await client.connect();

        assertEquals(
          connack, // actual
          {
            type: 'connack',
            sessionPresent: false,
            returnCode: Mqtt.V3_1_1_ConnectReturnCode.ConnectionAccepted,
          },
        );
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'connect v5.0',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          url: new URL('mqtt://127.0.0.1:1883'),
          username: 'myname',
          password: 'mypass',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          protocolVersion: 5,
          keepAlive: 20,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;

          assertEquals(packet.clientId, 'cid');
          assertEquals(packet.clean, false);
          assertEquals(packet.username, 'myname');
          assertEquals(packet.password, 'mypass');
          assertEquals(packet.protocolVersion, Mqtt.ProtocolVersion.MQTT_V5);
          assertEquals(packet.keepAlive, 20);
          assertEquals(packet.properties, undefined);

          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        const connack = await client.connect();

        assertEquals(
          connack, // actual
          {
            type: 'connack',
            sessionPresent: false,
            reasonCode: Mqtt.ReasonCode.Success,
          },
        );
      } finally {
        await broker.destroy();
      }
    },
  );
  await context.step(
    'connect v5.0 with properties',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertEquals(packet.clientId, 'cid');
          assertEquals(packet.clean, true);
          assertEquals(packet.username, undefined);
          assertEquals(packet.password, undefined);
          assertEquals(packet.protocolVersion, Mqtt.ProtocolVersion.MQTT_V5);
          assertEquals(packet.keepAlive, 10);

          assertEquals(packet.properties?.sessionExpiryInterval, 300);
          assertEquals(packet.properties?.receiveMaximum, 10);
          assertEquals(packet.properties?.maximumPacketSize, 128);
          assertEquals(packet.properties?.topicAliasMaximum, 20);

          assertEquals(packet.properties?.requestResponseInformation, true);
          assertEquals(packet.properties?.requestProblemInformation, true);
          assertEquals(
            packet.properties?.userProperties,
            [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
          );
          assertEquals(packet.properties?.authenticationMethod, 'digest');
          assertEquals(packet.properties?.authenticationData, new TextEncoder().encode('ABCDEFG'));

          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        const properties: MqttProperties.ConnectProperties = {
          sessionExpiryInterval: 300,
          receiveMaximum: 10,
          maximumPacketSize: 128,
          topicAliasMaximum: 20,
          requestResponseInformation: true,
          requestProblemInformation: true,
          userProperties: [
            { key: 'userProp1', val: 'userData1' },
            { key: 'userProp2', val: 'userData2' },
            { key: 'userProp2', val: 'userData3' },
          ],
          authenticationMethod: 'digest',
          authenticationData: new TextEncoder().encode('ABCDEFG'),
        };
        const connack = await client.connect({ properties });

        assertEquals(
          connack, // actual
          {
            type: 'connack',
            sessionPresent: false,
            reasonCode: Mqtt.ReasonCode.Success,
          },
        );
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'connect v5.0 with connack properties',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          protocolVersion: 5,
          keepAlive: 10,
        });

        broker.on('connect', async (event) => {
          const packet = event.detail;
          assertEquals(packet.clientId, 'cid');
          assertEquals(packet.clean, true);
          assertEquals(packet.username, undefined);
          assertEquals(packet.password, undefined);
          assertEquals(packet.protocolVersion, Mqtt.ProtocolVersion.MQTT_V5);
          assertEquals(packet.keepAlive, 10);

          const connackProperties: MqttProperties.ConnackProperties = {
            sessionExpiryInterval: 300,
            receiveMaximum: 10,
            maximumQoS: 1,
            retainAvailable: true,
            maximumPacketSize: 128,
            assignedClientIdentifier: 'cid2',
            topicAliasMaximum: 11,
            reasonString: 'NotAuthorized',
            userProperties: [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
            wildcardSubscriptionAvailable: true,
            subscriptionIdentifiersAvailable: true,
            sharedSubscriptionAvailable: true,
            serverKeepAlive: 40,
            responseInformation: 'response_topic',
            serverReference: 'mqtt://127.0.0.1:11883',
            authenticationMethod: 'digest',
            authenticationData: new TextEncoder().encode('ABCDEFG'),
          };

          await broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.NotAuthorized, connackProperties);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        const connack = await client.connect();

        assertEquals(connack.sessionPresent, false);
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.NotAuthorized);
        assertExists(connack.properties);
        assertEquals(connack.properties?.sessionExpiryInterval, 300);
        assertEquals(connack.properties?.receiveMaximum, 10);
        assertEquals(connack.properties?.maximumQoS, 1);
        assertEquals(connack.properties?.retainAvailable, true);
        assertEquals(connack.properties?.maximumPacketSize, 128);
        assertEquals(connack.properties?.assignedClientIdentifier, `cid2`);
        assertEquals(connack.properties?.topicAliasMaximum, 11);
        assertEquals(connack.properties?.reasonString, 'NotAuthorized');
        assertEquals(
          connack.properties?.userProperties,
          [
            { key: 'userProp1', val: 'userData1' },
            { key: 'userProp2', val: 'userData2' },
            { key: 'userProp2', val: 'userData3' },
          ],
        );
        assertEquals(connack.properties?.wildcardSubscriptionAvailable, true);
        assertEquals(connack.properties?.subscriptionIdentifiersAvailable, true);
        assertEquals(connack.properties?.sharedSubscriptionAvailable, true);
        assertEquals(connack.properties?.serverKeepAlive, 40);
        assertEquals(connack.properties?.responseInformation, 'response_topic');
        assertEquals(connack.properties?.serverReference, 'mqtt://127.0.0.1:11883');
        assertEquals(connack.properties?.authenticationMethod, 'digest');
        assertEquals(connack.properties?.authenticationData, new TextEncoder().encode('ABCDEFG'));
      } finally {
        await broker.destroy();
      }
    },
  );
}); // connect

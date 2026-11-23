import { ClientErrors, Mqtt, type MqttProperties, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assertEquals, assertExists, assertRejects } from '@std/assert';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}
Deno.test({ name: '@connect', only: false }, async (context) => {
  await context.step(
    'connect default value (v5.0)',
    async () => {
      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          logger: logger,
          url: new URL('ws://127.0.0.1:3000/'),
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
      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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
      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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
      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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
      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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

Deno.test({ name: '@connect ws failure leaves the client offline', only: false }, async (context) => {
  await context.step(
    'rejects with ConnectionClosed when the broker closes the connection before CONNACK',
    async () => {
      const broker = new TestWsBroker();
      try {
        broker.listen();
        let connects = 0;
        broker.on('connect', (event) => {
          const packet = event.detail;
          if (++connects === 1) {
            broker.closeConnectionFromBroker(packet.clientId);
          } else {
            broker.sendConnack(packet.clientId, false, packet.protocolVersion);
          }
        });

        const client = new WebSocketMqttClient({ url: new URL('ws://127.0.0.1:3000/'), clientId: 'cid', logger: logger });
        await assertRejects(() => client.connect(), ClientErrors.ConnectionClosed);

        // The client is offline: it can connect again right away.
        const connack = await client.connect();
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
        await client.disconnect(true);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'rejects with ConnectionClosed when the connection cannot be opened',
    async () => {
      // Nothing listens on this port.
      const client = new WebSocketMqttClient({ url: new URL('ws://127.0.0.1:3999/'), clientId: 'cid', logger: logger });
      await assertRejects(() => client.connect(), ClientErrors.ConnectionClosed);
      await assertRejects(() => client.connect(), ClientErrors.ConnectionClosed);
    },
  );

  await context.step(
    'ConnectTimeout while the WebSocket is being opened leaves the client offline',
    async () => {
      // Accepts TCP connections but never answers the WebSocket handshake.
      const listener = Deno.listen({ port: 3998 });
      const conns: Deno.Conn[] = [];
      const accepting = (async () => {
        for await (const conn of listener) {
          conns.push(conn);
        }
      })();
      try {
        const client = new WebSocketMqttClient({ url: new URL('ws://127.0.0.1:3998/'), clientId: 'cid', logger: logger, connectTimeoutMS: 200 });
        await assertRejects(() => client.connect(), ClientErrors.ConnectTimeout);
        // Not StateIsNotOfflineError: the client is offline again.
        await assertRejects(() => client.connect(), ClientErrors.ConnectTimeout);
      } finally {
        listener.close();
        await accepting.catch(() => {});
        conns.forEach((conn) => conn.close());
      }
    },
  );
}); // @connect ws failure leaves the client offline

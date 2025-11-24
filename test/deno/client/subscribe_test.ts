import { Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@subscribe', only: false }, async (context) => {
  await context.step(
    'subscribe qos0 single topic',
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
        broker.startRead(client.getClientId());

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.AT_MOST_ONCE);

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.GrantedQoS0],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.AT_MOST_ONCE);
        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS0);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe qos1 single topic',
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
        broker.startRead(client.getClientId());

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.AT_LEAST_ONCE);

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.GrantedQoS1],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.AT_LEAST_ONCE);
        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS1);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe qos2 single topic',
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
        broker.startRead(client.getClientId());

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.EXACTRY_ONCE);

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.GrantedQoS2],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.EXACTRY_ONCE);
        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS2);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe qos0 single topic (v3.1.1)',
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
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.AT_MOST_ONCE);

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
            [Mqtt.ReasonCode.GrantedQoS0],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.AT_MOST_ONCE);
        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS0);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe qos1 single topic (v3.1.1)',
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
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.AT_LEAST_ONCE);

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
            [Mqtt.ReasonCode.GrantedQoS1],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.AT_LEAST_ONCE);
        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS1);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe qos2 single topic (v3.1.1)',
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
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.EXACTRY_ONCE);

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
            [Mqtt.ReasonCode.GrantedQoS2],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.EXACTRY_ONCE);
        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS2);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe multi topics',
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
        broker.startRead(client.getClientId());

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.AT_MOST_ONCE);

          assertEquals(packet.subscriptions[1].topicFilter, 'topicB');
          assertEquals(packet.subscriptions[1].qos, Mqtt.QoS.AT_LEAST_ONCE);

          assertEquals(packet.subscriptions[2].topicFilter, 'topicC');
          assertEquals(packet.subscriptions[2].qos, Mqtt.QoS.EXACTRY_ONCE);

          assertEquals(packet.subscriptions[3].topicFilter, 'unspecified');
          assertEquals(packet.subscriptions[3].qos, Mqtt.QoS.EXACTRY_ONCE);

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.GrantedQoS0, Mqtt.ReasonCode.GrantedQoS1, Mqtt.ReasonCode.GrantedQoS2, Mqtt.ReasonCode.UnspecifiedError],
          );
        });

        const result = await client.subscribe(
          [
            { topicFilter: 'topicA', qos: Mqtt.QoS.AT_MOST_ONCE },
            { topicFilter: 'topicB', qos: Mqtt.QoS.AT_LEAST_ONCE },
            { topicFilter: 'topicC', qos: Mqtt.QoS.EXACTRY_ONCE },
            { topicFilter: 'unspecified', qos: Mqtt.QoS.EXACTRY_ONCE },
          ],
        );

        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS0);
        assertEquals(result.reasons[1], Mqtt.ReasonCode.GrantedQoS1);
        assertEquals(result.reasons[2], Mqtt.ReasonCode.GrantedQoS2);
        assertEquals(result.reasons[3], Mqtt.ReasonCode.UnspecifiedError);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe multi topics (v3.1.1)',
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
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        });

        await client.connect();
        broker.startRead(client.getClientId());

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.AT_MOST_ONCE);

          assertEquals(packet.subscriptions[1].topicFilter, 'topicB');
          assertEquals(packet.subscriptions[1].qos, Mqtt.QoS.AT_LEAST_ONCE);

          assertEquals(packet.subscriptions[2].topicFilter, 'topicC');
          assertEquals(packet.subscriptions[2].qos, Mqtt.QoS.EXACTRY_ONCE);

          assertEquals(packet.subscriptions[3].topicFilter, 'unspecified');
          assertEquals(packet.subscriptions[3].qos, Mqtt.QoS.EXACTRY_ONCE);

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
            [
              Mqtt.V3_1_1_SubscribeReturnCode.Success_MaximumQoS0,
              Mqtt.V3_1_1_SubscribeReturnCode.Success_MaximumQoS1,
              Mqtt.V3_1_1_SubscribeReturnCode.Success_MaximumQoS2,
              Mqtt.V3_1_1_SubscribeReturnCode.Failure,
            ],
          );
        });

        const result = await client.subscribe(
          [
            { topicFilter: 'topicA', qos: Mqtt.QoS.AT_MOST_ONCE },
            { topicFilter: 'topicB', qos: Mqtt.QoS.AT_LEAST_ONCE },
            { topicFilter: 'topicC', qos: Mqtt.QoS.EXACTRY_ONCE },
            { topicFilter: 'unspecified', qos: Mqtt.QoS.EXACTRY_ONCE },
          ],
        );

        assertEquals(result.reasons[0], Mqtt.V3_1_1_SubscribeReturnCode.Success_MaximumQoS0);
        assertEquals(result.reasons[1], Mqtt.V3_1_1_SubscribeReturnCode.Success_MaximumQoS1);
        assertEquals(result.reasons[2], Mqtt.V3_1_1_SubscribeReturnCode.Success_MaximumQoS2);
        assertEquals(result.reasons[3], Mqtt.V3_1_1_SubscribeReturnCode.Failure);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe single topic with subscribe options',
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
        broker.startRead(client.getClientId());

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.AT_MOST_ONCE);
          assertEquals(packet.subscriptions[0].retainHandling, Mqtt.RetainHandling.DoNotSend);
          assertEquals(packet.subscriptions[0].retainAsPublished, true);
          assertEquals(packet.subscriptions[0].noLocal, true);

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.GrantedQoS0],
          );
        });
        const result = await client.subscribe(
          { topicFilter: 'topicA', qos: Mqtt.QoS.AT_MOST_ONCE, retainHandling: Mqtt.RetainHandling.DoNotSend, retainAsPublished: true, noLocal: true },
        );

        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS0);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe multi topics with subscribe options',
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
        broker.startRead(client.getClientId());

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.AT_MOST_ONCE);
          assertEquals(packet.subscriptions[0].retainHandling, Mqtt.RetainHandling.AtTheTimeOfTheSubscribe);
          assertEquals(packet.subscriptions[0].retainAsPublished, true);
          assertEquals(packet.subscriptions[0].noLocal, true);

          assertEquals(packet.subscriptions[1].topicFilter, 'topicB');
          assertEquals(packet.subscriptions[1].qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.subscriptions[1].retainHandling, Mqtt.RetainHandling.AtSubscribeOnlyIfTheSubscriptionDoesNotCurrentlyExist);
          assertEquals(packet.subscriptions[1].retainAsPublished, false);
          assertEquals(packet.subscriptions[1].noLocal, false);

          assertEquals(packet.subscriptions[2].topicFilter, 'topicC');
          assertEquals(packet.subscriptions[2].qos, Mqtt.QoS.EXACTRY_ONCE);
          assertEquals(packet.subscriptions[2].retainHandling, Mqtt.RetainHandling.DoNotSend);
          assertEquals(packet.subscriptions[2].retainAsPublished, false);
          assertEquals(packet.subscriptions[2].noLocal, true);

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.GrantedQoS0, Mqtt.ReasonCode.GrantedQoS1, Mqtt.ReasonCode.GrantedQoS2],
          );
        });
        const result = await client.subscribe(
          [
            {
              topicFilter: 'topicA',
              qos: Mqtt.QoS.AT_MOST_ONCE,
              retainHandling: Mqtt.RetainHandling.AtTheTimeOfTheSubscribe,
              retainAsPublished: true,
              noLocal: true,
            },
            {
              topicFilter: 'topicB',
              qos: Mqtt.QoS.AT_LEAST_ONCE,
              retainHandling: Mqtt.RetainHandling.AtSubscribeOnlyIfTheSubscriptionDoesNotCurrentlyExist,
              retainAsPublished: false,
              noLocal: false,
            },
            { topicFilter: 'topicC', qos: Mqtt.QoS.EXACTRY_ONCE, retainHandling: Mqtt.RetainHandling.DoNotSend, retainAsPublished: false, noLocal: true },
          ],
        );

        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS0);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe single topic with properties',
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
        broker.startRead(client.getClientId());

        // test
        const properties: MqttProperties.SubscribeProperties = {
          userProperties: [
            { key: 'userProp1', val: 'userData1' },
            { key: 'userProp2', val: 'userData2' },
            { key: 'userProp2', val: 'userData3' },
          ],
          subscriptionIdentifier: 3,
        };

        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.AT_MOST_ONCE);

          assertEquals(packet.properties?.subscriptionIdentifier, 3);
          assertEquals(
            packet.properties?.userProperties,
            [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
          );

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.GrantedQoS0],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.AT_MOST_ONCE, properties);
        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS0);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe multi topics with properties',
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
        broker.startRead(client.getClientId());

        // test
        const properties: MqttProperties.SubscribeProperties = {
          userProperties: [
            { key: 'userProp1', val: 'userData1' },
            { key: 'userProp2', val: 'userData2' },
            { key: 'userProp2', val: 'userData3' },
          ],
          subscriptionIdentifier: 3,
        };

        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0].topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0].qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.subscriptions[0].retainHandling, Mqtt.RetainHandling.AtTheTimeOfTheSubscribe);
          assertEquals(packet.subscriptions[0].retainAsPublished, false);
          assertEquals(packet.subscriptions[0].noLocal, false);

          assertEquals(packet.subscriptions[1].topicFilter, 'topicB');
          assertEquals(packet.subscriptions[1].qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.subscriptions[1].retainHandling, Mqtt.RetainHandling.AtTheTimeOfTheSubscribe);
          assertEquals(packet.subscriptions[1].retainAsPublished, false);
          assertEquals(packet.subscriptions[1].noLocal, false);

          assertEquals(packet.subscriptions[2].topicFilter, 'topicC');
          assertEquals(packet.subscriptions[2].qos, Mqtt.QoS.AT_LEAST_ONCE);
          assertEquals(packet.subscriptions[2].retainHandling, Mqtt.RetainHandling.AtTheTimeOfTheSubscribe);
          assertEquals(packet.subscriptions[2].retainAsPublished, false);
          assertEquals(packet.subscriptions[2].noLocal, false);

          assertEquals(packet.properties?.subscriptionIdentifier, 3);
          assertEquals(
            packet.properties?.userProperties,
            [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
          );

          broker.sendSuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.GrantedQoS0],
          );
        });

        const result = await client.subscribe(
          ['topicA', 'topicB', 'topicC'],
          Mqtt.QoS.AT_LEAST_ONCE,
          properties,
        );

        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS0);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @subscribe

Deno.test({ name: '@receive malformed suback', only: false }, async (context) => {
  await context.step(
    'receive malformed suback (invalid properties) mqtt v5.0',
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

        // Subscribe to trigger SUBACK
        broker.on('subscribe', (event) => {
          const packet = event.detail;
          // Send malformed SUBACK with invalid property ID
          // SUBACK packet structure: Fixed Header | Packet ID | Properties Length | Properties | Reason Codes
          // Fixed Header: 0x90 (SUBACK packet type)
          // Packet ID: same as subscribe
          // Properties Length: 0x01 (1 byte)
          // Property ID: 0xFF (INVALID - not defined in MQTT spec)
          // Reason Codes: 0x00 (Success)
          const malformedPacket = new Uint8Array([
            0x90, // Fixed header: SUBACK packet type
            0x04, // Remaining length: 4 bytes (Packet ID 2 bytes + Properties Length 1 byte + Property ID 1 byte + Reason Code would be after properties but we make it invalid)
            (packet.packetId! >> 8) & 0xFF, // Packet ID high byte
            packet.packetId! & 0xFF, // Packet ID low byte
            0x01, // Properties Length: 1 byte
            0xFF, // Property ID: 0xFF (INVALID)
            // Missing Reason Codes payload but that's okay for malformed packet test
          ]);

          broker.sendRawBytes(client.getClientId(), malformedPacket);
        });

        client.subscribe('topicA', Mqtt.QoS.AT_LEAST_ONCE);

        await promise;
      } catch (err) {
        reject(err);
        fail(`error occurred: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @receive malformed suback

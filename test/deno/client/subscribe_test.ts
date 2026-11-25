import { ClientErrors, type ClientTypes, Mqtt, MqttClient, type MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertRejects, fail } from '@std/assert';

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

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtMostOnce);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV5,
            [Mqtt.ReasonCode.GrantedQoS0],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.AtMostOnce);
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

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtLeastOnce);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV5,
            [Mqtt.ReasonCode.GrantedQoS1],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.AtLeastOnce);
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

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.ExactlyOnce);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV5,
            [Mqtt.ReasonCode.GrantedQoS2],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.ExactlyOnce);
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
          protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1,
        });

        await client.connect();

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtMostOnce);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV3_1_1,
            [Mqtt.ReasonCode.GrantedQoS0],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.AtMostOnce);
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
          protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1,
        });

        await client.connect();

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtLeastOnce);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV3_1_1,
            [Mqtt.ReasonCode.GrantedQoS1],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.AtLeastOnce);
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
          protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1,
        });

        await client.connect();

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.ExactlyOnce);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV3_1_1,
            [Mqtt.ReasonCode.GrantedQoS2],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.ExactlyOnce);
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

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtMostOnce);

          assertEquals(packet.subscriptions[1]?.topicFilter, 'topicB');
          assertEquals(packet.subscriptions[1]?.qos, Mqtt.QoS.AtLeastOnce);

          assertEquals(packet.subscriptions[2]?.topicFilter, 'topicC');
          assertEquals(packet.subscriptions[2]?.qos, Mqtt.QoS.ExactlyOnce);

          assertEquals(packet.subscriptions[3]?.topicFilter, 'unspecified');
          assertEquals(packet.subscriptions[3]?.qos, Mqtt.QoS.ExactlyOnce);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV5,
            [Mqtt.ReasonCode.GrantedQoS0, Mqtt.ReasonCode.GrantedQoS1, Mqtt.ReasonCode.GrantedQoS2, Mqtt.ReasonCode.UnspecifiedError],
          );
        });

        const result = await client.subscribe(
          [
            { topicFilter: 'topicA', qos: Mqtt.QoS.AtMostOnce },
            { topicFilter: 'topicB', qos: Mqtt.QoS.AtLeastOnce },
            { topicFilter: 'topicC', qos: Mqtt.QoS.ExactlyOnce },
            { topicFilter: 'unspecified', qos: Mqtt.QoS.ExactlyOnce },
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
    'subscribe qos0 subscription takes precedence over the qos argument',
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

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtMostOnce);

          assertEquals(packet.subscriptions[1]?.topicFilter, 'topicB');
          assertEquals(packet.subscriptions[1]?.qos, Mqtt.QoS.ExactlyOnce);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV5,
            [Mqtt.ReasonCode.GrantedQoS0, Mqtt.ReasonCode.GrantedQoS2],
          );
        });

        const result = await client.subscribe(
          [
            { topicFilter: 'topicA', qos: Mqtt.QoS.AtMostOnce },
            { topicFilter: 'topicB', qos: Mqtt.QoS.ExactlyOnce },
          ],
          Mqtt.QoS.AtLeastOnce,
        );

        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS0);
        assertEquals(result.reasons[1], Mqtt.ReasonCode.GrantedQoS2);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe without subscription qos uses the qos argument',
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

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtLeastOnce);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV5,
            [Mqtt.ReasonCode.GrantedQoS1],
          );
        });

        const result = await client.subscribe(
          [
            // qos is required by the type; a JavaScript caller can still omit it.
            { topicFilter: 'topicA' } as ClientTypes.SubscriptionOption,
          ],
          Mqtt.QoS.AtLeastOnce,
        );

        assertEquals(result.reasons[0], Mqtt.ReasonCode.GrantedQoS1);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'subscribe without any qos defaults to qos0',
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

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.subscriptions.length, 1);
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtMostOnce);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV5,
            [Mqtt.ReasonCode.GrantedQoS0],
          );
        });

        // qos is required by the type; a JavaScript caller can still omit it.
        const objectResult = await client.subscribe({ topicFilter: 'topicA' } as ClientTypes.SubscriptionOption);
        assertEquals(objectResult.reasons[0], Mqtt.ReasonCode.GrantedQoS0);

        const stringResult = await client.subscribe('topicB');
        assertEquals(stringResult.reasons[0], Mqtt.ReasonCode.GrantedQoS0);
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
          protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1,
        });

        await client.connect();

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtMostOnce);

          assertEquals(packet.subscriptions[1]?.topicFilter, 'topicB');
          assertEquals(packet.subscriptions[1]?.qos, Mqtt.QoS.AtLeastOnce);

          assertEquals(packet.subscriptions[2]?.topicFilter, 'topicC');
          assertEquals(packet.subscriptions[2]?.qos, Mqtt.QoS.ExactlyOnce);

          assertEquals(packet.subscriptions[3]?.topicFilter, 'unspecified');
          assertEquals(packet.subscriptions[3]?.qos, Mqtt.QoS.ExactlyOnce);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV3_1_1,
            [
              Mqtt.V3_1_1_SubscribeReturnCode.SuccessMaximumQoS0,
              Mqtt.V3_1_1_SubscribeReturnCode.SuccessMaximumQoS1,
              Mqtt.V3_1_1_SubscribeReturnCode.SuccessMaximumQoS2,
              Mqtt.V3_1_1_SubscribeReturnCode.Failure,
            ],
          );
        });

        const result = await client.subscribe(
          [
            { topicFilter: 'topicA', qos: Mqtt.QoS.AtMostOnce },
            { topicFilter: 'topicB', qos: Mqtt.QoS.AtLeastOnce },
            { topicFilter: 'topicC', qos: Mqtt.QoS.ExactlyOnce },
            { topicFilter: 'unspecified', qos: Mqtt.QoS.ExactlyOnce },
          ],
        );

        assertEquals(result.reasons[0], Mqtt.V3_1_1_SubscribeReturnCode.SuccessMaximumQoS0);
        assertEquals(result.reasons[1], Mqtt.V3_1_1_SubscribeReturnCode.SuccessMaximumQoS1);
        assertEquals(result.reasons[2], Mqtt.V3_1_1_SubscribeReturnCode.SuccessMaximumQoS2);
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

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtMostOnce);
          assertEquals(packet.subscriptions[0]?.retainHandling, Mqtt.RetainHandling.DoNotSend);
          assertEquals(packet.subscriptions[0]?.retainAsPublished, true);
          assertEquals(packet.subscriptions[0]?.noLocal, true);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV5,
            [Mqtt.ReasonCode.GrantedQoS0],
          );
        });
        const result = await client.subscribe(
          { topicFilter: 'topicA', qos: Mqtt.QoS.AtMostOnce, retainHandling: Mqtt.RetainHandling.DoNotSend, retainAsPublished: true, noLocal: true },
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

        // test
        broker.on('subscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtMostOnce);
          assertEquals(packet.subscriptions[0]?.retainHandling, Mqtt.RetainHandling.AtTheTimeOfTheSubscribe);
          assertEquals(packet.subscriptions[0]?.retainAsPublished, true);
          assertEquals(packet.subscriptions[0]?.noLocal, true);

          assertEquals(packet.subscriptions[1]?.topicFilter, 'topicB');
          assertEquals(packet.subscriptions[1]?.qos, Mqtt.QoS.AtLeastOnce);
          assertEquals(packet.subscriptions[1]?.retainHandling, Mqtt.RetainHandling.AtSubscribeOnlyIfTheSubscriptionDoesNotCurrentlyExist);
          assertEquals(packet.subscriptions[1]?.retainAsPublished, false);
          assertEquals(packet.subscriptions[1]?.noLocal, false);

          assertEquals(packet.subscriptions[2]?.topicFilter, 'topicC');
          assertEquals(packet.subscriptions[2]?.qos, Mqtt.QoS.ExactlyOnce);
          assertEquals(packet.subscriptions[2]?.retainHandling, Mqtt.RetainHandling.DoNotSend);
          assertEquals(packet.subscriptions[2]?.retainAsPublished, false);
          assertEquals(packet.subscriptions[2]?.noLocal, true);

          broker.sendSuback(
            'cid',
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV5,
            [Mqtt.ReasonCode.GrantedQoS0, Mqtt.ReasonCode.GrantedQoS1, Mqtt.ReasonCode.GrantedQoS2],
          );
        });
        const result = await client.subscribe(
          [
            {
              topicFilter: 'topicA',
              qos: Mqtt.QoS.AtMostOnce,
              retainHandling: Mqtt.RetainHandling.AtTheTimeOfTheSubscribe,
              retainAsPublished: true,
              noLocal: true,
            },
            {
              topicFilter: 'topicB',
              qos: Mqtt.QoS.AtLeastOnce,
              retainHandling: Mqtt.RetainHandling.AtSubscribeOnlyIfTheSubscriptionDoesNotCurrentlyExist,
              retainAsPublished: false,
              noLocal: false,
            },
            { topicFilter: 'topicC', qos: Mqtt.QoS.ExactlyOnce, retainHandling: Mqtt.RetainHandling.DoNotSend, retainAsPublished: false, noLocal: true },
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
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtMostOnce);

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
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV5,
            [Mqtt.ReasonCode.GrantedQoS0],
          );
        });
        const result = await client.subscribe('topicA', Mqtt.QoS.AtMostOnce, properties);
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
          assertEquals(packet.subscriptions[0]?.topicFilter, 'topicA');
          assertEquals(packet.subscriptions[0]?.qos, Mqtt.QoS.AtLeastOnce);
          assertEquals(packet.subscriptions[0]?.retainHandling, Mqtt.RetainHandling.AtTheTimeOfTheSubscribe);
          assertEquals(packet.subscriptions[0]?.retainAsPublished, false);
          assertEquals(packet.subscriptions[0]?.noLocal, false);

          assertEquals(packet.subscriptions[1]?.topicFilter, 'topicB');
          assertEquals(packet.subscriptions[1]?.qos, Mqtt.QoS.AtLeastOnce);
          assertEquals(packet.subscriptions[1]?.retainHandling, Mqtt.RetainHandling.AtTheTimeOfTheSubscribe);
          assertEquals(packet.subscriptions[1]?.retainAsPublished, false);
          assertEquals(packet.subscriptions[1]?.noLocal, false);

          assertEquals(packet.subscriptions[2]?.topicFilter, 'topicC');
          assertEquals(packet.subscriptions[2]?.qos, Mqtt.QoS.AtLeastOnce);
          assertEquals(packet.subscriptions[2]?.retainHandling, Mqtt.RetainHandling.AtTheTimeOfTheSubscribe);
          assertEquals(packet.subscriptions[2]?.retainAsPublished, false);
          assertEquals(packet.subscriptions[2]?.noLocal, false);

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
            packet.packetId,
            Mqtt.ProtocolVersion.MqttV5,
            [Mqtt.ReasonCode.GrantedQoS0],
          );
        });

        const result = await client.subscribe(
          ['topicA', 'topicB', 'topicC'],
          Mqtt.QoS.AtLeastOnce,
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
          protocolVersion: Mqtt.ProtocolVersion.MqttV5,
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
            (packet.packetId >> 8) & 0xFF, // Packet ID high byte
            packet.packetId & 0xFF, // Packet ID low byte
            0x01, // Properties Length: 1 byte
            0xFF, // Property ID: 0xFF (INVALID)
            // Missing Reason Codes payload but that's okay for malformed packet test
          ]);

          broker.sendRawBytes(client.clientId, malformedPacket);
        });

        client.subscribe('topicA', Mqtt.QoS.AtLeastOnce);

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

Deno.test({ name: '@subscribe invalid arguments', only: false }, async (context) => {
  await context.step(
    'rejects invalid topic filters, options and properties and sends nothing',
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

        const received: { packetId: number; topicFilters: string[] }[] = [];
        broker.on('subscribe', (event) => {
          const packet = event.detail;
          received.push({ packetId: packet.packetId, topicFilters: packet.subscriptions.map((sub) => sub.topicFilter) });
          broker.sendSuback('cid', packet.packetId, Mqtt.ProtocolVersion.MqttV5, [Mqtt.ReasonCode.GrantedQoS0]);
        });

        // topic filters
        for (
          const topicFilter of [
            '',
            'a/#/b',
            'a#',
            'a/b+',
            '+a',
            'a\u0000',
            'a\uD800',
            '$share/',
            '$share/g',
            '$share//a',
            '$share/g/',
            '$share/g+/a',
            '$share/g\u0000x/a',
          ]
        ) {
          await assertRejects(() => client.subscribe(topicFilter), ClientErrors.InvalidTopicFilterError);
        }
        await assertRejects(() => client.subscribe(['topicA', 'a/#/b']), ClientErrors.InvalidTopicFilterError);

        // other arguments and options
        await assertRejects(() => client.subscribe([]), ClientErrors.InvalidArgumentError);
        await assertRejects(() => client.subscribe('topicA', 3 as Mqtt.QoS), ClientErrors.InvalidArgumentError);
        await assertRejects(() => client.subscribe({ topicFilter: 'topicA', qos: -1 as Mqtt.QoS }), ClientErrors.InvalidArgumentError);
        await assertRejects(
          () => client.subscribe({ topicFilter: 'topicA', qos: Mqtt.QoS.AtMostOnce, retainHandling: 3 as Mqtt.RetainHandling }),
          ClientErrors.InvalidArgumentError,
        );
        await assertRejects(
          () => client.subscribe({ topicFilter: '$share/group/topicA', qos: Mqtt.QoS.AtMostOnce, noLocal: true }),
          ClientErrors.InvalidArgumentError,
        );

        // properties
        await assertRejects(() => client.subscribe('topicA', Mqtt.QoS.AtMostOnce, { subscriptionIdentifier: 0 }), ClientErrors.InvalidPropertyError);
        await assertRejects(
          () => client.subscribe('topicA', Mqtt.QoS.AtMostOnce, { userProperties: [{ key: 'k', val: 'v\u0000' }] }),
          ClientErrors.InvalidPropertyError,
        );
        // An ignored rejection does not become an unhandled rejection.
        client.subscribe('a/#/b');

        // Nothing was sent and no packet ID was acquired: the next valid subscribe is the first SUBSCRIBE, with packet ID 1.
        await client.subscribe('$share/group/topicA');
        assertEquals(received, [{ packetId: 1, topicFilters: ['$share/group/topicA'] }]);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @subscribe invalid arguments

Deno.test({ name: '@subscribe too large', only: false }, async (context) => {
  await context.step(
    'a packet larger than the Maximum Packet Size of the broker is rejected, and its packet ID is released',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success, { maximumPacketSize: 32 });
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger });
        await client.connect();

        const packetIds: number[] = [];
        broker.on('subscribe', (event) => {
          const packet = event.detail;
          packetIds.push(packet.packetId);
          broker.sendSuback('cid', packet.packetId, Mqtt.ProtocolVersion.MqttV5, [Mqtt.ReasonCode.GrantedQoS0]);
        });
        broker.on('unsubscribe', (event) => {
          const packet = event.detail;
          packetIds.push(packet.packetId);
          broker.sendUnsuback('cid', packet.packetId, Mqtt.ProtocolVersion.MqttV5, [Mqtt.ReasonCode.Success]);
        });

        const longFilter = 'a'.repeat(40);
        await assertRejects(() => client.subscribe(longFilter), ClientErrors.PacketTooLargeError, 'SUBSCRIBE');
        await assertRejects(() => client.unsubscribe(longFilter), ClientErrors.PacketTooLargeError, 'UNSUBSCRIBE');

        // Nothing was sent and the packet IDs were released.
        await client.subscribe('topicA');
        await client.unsubscribe('topicA');
        assertEquals(packetIds, [1, 1]);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @subscribe too large

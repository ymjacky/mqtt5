import { Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertExists, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@unsubscribe', only: false }, async (context) => {
  await context.step(
    'unsubscribe single topic',
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
        broker.on('unsubscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.topicFilters[0], 'topicA');

          broker.sendUnsuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.Success],
          );
        });
        const result = await client.unsubscribe('topicA');
        assertEquals(result.reasonCodes![0], Mqtt.ReasonCode.Success);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'unsubscribe single topic (v3.1.1)',
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
        broker.on('unsubscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.topicFilters[0], 'topicA');

          broker.sendUnsuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
          );
        });
        const result = await client.unsubscribe('topicA');
        assertExists(result);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'unsubscribe multi topics',
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
        broker.on('unsubscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.topicFilters[0], 'topicA');
          assertEquals(packet.topicFilters[1], 'topicB');
          assertEquals(packet.topicFilters[2], 'topicC');
          assertEquals(packet.topicFilters[3], 'unspecified');

          broker.sendUnsuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.Success, Mqtt.ReasonCode.Success, Mqtt.ReasonCode.Success, Mqtt.ReasonCode.UnspecifiedError],
          );
        });

        const result = await client.unsubscribe(
          [
            'topicA',
            'topicB',
            'topicC',
            'unspecified',
          ],
        );
        assertEquals(result.reasonCodes![0], Mqtt.ReasonCode.Success);
        assertEquals(result.reasonCodes![1], Mqtt.ReasonCode.Success);
        assertEquals(result.reasonCodes![2], Mqtt.ReasonCode.Success);
        assertEquals(result.reasonCodes![3], Mqtt.ReasonCode.UnspecifiedError);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'unsubscribe multi topics (v3.1.1)',
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
        broker.on('unsubscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.topicFilters[0], 'topicA');
          assertEquals(packet.topicFilters[1], 'topicB');
          assertEquals(packet.topicFilters[2], 'topicC');
          assertEquals(packet.topicFilters[3], 'unspecified');

          broker.sendUnsuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V3_1_1,
          );
        });

        const result = await client.unsubscribe(
          [
            'topicA',
            'topicB',
            'topicC',
            'unspecified',
          ],
        );
        assertExists(result);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'unsubscribe single topic with properties',
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
        const properties: MqttProperties.UnsubscribeProperties = {
          userProperties: [
            { key: 'userProp1', val: 'userData1' },
            { key: 'userProp2', val: 'userData2' },
            { key: 'userProp2', val: 'userData3' },
          ],
        };

        broker.on('unsubscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.topicFilters[0], 'topicA');

          assertEquals(
            packet.properties?.userProperties,
            [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
          );

          broker.sendUnsuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.Success],
          );
        });
        const result = await client.unsubscribe('topicA', properties);
        assertEquals(result.reasonCodes![0], Mqtt.ReasonCode.Success);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'unsubscribe multi topics with properties',
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
        const properties: MqttProperties.UnsubscribeProperties = {
          userProperties: [
            { key: 'userProp1', val: 'userData1' },
            { key: 'userProp2', val: 'userData2' },
            { key: 'userProp2', val: 'userData3' },
          ],
        };

        broker.on('unsubscribe', (event) => {
          const packet = event.detail;

          assertEquals(packet.packetId, 1);
          assertEquals(packet.topicFilters[0], 'topicA');
          assertEquals(packet.topicFilters[1], 'topicB');
          assertEquals(packet.topicFilters[2], 'topicC');
          assertEquals(packet.topicFilters[3], 'unspecified');

          assertEquals(
            packet.properties?.userProperties,
            [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
          );

          const unsubackProperties: MqttProperties.UnsubackProperties = {
            userProperties: [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
            reasonString: 'unspecified error',
          };
          broker.sendUnsuback(
            'cid',
            packet.packetId!,
            Mqtt.ProtocolVersion.MQTT_V5,
            [Mqtt.ReasonCode.Success, Mqtt.ReasonCode.Success, Mqtt.ReasonCode.Success, Mqtt.ReasonCode.UnspecifiedError],
            unsubackProperties,
          );
        });

        const result = await client.unsubscribe(
          ['topicA', 'topicB', 'topicC', 'unspecified'],
          properties,
        );

        assertEquals(result.reasonCodes![0], Mqtt.ReasonCode.Success);
        assertEquals(result.reasonCodes![1], Mqtt.ReasonCode.Success);
        assertEquals(result.reasonCodes![2], Mqtt.ReasonCode.Success);
        assertEquals(result.reasonCodes![3], Mqtt.ReasonCode.UnspecifiedError);
        assertEquals(result.reason, 'unspecified error');
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @unsubscribe

Deno.test({ name: '@receive malformed unsuback', only: false }, async (context) => {
  await context.step(
    'receive malformed unsuback (invalid properties) mqtt v5.0',
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

        // Unsubscribe to trigger UNSUBACK
        broker.on('unsubscribe', (event) => {
          const packet = event.detail;
          // Send malformed UNSUBACK with invalid property ID
          // UNSUBACK packet structure: Fixed Header | Packet ID | Properties Length | Properties | Reason Codes
          // Fixed Header: 0xB0 (UNSUBACK packet type)
          // Packet ID: same as unsubscribe
          // Properties Length: 0x01 (1 byte)
          // Property ID: 0xFF (INVALID - not defined in MQTT spec)
          // Reason Codes: 0x00 (Success)
          const malformedPacket = new Uint8Array([
            0xB0, // Fixed header: UNSUBACK packet type
            0x04, // Remaining length: 4 bytes (Packet ID 2 bytes + Properties Length 1 byte + Property ID 1 byte)
            (packet.packetId! >> 8) & 0xFF, // Packet ID high byte
            packet.packetId! & 0xFF, // Packet ID low byte
            0x01, // Properties Length: 1 byte
            0xFF, // Property ID: 0xFF (INVALID)
            // Missing Reason Codes payload but that's okay for malformed packet test
          ]);

          broker.sendRawBytes(client.getClientId(), malformedPacket);
        });

        client.unsubscribe('topicA');

        await promise;
      } catch (err) {
        reject(err);
        fail(`error occurred: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @receive malformed unsuback

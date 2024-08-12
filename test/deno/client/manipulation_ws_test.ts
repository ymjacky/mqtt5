import { ClientErrors, Mqtt, MqttPackets, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assert, assertEquals, assertExists, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@manipulation', only: false }, async (context) => {
  await context.step(
    'connect overlap',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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

        await client.connect().catch((err: Error) => {
          assert(err instanceof ClientErrors.StateIsNotOfflineError);
          resolve();
        });

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
    'disconnect twice',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.getClientId());
        });

        let closedCount = 0;
        client.on('closed', () => {
          closedCount++;
          assertEquals(closedCount, 1);
          resolve();
        });

        await client.disconnect();
        await client.disconnect();

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
    'disconnect twice, server do not close',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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

        let closedCount = 0;
        client.on('closed', () => {
          closedCount++;
          assertEquals(closedCount, 1);
          resolve();
        });

        await client.disconnect();
        await client.disconnect();

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
    'disconnect force twice',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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

        let closedCount = 0;
        client.on('closed', () => {
          closedCount++;
          assertEquals(closedCount, 1);
          resolve();
        });

        await client.disconnect(true);
        await client.disconnect(true);

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
    'send big publish',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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

        const bigData = new Uint8Array(268_435_456 + 1);
        bigData.fill(0xFF);

        await client.publish(
          'topicA',
          bigData,
          { qos: Mqtt.QoS.AT_LEAST_ONCE },
        ).catch((err: Error) => {
          assert(err instanceof MqttPackets.MqttPacketsError.MqttPacketSerializeError);
          resolve();
        });

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
    'disconnect befor connect',
    async () => {
      try {
        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        await client.disconnect();
      } catch (err) {
        fail(err);
      }
    },
  );

  await context.step(
    'publish befor connect',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          { qos: Mqtt.QoS.AT_LEAST_ONCE },
        ).catch((err: Error) => {
          assert(err instanceof ClientErrors.StateIsNotOnlineError);
          resolve();
        });

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
    'publish after disconnect',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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

        broker.on('disconnect', () => {
          broker.closeConnectionFromBroker(client.getClientId());
        });
        await client.disconnect();

        await client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          { qos: Mqtt.QoS.AT_LEAST_ONCE },
        ).catch((err: Error) => {
          assert(err instanceof ClientErrors.StateIsNotOnlineError);
          resolve();
        });

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
    'disconnect during connect',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        broker.on('disconnect', () => {
          broker.closeConnectionFromBroker(client.getClientId());
          resolve();
        });
        broker.on('connect', () => {
          broker.sendConnack(client.getClientId(), false, Mqtt.ProtocolVersion.MQTT_V5);
        });

        client.connect();
        client.disconnect();

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
    'publish during connect',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        broker.on('connect', () => {
          broker.sendConnack(client.getClientId(), false, Mqtt.ProtocolVersion.MQTT_V5);
          resolve();
        });

        client.connect();
        client.publish(
          'topicA',
          new TextEncoder().encode('payloadA'),
          { qos: Mqtt.QoS.AT_LEAST_ONCE },
        ).catch((err: Error) => {
          assert(err instanceof ClientErrors.StateIsNotOnlineError);
        });

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
    'unkown packetId, puback',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 2,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        broker.on('pingreq', () => {
          resolve();
        });

        await client.connect();

        broker.sendPuback(client.getClientId(), 999, Mqtt.ProtocolVersion.MQTT_V5);

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
    'unkown packetId, pubrec',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 2,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        broker.on('pubrel', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 999);
          assertEquals(packet.reasonCode, Mqtt.ReasonCode.PacketIdentifierNotFound);
          resolve();
        });

        await client.connect();

        broker.sendPubrec(client.getClientId(), 999, Mqtt.ProtocolVersion.MQTT_V5);

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
    'unkown packetId, pubrel',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 2,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        broker.on('pubcomp', (event) => {
          const packet = event.detail;
          assertEquals(packet.packetId, 999);
          assertEquals(packet.reasonCode, Mqtt.ReasonCode.PacketIdentifierNotFound);
          resolve();
        });

        await client.connect();

        broker.sendPubrel(client.getClientId(), 999, Mqtt.ProtocolVersion.MQTT_V5);

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
    'unkown packetId, pubcomp',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 2,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        broker.on('pingreq', () => {
          resolve();
        });

        await client.connect();

        broker.sendPubcomp(client.getClientId(), 999, Mqtt.ProtocolVersion.MQTT_V5);

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
    'unkown packetId, suback',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 2,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        broker.on('pingreq', () => {
          resolve();
        });

        await client.connect();

        broker.sendSuback(client.getClientId(), 999, Mqtt.ProtocolVersion.MQTT_V5);

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
    'unkown packetId, unsuback',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 2,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        broker.on('pingreq', () => {
          resolve();
        });

        await client.connect();

        broker.sendUnsuback(client.getClientId(), 999, Mqtt.ProtocolVersion.MQTT_V5);

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
    'keep alive',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: -1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        broker.on('pingreq', () => {
          fail('A pingreq event has occurred');
        });

        setTimeout(() => {
          resolve();
        }, 12 * 1000);

        await promise;
      } catch (err) {
        fail(err);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // manipulation

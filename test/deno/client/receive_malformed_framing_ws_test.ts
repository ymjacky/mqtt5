import { Mqtt, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

// Regression tests for a framing-level malformed packet: a Remaining Length
// whose continuation bit is still set after 4 bytes is invalid per the MQTT
// spec (a "Malformed Variable Byte Integer"). Once this happens the byte
// buffer can no longer be safely resynchronized, so the client must stop
// interpreting further bytes on this connection and close it (notifying the
// peer first when the protocol version allows it).
Deno.test({ name: '@receive malformed packet (framing error) ws', only: false }, async (context) => {
  await context.step(
    'invalid remaining length mqtt v3.1.1 closes without sending DISCONNECT',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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

        // v3.1.1 has no reason code on DISCONNECT, so the client closes the
        // connection directly instead of sending a (misleading) DISCONNECT.
        broker.on('disconnect', () => {
          fail('client should not send a DISCONNECT packet for a framing error on v3.1.1');
        });

        client.on('closed', () => {
          logger('Client connection closed');
          resolve();
        });

        // Fixed header (PUBLISH, QoS 0) followed by 4 Remaining Length bytes
        // that all have the continuation bit set: a malformed variable byte
        // integer.
        const malformedPacket = new Uint8Array([0x30, 0xFF, 0xFF, 0xFF, 0xFF]);

        broker.sendRawBytes(client.getClientId(), malformedPacket);

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
    'invalid remaining length mqtt v5.0 sends DISCONNECT with MalformedPacket reason code',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          clientId: 'cid',
          url: new URL('ws://127.0.0.1:3000/'),
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

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          logger('Broker received DISCONNECT', packet);
          assertEquals(packet.reasonCode, Mqtt.ReasonCode.MalformedPacket);
          resolve();
        });

        client.on('closed', () => {
          logger('Client connection closed');
        });

        const malformedPacket = new Uint8Array([0x30, 0xFF, 0xFF, 0xFF, 0xFF]);

        broker.sendRawBytes(client.getClientId(), malformedPacket);

        await promise;
      } catch (err) {
        reject(err);
        fail(`error occurred: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @receive malformed packet (framing error) ws

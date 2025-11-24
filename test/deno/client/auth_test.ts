import { Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@auth', only: false }, async (context) => {
  await context.step(
    'auth',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

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
          broker.startRead(client.getClientId());

          const packet = event.detail;
          assertEquals(packet.properties?.authenticationMethod, 'SCRAM-SHA-1');
          const authPropertie: MqttProperties.AuthProperties = {
            authenticationMethod: packet.properties?.authenticationMethod,
            authenticationData: new TextEncoder().encode('saltA'),
          };
          broker.sendAuth(packet.clientId, Mqtt.ReasonCode.ContinueAuthentication, authPropertie);
        });
        broker.on('auth', (event) => {
          const packet = event.detail;
          assertEquals(packet.properties?.authenticationMethod, 'SCRAM-SHA-1');
          assertEquals(packet.properties?.authenticationData, new TextEncoder().encode('myData:saltA'));

          const connackPropertie: MqttProperties.ConnackProperties = {
            authenticationMethod: packet.properties?.authenticationMethod,
          };
          broker.sendConnack(client.getClientId(), false, Mqtt.ProtocolVersion.MQTT_V5, Mqtt.ReasonCode.Success, connackPropertie);
          resolve();
        });

        client.on('auth', (event) => {
          const packet = event.detail;
          assertEquals(packet.properties?.authenticationMethod, 'SCRAM-SHA-1');
          const salt = new TextDecoder().decode(packet.properties?.authenticationData);
          assertEquals(salt, 'saltA');
          const response = new Uint8Array([...new TextEncoder().encode(`myData:${salt}`)]);

          const authPropertie: MqttProperties.AuthProperties = {
            authenticationMethod: packet.properties!.authenticationMethod,
            authenticationData: response,
          };
          client.auth(Mqtt.ReasonCode.ContinueAuthentication, authPropertie);
        });

        const connectProperties: MqttProperties.ConnectProperties = {
          authenticationMethod: 'SCRAM-SHA-1',
        };
        const connack = await client.connect({ properties: connectProperties });
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
        assertEquals(connack.properties?.authenticationMethod, 'SCRAM-SHA-1');

        await promise;
      } catch (err) {
        reject();
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // auth

Deno.test({ name: '@receive malformed auth', only: false }, async (context) => {
  await context.step(
    'receive malformed auth (invalid properties) mqtt v5.0',
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

        // Create malformed AUTH packet with invalid properties
        // AUTH packet structure: Fixed Header | Reason Code | Properties Length | Properties
        // Fixed Header: 0xF0 (AUTH packet type)
        // Reason Code: 0x18 (Continue authentication = 24)
        // Properties Length: 0x0A (10 bytes) but we only provide 5 bytes -> malformed
        const malformedPacket = new Uint8Array([
          0xF0, // Fixed header: AUTH packet type
          0x07, // Remaining length: 7 bytes
          0x18, // Reason Code: Continue authentication (24)
          0x0A, // Properties Length: 10 bytes (WRONG - actual data is only 5 bytes)
          0x15, // Property ID: Authentication Method (21)
          0x00,
          0x03, // String length: 3
          0x66,
          0x6F,
          0x6F, // "foo"
          // Missing 5 bytes that Properties Length claims to have
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
}); // @receive malformed auth

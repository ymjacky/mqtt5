import { ClientErrors, Mqtt, MqttClient, type MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertRejects, fail } from '@std/assert';

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
          broker.sendConnack(client.clientId, false, Mqtt.ProtocolVersion.MqttV5, Mqtt.ReasonCode.Success, connackPropertie);
          resolve();
        });

        client.on('auth', (event) => {
          const packet = event.detail;
          assertEquals(packet.properties?.authenticationMethod, 'SCRAM-SHA-1');
          const salt = new TextDecoder().decode(packet.properties?.authenticationData);
          assertEquals(salt, 'saltA');
          const response = new Uint8Array([...new TextEncoder().encode(`myData:${salt}`)]);

          const authPropertie: MqttProperties.AuthProperties = {
            authenticationMethod: packet.properties?.authenticationMethod,
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

  await context.step(
    'auth while not connected',
    async () => {
      const client = new MqttClient({
        clientId: 'cid',
        logger: logger,
      });

      // ignored on purpose: the rejection must not terminate the process
      client.auth(Mqtt.ReasonCode.ContinueAuthentication);

      await assertRejects(() => client.auth(Mqtt.ReasonCode.ContinueAuthentication), ClientErrors.SendPacketError);
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

        await broker.sendRawBytes(client.clientId, malformedPacket);

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

Deno.test({ name: '@auth too large', only: false }, async (context) => {
  await context.step(
    'leaves out the Reason String and User Properties when they make AUTH larger than the Maximum Packet Size',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success, { maximumPacketSize: 64 });
        });
        const { promise, resolve } = Promise.withResolvers<void>();
        const received: (MqttProperties.AuthProperties | undefined)[] = [];
        broker.on('auth', (event) => {
          received.push(event.detail.properties);
          resolve();
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger });
        await client.connect();

        // Still too large without them: nothing is sent.
        await assertRejects(
          () => client.auth(Mqtt.ReasonCode.ReAuthenticate, { authenticationMethod: 'M', authenticationData: new Uint8Array(100) }),
          ClientErrors.PacketTooLargeError,
          'Maximum Packet Size 64',
        );

        // [MQTT-3.15.2-2], [MQTT-3.15.2-3]
        await client.auth(Mqtt.ReasonCode.ReAuthenticate, {
          authenticationMethod: 'M',
          reasonString: 'a'.repeat(100),
          userProperties: [{ key: 'k', val: 'v' }],
        });
        await promise;
        assertEquals(received, [{ authenticationMethod: 'M' }]);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @auth too large

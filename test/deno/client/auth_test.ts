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
        fail(err);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // auth

import { Mqtt, MqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}
Deno.test({ name: '@connect_tls', only: false }, async (context) => {
  await context.step(
    'connect v3.1.1',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listenTls();

        const client = new MqttClient({
          clientId: 'cid',
          url: new URL('mqtts://127.0.0.1:8883'),
          username: 'myname',
          password: 'mypass',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          protocolVersion: 4,
          keepAlive: 20,
          caCerts: [Deno.readTextFileSync('test/deno/test_certs/ca.crt.pem')],
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
        broker.listenTls();

        const client = new MqttClient({
          clientId: 'cid',
          url: new URL('mqtts://127.0.0.1:8883'),
          username: 'myname',
          password: 'mypass',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          protocolVersion: 5,
          keepAlive: 20,
          caCerts: [Deno.readTextFileSync('test/deno/test_certs/ca.crt.pem')],
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
}); // connect_tls

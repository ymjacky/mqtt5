import { ClientErrors, Mqtt, MqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assert, assertEquals, assertRejects } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@keepAliveTimeout', only: false }, async (context) => {
  await context.step(
    'send PINGREQ and keep the connection when PINGRESP is received',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          keepAlive: 1,
          pingrespTimeoutMS: 500,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        let closed = false;
        client.on('closed', () => {
          closed = true;
          resolve(); // fail fast instead of waiting for a PINGREQ that never comes
        });

        // Without PINGRESP the client would disconnect 500 ms after the first PINGREQ,
        // so the second PINGREQ (1 s after the first) shows the PINGRESP timeout was stopped.
        let pingreqCount = 0;
        broker.on('pingreq', () => {
          pingreqCount++;
          broker.sendPingresp('cid', Mqtt.ProtocolVersion.MQTT_V5);
          if (pingreqCount === 2) {
            resolve();
          }
        });

        await client.connect();
        await promise;

        assertEquals(closed, false);
        await client.disconnect(true);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'send PINGREQ and keep the connection when PINGRESP is received (v3.1.1)',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
          keepAlive: 1,
          pingrespTimeoutMS: 500,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        let closed = false;
        client.on('closed', () => {
          closed = true;
          resolve(); // fail fast instead of waiting for a PINGREQ that never comes
        });

        let pingreqCount = 0;
        broker.on('pingreq', () => {
          pingreqCount++;
          broker.sendPingresp('cid', Mqtt.ProtocolVersion.MQTT_V3_1_1);
          if (pingreqCount === 2) {
            resolve();
          }
        });

        await client.connect();
        await promise;

        assertEquals(closed, false);
        await client.disconnect(true);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'close the connection when PINGRESP is not received',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          keepAlive: 1,
          pingrespTimeoutMS: 200,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        let pingreqReceived = false;
        broker.on('pingreq', () => {
          // do not reply PINGRESP
          pingreqReceived = true;
        });

        client.on('closed', () => {
          resolve();
        });

        await client.connect();
        await promise;

        assert(pingreqReceived, 'PINGREQ was not sent before closing');
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'connect rejects with ConnectTimeout when CONNACK is not received',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          connectTimeoutMS: 200,
        });

        // do not reply CONNACK

        await assertRejects(
          () => client.connect(),
          ClientErrors.ConnectTimeout,
        );
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'connect rejects when the connection cannot be opened',
    async () => {
      // Get a port nobody is listening on.
      const listener = Deno.listen({ port: 0, transport: 'tcp' });
      const { port } = listener.addr as Deno.NetAddr;
      listener.close();

      const client = new MqttClient({
        url: new URL(`mqtt://127.0.0.1:${port}`),
        clientId: 'cid',
        logger: logger,
      });

      await assertRejects(
        () => client.connect(),
        Deno.errors.ConnectionRefused,
      );
    },
  );

  await context.step(
    'connect rejects with UnexpectedUrlProtocol for an unsupported URL protocol',
    async () => {
      const client = new MqttClient({
        url: new URL('ws://127.0.0.1:1883'),
        clientId: 'cid',
        logger: logger,
      });

      await assertRejects(
        () => client.connect(),
        ClientErrors.UnexpectedUrlProtocol,
      );
    },
  );
});

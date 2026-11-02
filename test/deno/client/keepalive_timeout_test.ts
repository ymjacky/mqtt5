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

  await context.step(
    'keepAlive 0 is sent as 0',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          keepAlive: 0,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertEquals(packet.keepAlive, 0);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();
        await client.disconnect(true);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'use Server Keep Alive when the client sent 0',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          keepAlive: 0,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success, { serverKeepAlive: 1 });
        });

        broker.on('pingreq', () => {
          broker.sendPingresp('cid', Mqtt.ProtocolVersion.MQTT_V5);
          resolve();
        });

        await client.connect();
        await promise;
        await client.disconnect(true);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'use Server Keep Alive when it is higher than keepAlive',
    async () => {
      const { promise, resolve } = Promise.withResolvers<number>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          keepAlive: 1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success, { serverKeepAlive: 2 });
        });

        let connectedAt = 0;
        broker.on('pingreq', () => {
          broker.sendPingresp('cid', Mqtt.ProtocolVersion.MQTT_V5);
          resolve(Date.now() - connectedAt);
        });

        await client.connect();
        connectedAt = Date.now();

        // keepAlive (1 s) would send PINGREQ after about 1000 ms.
        const elapsed = await promise;
        assert(elapsed >= 1500, `PINGREQ was sent after ${elapsed} ms`);
        await client.disconnect(true);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'Server Keep Alive 0 disables keep alive',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          keepAlive: 1,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success, { serverKeepAlive: 0 });
        });

        let pingreqReceived = false;
        broker.on('pingreq', () => {
          pingreqReceived = true;
        });

        await client.connect();

        // keepAlive (1 s) would send PINGREQ after about 1000 ms.
        await new Promise((resolve) => setTimeout(resolve, 1500));

        assertEquals(pingreqReceived, false);
        await client.disconnect(true);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'Server Keep Alive applies only to that connection',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          keepAlive: 20,
        });

        const sentKeepAlives: (number | undefined)[] = [];
        broker.on('connect', (event) => {
          const packet = event.detail;
          sentKeepAlives.push(packet.keepAlive);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success, { serverKeepAlive: 5 });
        });

        await client.connect();
        await client.disconnect(true);
        await client.connect();
        await client.disconnect(true);

        assertEquals(sentKeepAlives, [20, 20]);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'timeouts that are not positive use the default',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          connectTimeoutMS: 0,
          disconnectTimeoutMS: -1,
          pingrespTimeoutMS: 0,
        });

        // A connect timeout of 0 ms would reject before this CONNACK arrives.
        broker.on('connect', (event) => {
          const packet = event.detail;
          setTimeout(() => {
            broker.sendConnack(packet.clientId, false, packet.protocolVersion);
          }, 100);
        });

        const connack = await client.connect();
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
        await client.disconnect(true);
      } finally {
        await broker.destroy();
      }
    },
  );
});

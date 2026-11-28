import { ClientErrors, Mqtt, MqttClient, MqttPackets, type MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertExists, assertInstanceOf, assertRejects, fail } from '@std/assert';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@closing', only: false }, async (context) => {
  await context.step(
    'disconnect',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          resolve();
        });
        await client.disconnect();

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect, wait closed',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          broker.closeConnectionFromBroker(client.clientId);
        });

        client.on('closed', () => {
          resolve();
        });
        await client.disconnect();

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect, close myself',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
        });

        client.on('closed', () => {
          resolve();
        });
        await client.disconnect();

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect with properties',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        // DISCONNECT can have a Session Expiry Interval other than 0 only when CONNECT has one.
        await client.connect({ properties: { sessionExpiryInterval: 600 } });

        const properties: MqttProperties.DisconnectProperties = {
          reasonString: 'trouble',
          sessionExpiryInterval: 300,
        };
        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertEquals(packet.properties?.reasonString, 'trouble');
          assertEquals(packet.properties?.sessionExpiryInterval, 300);
          resolve();
        });
        await client.disconnect({ properties });

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect force',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        broker.on('closed', () => {
          resolve();
        });
        await client.disconnect({ force: true });

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect twice',
    async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

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
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertExists(packet);
          resolve();
        });
        client.disconnect();

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect called concurrently',
    async () => {
      const broker = new TestBroker();
      let timer: ReturnType<typeof setTimeout> | undefined;

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
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        let disconnectCount = 0;
        broker.on('disconnect', () => {
          disconnectCount++;
          broker.closeConnectionFromBroker('cid');
        });

        const timeout = new Promise<string>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), 3000);
        });
        const result = await Promise.race([
          Promise.all([client.disconnect(), client.disconnect()]).then(() => 'resolved'),
          timeout,
        ]);

        // both calls resolve when the connection is closed, and DISCONNECT is sent only once
        assertEquals(result, 'resolved');
        assertEquals(disconnectCount, 1);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        clearTimeout(timer);
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect force while a disconnect is in progress',
    async () => {
      const broker = new TestBroker();
      let timer: ReturnType<typeof setTimeout> | undefined;

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          disconnectTimeoutMS: 10000,
          keepAlive: 10,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        // the broker does not close the connection after DISCONNECT
        let disconnectCount = 0;
        const received = Promise.withResolvers<void>();
        broker.on('disconnect', () => {
          disconnectCount++;
          received.resolve();
        });

        const first = client.disconnect();
        await received.promise;

        const timeout = new Promise<string>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), 3000);
        });
        const result = await Promise.race([
          Promise.all([first, client.disconnect({ force: true })]).then(() => 'resolved'),
          timeout,
        ]);

        // force closes the connection without waiting for disconnectTimeoutMS
        assertEquals(result, 'resolved');
        assertEquals(disconnectCount, 1);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        clearTimeout(timer);
        await broker.destroy();
      }
    },
  );

  await context.step(
    'disconnect while connecting',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      let succeeded = false;
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

        const properties: MqttProperties.DisconnectProperties = {
          reasonString: 'trouble',
          sessionExpiryInterval: 300,
        };

        broker.on('disconnect', (event) => {
          const packet = event.detail;
          assertEquals(packet.properties?.reasonString, 'trouble');
          assertEquals(packet.properties?.sessionExpiryInterval, 300);
          succeeded = true;
          resolve();
        });
        broker.on('connect', (event) => {
          const packet = event.detail;
          client.disconnect({ properties });
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        client.on('closed', () => {
          if (!succeeded) {
            reject('Disconnect packet has not been verified');
          }
        });
        // DISCONNECT can have a Session Expiry Interval other than 0 only when CONNECT has one.
        client.connect({ properties: { sessionExpiryInterval: 600 } });

        await promise;
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // closing

Deno.test({ name: '@closing DISCONNECT that cannot be sent as is', only: false }, async (context) => {
  await context.step(
    'leaves out the Reason String and User Properties when they make DISCONNECT larger than the Maximum Packet Size',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.Success, { maximumPacketSize: 64 });
        });
        const received: (MqttProperties.DisconnectProperties | undefined)[] = [];
        broker.on('disconnect', (event) => {
          received.push(event.detail.properties);
          broker.closeConnectionFromBroker('cid');
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger });
        await client.connect({ properties: { sessionExpiryInterval: 600 } });

        // [MQTT-3.14.2-3], [MQTT-3.14.2-4]
        await client.disconnect({
          properties: {
            reasonString: 'a'.repeat(100),
            userProperties: [{ key: 'k', val: 'v' }],
            sessionExpiryInterval: 300,
          },
        });
        assertEquals(received, [{ sessionExpiryInterval: 300 }]);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'a DISCONNECT with an invalid property rejects, and the next disconnect() does not wait for it',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        const received: (MqttProperties.DisconnectProperties | undefined)[] = [];
        broker.on('disconnect', (event) => {
          received.push(event.detail.properties);
          broker.closeConnectionFromBroker('cid');
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger });
        await client.connect();

        // A Reason String longer than 65,535 bytes is invalid: its length is a Two Byte Integer.
        await assertRejects(
          () => client.disconnect({ properties: { reasonString: 'a'.repeat(0x10000) } }),
          ClientErrors.InvalidPropertyError,
        );
        assertEquals(received, []);

        // The connection stayed open: the next disconnect() sends DISCONNECT.
        await client.disconnect();
        assertEquals(received, [undefined]);
      } catch (err) {
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @closing DISCONNECT that cannot be sent as is

Deno.test({ name: '@closing DISCONNECT properties are checked before anything is sent', only: false }, async (context) => {
  /** Runs `test` with a connected client. The broker records the properties of the DISCONNECT it receives, and closes the connection. */
  async function withClient(
    connectOptions: Parameters<MqttClient['connect']>[0],
    protocolVersion: Mqtt.ProtocolVersion,
    test: (client: MqttClient, received: (MqttProperties.DisconnectProperties | undefined)[]) => Promise<void>,
  ) {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion });
    try {
      broker.listen();
      broker.on('connect', (event) => {
        const packet = event.detail;
        broker.sendConnack(packet.clientId, false, packet.protocolVersion);
      });
      const received: (MqttProperties.DisconnectProperties | undefined)[] = [];
      broker.on('disconnect', (event) => {
        received.push(event.detail.properties);
        broker.closeConnectionFromBroker('cid');
      });
      await client.connect(connectOptions);
      await test(client, received);
    } finally {
      await client.disconnect({ force: true });
      await broker.destroy();
    }
  }

  await context.step(
    'a Session Expiry Interval other than 0 rejects with InvalidPropertyError when CONNECT has none, and the connection stays open',
    async () => {
      await withClient(undefined, Mqtt.ProtocolVersion.MqttV5, async (client, received) => {
        // MQTT 5.0 3.14.2.2.2: the broker would not treat this DISCONNECT as valid, and would publish the will message.
        await assertRejects(() => client.disconnect({ properties: { sessionExpiryInterval: 300 } }), ClientErrors.InvalidPropertyError);
        assertEquals(received, []);

        // 0 can be sent, as in CONNECT.
        await client.disconnect({ properties: { sessionExpiryInterval: 0 } });
        assertEquals(received, [{ sessionExpiryInterval: 0 }]);
      });
    },
  );

  await context.step('a Session Expiry Interval other than 0 rejects also when that of CONNECT is 0', async () => {
    await withClient({ properties: { sessionExpiryInterval: 0 } }, Mqtt.ProtocolVersion.MqttV5, async (client, received) => {
      await assertRejects(() => client.disconnect({ properties: { sessionExpiryInterval: 300 } }), ClientErrors.InvalidPropertyError);
      assertEquals(received, []);
    });
  });

  await context.step('a Reason String with U+0000 rejects with InvalidPropertyError', async () => {
    await withClient(undefined, Mqtt.ProtocolVersion.MqttV5, async (client, received) => {
      await assertRejects(() => client.disconnect({ properties: { reasonString: 'a\u0000b' } }), ClientErrors.InvalidPropertyError);
      assertEquals(received, []);
    });
  });

  await context.step('MQTT 3.1.1: DISCONNECT has no properties, so they are not checked', async () => {
    await withClient(undefined, Mqtt.ProtocolVersion.MqttV3_1_1, async (client, received) => {
      await client.disconnect({ properties: { sessionExpiryInterval: 300 } });
      assertEquals(received, [undefined]);
    });
  });
}); // @closing DISCONNECT properties are checked before anything is sent

Deno.test({ name: '@closing DISCONNECT Reason Code', only: false }, async (context) => {
  /**
   * Runs `test` with a connected client. The broker records the DISCONNECT packets it receives, and closes the connection;
   * `closed` resolves when the connection is closed.
   */
  async function withClient(
    protocolVersion: Mqtt.ProtocolVersion,
    test: (client: MqttClient, received: MqttPackets.DisconnectPacket[], closed: Promise<void>) => Promise<void>,
  ) {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion });
    try {
      broker.listen();
      broker.on('connect', (event) => {
        const packet = event.detail;
        broker.sendConnack(packet.clientId, false, packet.protocolVersion);
      });
      const received: MqttPackets.DisconnectPacket[] = [];
      broker.on('disconnect', (event) => {
        received.push(event.detail);
        broker.closeConnectionFromBroker('cid');
      });
      const closed = Promise.withResolvers<void>();
      broker.on('closed', () => closed.resolve());
      await client.connect();
      await test(client, received, closed.promise);
    } finally {
      await client.disconnect({ force: true });
      await broker.destroy();
    }
  }

  await context.step('MQTT 5.0: sends the Reason Code, e.g. 0x04 Disconnect with Will Message', async () => {
    await withClient(Mqtt.ProtocolVersion.MqttV5, async (client, received) => {
      await client.disconnect({ reasonCode: Mqtt.ReasonCode.DisconnectWithWillMessage });
      assertEquals(received, [{ type: 'disconnect', reasonCode: Mqtt.ReasonCode.DisconnectWithWillMessage }]);
    });
  });

  await context.step('MQTT 5.0: sends the Reason Code with the properties', async () => {
    await withClient(Mqtt.ProtocolVersion.MqttV5, async (client, received) => {
      await client.disconnect({ reasonCode: Mqtt.ReasonCode.UnspecifiedError, properties: { reasonString: 'bye' } });
      assertEquals(received, [{ type: 'disconnect', reasonCode: Mqtt.ReasonCode.UnspecifiedError, properties: { reasonString: 'bye' } }]);
    });
  });

  await context.step(
    'MQTT 5.0: a Reason Code that DISCONNECT cannot carry rejects with MqttPacketSerializeError, and the connection stays open',
    async () => {
      await withClient(Mqtt.ProtocolVersion.MqttV5, async (client, received) => {
        // 0x01 (Granted QoS 1) is a Reason Code of SUBACK, not of DISCONNECT (MQTT 5.0 3.14.2.1).
        const error = await assertRejects(
          () => client.disconnect({ reasonCode: Mqtt.ReasonCode.GrantedQoS1 }),
          MqttPackets.MqttPacketsError.MqttPacketSerializeError,
        );
        assertInstanceOf(error.cause, MqttPackets.MqttPacketsError.InvalidFieldValueError);
        assertEquals(received, []);

        // The connection stayed open: the next disconnect() sends DISCONNECT.
        await client.disconnect();
        assertEquals(received, [{ type: 'disconnect', reasonCode: Mqtt.ReasonCode.NormalDisconnection }]);
      });
    },
  );

  await context.step('MQTT 3.1.1: the Reason Code and the properties are not sent', async () => {
    await withClient(Mqtt.ProtocolVersion.MqttV3_1_1, async (client, received) => {
      await client.disconnect({ reasonCode: Mqtt.ReasonCode.DisconnectWithWillMessage, properties: { reasonString: 'bye' } });
      // The broker decodes it as MQTT 3.1.1, which rejects any byte after the fixed header: the client sent E0 00.
      assertEquals(received, [{ type: 'disconnect' }]);
    });
  });

  await context.step('force: closes the connection without DISCONNECT, also with a Reason Code and properties', async () => {
    await withClient(Mqtt.ProtocolVersion.MqttV5, async (client, received, closed) => {
      await client.disconnect({ force: true, reasonCode: Mqtt.ReasonCode.DisconnectWithWillMessage, properties: { reasonString: 'bye' } });
      await closed;
      assertEquals(received, []);
    });
  });
}); // @closing DISCONNECT Reason Code

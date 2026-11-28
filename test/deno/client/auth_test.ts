import { ClientErrors, Mqtt, MqttClient, MqttPackets, type MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertInstanceOf, assertRejects, fail } from '@std/assert';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, label: string, ms = 3000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await delay(10);
  }
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

// AUTH can carry only 0x00 (Success), 0x18 (Continue authentication) and 0x19 (Re-authenticate) [MQTT-3.15.2-1], but the type
// of the argument, Mqtt.ReasonCode, also has the codes of the other packets.
Deno.test({ name: '@auth with a Reason Code that AUTH cannot carry', only: false }, async (context) => {
  await context.step('auth() rejects with InvalidArgumentError and sends nothing; the connection stays open', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      const received: string[] = [];
      broker.on('connect', (event) => {
        const packet = event.detail;
        broker.sendConnack(packet.clientId, false, packet.protocolVersion);
      });
      broker.on('auth', (event) => {
        received.push(`auth ${event.detail.reasonCode}`);
      });
      broker.on('publish', (event) => {
        received.push(`publish ${event.detail.topic}`);
      });
      broker.listen();
      await client.connect();

      await assertRejects(
        () => client.auth(Mqtt.ReasonCode.NotAuthorized, { authenticationMethod: 'M' }),
        ClientErrors.InvalidArgumentError,
        'reasonCode must be 0x00 (Success), 0x18 (Continue authentication) or 0x19 (Re-authenticate) (got 135)',
      );
      // The broker gets the next packets on the same connection, and nothing before them.
      await client.auth(Mqtt.ReasonCode.ReAuthenticate, { authenticationMethod: 'M' });
      await client.publish('topic/after', 'x');
      await waitFor(() => received.length > 1, 'the AUTH and the PUBLISH');
      assertEquals(received, [`auth ${Mqtt.ReasonCode.ReAuthenticate}`, 'publish topic/after']);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('auth() rejects with InvalidArgumentError also while not connected', async () => {
    const client = new MqttClient({ clientId: 'cid', logger });

    // ignored on purpose: the rejection must not terminate the process
    client.auth(Mqtt.ReasonCode.QuotaExceeded);

    await assertRejects(() => client.auth(Mqtt.ReasonCode.QuotaExceeded), ClientErrors.InvalidArgumentError, '(got 151)');
  });
}); // @auth with a Reason Code that AUTH cannot carry

Deno.test({ name: '@auth with an invalid property', only: false }, async (context) => {
  // The values that are not of the type are what JavaScript callers may pass.
  const cases: [unknown, string][] = [
    // It was sent as 3 bytes of 0.
    [{ authenticationMethod: 'M', authenticationData: 'str' }, 'properties.authenticationData must be a Uint8Array'],
    // The encoder failed with "TypeError: str.includes is not a function".
    [{ authenticationMethod: 'M', userProperties: [{ key: 1, val: 'v' }] }, 'properties.userProperties[0].key must be a string'],
    // The encoder failed with a message that did not name the property.
    [{ authenticationMethod: 'M', reasonString: 'a\u0000' }, 'properties.reasonString "a\\u0000" must not contain U+0000'],
  ];

  await context.step('auth() rejects with InvalidPropertyError and sends nothing; the connection stays open', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      const received: string[] = [];
      broker.on('connect', (event) => {
        const packet = event.detail;
        broker.sendConnack(packet.clientId, false, packet.protocolVersion);
      });
      broker.on('auth', (event) => {
        received.push(`auth ${event.detail.reasonCode}`);
      });
      broker.on('publish', (event) => {
        received.push(`publish ${event.detail.topic}`);
      });
      broker.listen();
      await client.connect();

      for (const [properties, message] of cases) {
        await assertRejects(
          () => client.auth(Mqtt.ReasonCode.ReAuthenticate, properties as MqttProperties.AuthProperties),
          ClientErrors.InvalidPropertyError,
          message,
        );
      }
      // The broker gets the next packets on the same connection, and nothing before them.
      await client.auth(Mqtt.ReasonCode.ReAuthenticate, { authenticationMethod: 'M', authenticationData: new Uint8Array([0x64]) });
      await client.publish('topic/after', 'x');
      await waitFor(() => received.length > 1, 'the AUTH and the PUBLISH');
      assertEquals(received, [`auth ${Mqtt.ReasonCode.ReAuthenticate}`, 'publish topic/after']);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('auth() rejects with InvalidPropertyError also while not connected, instead of SendPacketError', async () => {
    const client = new MqttClient({ clientId: 'cid', logger });

    // ignored on purpose: the rejection must not terminate the process
    client.auth(Mqtt.ReasonCode.ReAuthenticate, { reasonString: 'a\u0000' });

    for (const [properties, message] of cases) {
      await assertRejects(
        () => client.auth(Mqtt.ReasonCode.ReAuthenticate, properties as MqttProperties.AuthProperties),
        ClientErrors.InvalidPropertyError,
        message,
      );
    }
  });
}); // @auth with an invalid property

Deno.test({ name: '@auth without an Authentication Method', only: false }, async (context) => {
  await context.step('auth() rejects with MqttPacketSerializeError and sends nothing; the connection stays open', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      const received: string[] = [];
      broker.on('connect', (event) => {
        const packet = event.detail;
        broker.sendConnack(packet.clientId, false, packet.protocolVersion);
      });
      broker.on('auth', (event) => {
        received.push(`auth ${event.detail.reasonCode}`);
      });
      broker.on('publish', (event) => {
        received.push(`publish ${event.detail.topic}`);
      });
      broker.listen();
      await client.connect();

      // Every AUTH carries the Authentication Method (MQTT 5.0 3.15.2.2.2): the broker would take it as a Protocol Error.
      const calls: [Mqtt.ReasonCode, MqttProperties.AuthProperties | undefined][] = [
        [Mqtt.ReasonCode.ReAuthenticate, undefined],
        [Mqtt.ReasonCode.ContinueAuthentication, { authenticationData: new Uint8Array([0x64]) }],
        [Mqtt.ReasonCode.ReAuthenticate, {}],
      ];
      for (const [reasonCode, properties] of calls) {
        const error = await assertRejects(() => client.auth(reasonCode, properties), MqttPackets.MqttPacketsError.MqttPacketSerializeError);
        assertInstanceOf(error.cause, MqttPackets.MqttPacketsError.MissingPropertyError);
      }
      // The broker gets the next packets on the same connection, and nothing before them.
      await client.auth(Mqtt.ReasonCode.ReAuthenticate, { authenticationMethod: 'M' });
      await client.publish('topic/after', 'x');
      await waitFor(() => received.length > 1, 'the AUTH and the PUBLISH');
      assertEquals(received, [`auth ${Mqtt.ReasonCode.ReAuthenticate}`, 'publish topic/after']);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
}); // @auth without an Authentication Method

// MQTT 3.1.1 has no AUTH: its packet type 15 is Reserved (MQTT 3.1.1 2.2.1), and the receiver of it must close the
// connection [MQTT-4.8.0-1].
Deno.test({ name: '@auth with MQTT 3.1.1', only: false }, async (context) => {
  /** A broker that accepts the connection, and the packets it receives after CONNECT. */
  function listen(broker: TestBroker) {
    const received: string[] = [];
    broker.on('connect', (event) => {
      const packet = event.detail;
      broker.sendConnack(packet.clientId, false, packet.protocolVersion);
    });
    broker.on('auth', () => {
      received.push('auth');
    });
    broker.on('publish', (event) => {
      received.push(`publish ${event.detail.topic}`);
    });
    broker.listen();
    return received;
  }

  await context.step('auth() rejects with UnsupportedByProtocolVersionError and sends nothing; the connection stays open', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1 });
    try {
      const received = listen(broker);
      await client.connect();

      await assertRejects(
        () => client.auth(Mqtt.ReasonCode.ReAuthenticate, { authenticationMethod: 'M' }),
        ClientErrors.UnsupportedByProtocolVersionError,
        'auth() needs MQTT 5.0',
      );
      // The broker gets the next packet on the same connection, and nothing before it.
      await client.publish('topic/after', 'x');
      await waitFor(() => received.length > 0, 'the PUBLISH');
      assertEquals(received, ['publish topic/after']);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('auth() rejects with UnsupportedByProtocolVersionError also while not connected', async () => {
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1 });

    // ignored on purpose: the rejection must not terminate the process
    client.auth(Mqtt.ReasonCode.ContinueAuthentication);

    await assertRejects(() => client.auth(Mqtt.ReasonCode.ContinueAuthentication), ClientErrors.UnsupportedByProtocolVersionError);
  });

  await context.step('a packet of type 15 is not an AUTH: no auth event, and the client closes the connection without DISCONNECT', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1 });
    try {
      listen(broker);
      let authEvents = 0;
      let closed = false;
      const disconnects: unknown[] = [];
      client.on('auth', () => {
        authEvents++;
      });
      client.on('closed', () => {
        closed = true;
      });
      broker.on('disconnect', (event) => {
        disconnects.push(event.detail);
      });
      await client.connect();

      await broker.sendRawBytes('cid', new Uint8Array([0xF0, 0x00]));
      await waitFor(() => closed, 'the close');
      assertEquals(authEvents, 0);
      assertEquals(disconnects, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
}); // @auth with MQTT 3.1.1

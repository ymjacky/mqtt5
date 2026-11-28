import { ClientErrors, type ClientTypes, Mqtt, MqttClient, MqttPackets, type MqttProperties, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assert, assertEquals, assertExists, assertRejects, assertThrows } from '@std/assert';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}
Deno.test({ name: '@connect', only: false }, async (context) => {
  await context.step(
    'connect default value (v5.0)',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;

          assertEquals(packet.clientId, 'cid');
          assertEquals(packet.clean, true);
          assertEquals(packet.username, undefined);
          assertEquals(packet.password, undefined);
          assertEquals(packet.protocolVersion, Mqtt.ProtocolVersion.MqttV5);
          assertEquals(packet.keepAlive, 10);
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

  await context.step(
    'connect v3.1.1',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          url: new URL('mqtt://127.0.0.1:1883'),
          username: 'myname',
          password: 'mypass',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          protocolVersion: 4,
          keepAlive: 20,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;

          assertEquals(packet.clientId, 'cid');
          assertEquals(packet.clean, false);
          assertEquals(packet.username, 'myname');
          assertEquals(packet.password, new TextEncoder().encode('mypass'));
          assertEquals(packet.protocolVersion, Mqtt.ProtocolVersion.MqttV3_1_1);
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
    'connect v3.1.1 refused',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          protocolVersion: 4,
        });

        broker.on('connect', async (event) => {
          const packet = event.detail;
          assertEquals(packet.protocolVersion, Mqtt.ProtocolVersion.MqttV3_1_1);

          await broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.V3_1_1_ConnectReturnCode.NotAuthorized);
          broker.closeConnectionFromBroker(client.clientId);
        });

        const connack = await client.connect();

        assertEquals(
          connack, // actual
          {
            type: 'connack',
            sessionPresent: false,
            returnCode: Mqtt.V3_1_1_ConnectReturnCode.NotAuthorized,
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
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          url: new URL('mqtt://127.0.0.1:1883'),
          username: 'myname',
          password: 'mypass',
          logger: logger,
          clean: false,
          connectTimeoutMS: 10000,
          protocolVersion: 5,
          keepAlive: 20,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;

          assertEquals(packet.clientId, 'cid');
          assertEquals(packet.clean, false);
          assertEquals(packet.username, 'myname');
          assertEquals(packet.password, new TextEncoder().encode('mypass'));
          assertEquals(packet.protocolVersion, Mqtt.ProtocolVersion.MqttV5);
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
  await context.step(
    'connect v5.0 with properties',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertEquals(packet.clientId, 'cid');
          assertEquals(packet.clean, true);
          assertEquals(packet.username, undefined);
          assertEquals(packet.password, undefined);
          assertEquals(packet.protocolVersion, Mqtt.ProtocolVersion.MqttV5);
          assertEquals(packet.keepAlive, 10);

          assertEquals(packet.properties?.sessionExpiryInterval, 300);
          assertEquals(packet.properties?.receiveMaximum, 10);
          assertEquals(packet.properties?.maximumPacketSize, 128);
          assertEquals(packet.properties?.topicAliasMaximum, 20);

          assertEquals(packet.properties?.requestResponseInformation, true);
          assertEquals(packet.properties?.requestProblemInformation, true);
          assertEquals(
            packet.properties?.userProperties,
            [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
          );
          assertEquals(packet.properties?.authenticationMethod, 'digest');
          assertEquals(packet.properties?.authenticationData, new TextEncoder().encode('ABCDEFG'));

          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        const properties: MqttProperties.ConnectProperties = {
          sessionExpiryInterval: 300,
          receiveMaximum: 10,
          maximumPacketSize: 128,
          topicAliasMaximum: 20,
          requestResponseInformation: true,
          requestProblemInformation: true,
          userProperties: [
            { key: 'userProp1', val: 'userData1' },
            { key: 'userProp2', val: 'userData2' },
            { key: 'userProp2', val: 'userData3' },
          ],
          authenticationMethod: 'digest',
          authenticationData: new TextEncoder().encode('ABCDEFG'),
        };
        const connack = await client.connect({ properties });

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

  await context.step(
    'connect v5.0 with connack properties',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          protocolVersion: 5,
          keepAlive: 10,
        });

        broker.on('connect', async (event) => {
          const packet = event.detail;
          assertEquals(packet.clientId, 'cid');
          assertEquals(packet.clean, true);
          assertEquals(packet.username, undefined);
          assertEquals(packet.password, undefined);
          assertEquals(packet.protocolVersion, Mqtt.ProtocolVersion.MqttV5);
          assertEquals(packet.keepAlive, 10);

          const connackProperties: MqttProperties.ConnackProperties = {
            sessionExpiryInterval: 300,
            receiveMaximum: 10,
            maximumQoS: 1,
            retainAvailable: true,
            maximumPacketSize: 128,
            assignedClientIdentifier: 'cid2',
            topicAliasMaximum: 11,
            reasonString: 'NotAuthorized',
            userProperties: [
              { key: 'userProp1', val: 'userData1' },
              { key: 'userProp2', val: 'userData2' },
              { key: 'userProp2', val: 'userData3' },
            ],
            wildcardSubscriptionAvailable: true,
            subscriptionIdentifiersAvailable: true,
            sharedSubscriptionAvailable: true,
            serverKeepAlive: 40,
            responseInformation: 'response_topic',
            serverReference: 'mqtt://127.0.0.1:11883',
            authenticationMethod: 'digest',
            authenticationData: new TextEncoder().encode('ABCDEFG'),
          };

          await broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.NotAuthorized, connackProperties);
          broker.closeConnectionFromBroker(client.clientId);
        });

        const connack = await client.connect();

        assertEquals(connack.sessionPresent, false);
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.NotAuthorized);
        assertExists(connack.properties);
        assertEquals(connack.properties?.sessionExpiryInterval, 300);
        assertEquals(connack.properties?.receiveMaximum, 10);
        assertEquals(connack.properties?.maximumQoS, 1);
        assertEquals(connack.properties?.retainAvailable, true);
        assertEquals(connack.properties?.maximumPacketSize, 128);
        assertEquals(connack.properties?.assignedClientIdentifier, `cid2`);
        assertEquals(connack.properties?.topicAliasMaximum, 11);
        assertEquals(connack.properties?.reasonString, 'NotAuthorized');
        assertEquals(
          connack.properties?.userProperties,
          [
            { key: 'userProp1', val: 'userData1' },
            { key: 'userProp2', val: 'userData2' },
            { key: 'userProp2', val: 'userData3' },
          ],
        );
        assertEquals(connack.properties?.wildcardSubscriptionAvailable, true);
        assertEquals(connack.properties?.subscriptionIdentifiersAvailable, true);
        assertEquals(connack.properties?.sharedSubscriptionAvailable, true);
        assertEquals(connack.properties?.serverKeepAlive, 40);
        assertEquals(connack.properties?.responseInformation, 'response_topic');
        assertEquals(connack.properties?.serverReference, 'mqtt://127.0.0.1:11883');
        assertEquals(connack.properties?.authenticationMethod, 'digest');
        assertEquals(connack.properties?.authenticationData, new TextEncoder().encode('ABCDEFG'));
      } finally {
        await broker.destroy();
      }
    },
  );
}); // connect

Deno.test({ name: '@connect ignored rejection', only: false }, async (context) => {
  await context.step(
    'an ignored StateIsNotOfflineError does not become an unhandled rejection',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger });
        await client.connect();

        client.connect();
        await assertRejects(() => client.connect(), ClientErrors.StateIsNotOfflineError);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'an ignored ConnectTimeout does not become an unhandled rejection',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        // do not reply CONNACK

        const client = new MqttClient({ clientId: 'cid', logger: logger, connectTimeoutMS: 200 });
        const { promise: closed, resolve } = Promise.withResolvers<void>();
        client.on('closed', () => resolve());

        client.connect();
        await closed;
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @connect ignored rejection

Deno.test({ name: '@connect encoding failure', only: false }, async (context) => {
  await context.step(
    'opens no connection when CONNECT cannot be encoded',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        let accepted = 0;
        broker.on('accept', () => {
          accepted++;
        });
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        // The values that the constructor and connect() check cannot make CONNECT fail to encode. A property that is not one
        // of CONNECT is not checked there, but the encoder does not send a UTF-8 Encoded String with U+0000 [MQTT-1.5.4-2].
        const properties: MqttProperties.Properties = { assignedClientIdentifier: 'a\u0000' };
        const client = new MqttClient({ clientId: 'cid', logger: logger });
        await assertRejects(
          () => client.connect({ properties }),
          MqttPackets.MqttPacketsError.MqttPacketSerializeError,
        );
        assertEquals(accepted, 0);

        // The client stayed offline: connect() rejects again for the same reason, not with StateIsNotOfflineError.
        await assertRejects(
          () => client.connect({ properties }),
          MqttPackets.MqttPacketsError.MqttPacketSerializeError,
        );
        assertEquals(accepted, 0);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @connect encoding failure

Deno.test({ name: '@connect options that are Two Byte Integers', only: false }, async (context) => {
  await context.step(
    'the constructor throws for a value that is not an integer from 0 to 65535',
    () => {
      for (const value of [65_536, 70_000, -1, 1.5, NaN]) {
        assertThrows(() => new MqttClient({ clientId: 'cid', keepAlive: value }), ClientErrors.InvalidArgumentError, 'keepAlive', `${value}`);
        assertThrows(
          () => new MqttClient({ clientId: 'cid', protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1, keepAlive: value }),
          ClientErrors.InvalidArgumentError,
          'keepAlive',
          `${value}`,
        );
        assertThrows(
          () => new MqttClient({ clientId: 'cid', topicAliasMaximumAboutSend: value }),
          ClientErrors.InvalidArgumentError,
          'topicAliasMaximumAboutSend',
          `${value}`,
        );
        assertThrows(
          () => new MqttClient({ clientId: 'cid', topicAliasMaximumAboutReceive: value }),
          ClientErrors.InvalidArgumentError,
          'topicAliasMaximumAboutReceive',
          `${value}`,
        );
      }
      // MQTT 3.1.1 has no topic aliases: the options are not used, so they are not checked.
      new MqttClient({
        clientId: 'cid',
        protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1,
        topicAliasMaximumAboutSend: -1,
        topicAliasMaximumAboutReceive: 70_000,
      });
    },
  );

  await context.step(
    'the largest values are sent as they are',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();
        const { promise: connectReceived, resolve } = Promise.withResolvers<MqttPackets.ConnectPacket>();
        broker.on('connect', (event) => {
          const packet = event.detail;
          resolve(packet);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger, keepAlive: 65_535, topicAliasMaximumAboutReceive: 65_535 });
        await client.connect();
        const connect = await connectReceived;
        assertEquals(connect.keepAlive, 65_535);
        assertEquals(connect.properties?.topicAliasMaximum, 65_535);
        await client.disconnect();
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @connect options that are Two Byte Integers

Deno.test({ name: '@connect protocolVersion option', only: false }, () => {
  // CONNECT would carry another value as its Protocol Level, which the broker refuses. The string is what JavaScript callers
  // may pass.
  for (const value of [3, 6, 0, 4.5, NaN, '5'] as unknown as Mqtt.ProtocolVersion[]) {
    const message = `protocolVersion must be 4 (MQTT 3.1.1) or 5 (MQTT 5.0) (got ${value})`;
    assertThrows(() => new MqttClient({ clientId: 'cid', protocolVersion: value }), ClientErrors.InvalidArgumentError, message, `${value}`);
    assertThrows(
      () => new WebSocketMqttClient({ clientId: 'cid', protocolVersion: value, url: new URL('ws://127.0.0.1:8080') }),
      ClientErrors.InvalidArgumentError,
      message,
      `${value}`,
    );
  }
  // Left out (or undefined), it is MQTT 5.0.
  for (const protocolVersion of [Mqtt.ProtocolVersion.MqttV5, Mqtt.ProtocolVersion.MqttV3_1_1, undefined]) {
    new MqttClient({ clientId: 'cid', protocolVersion });
    new WebSocketMqttClient({ clientId: 'cid', protocolVersion, url: new URL('ws://127.0.0.1:8080') });
  }
  new MqttClient();
}); // @connect protocolVersion option

Deno.test({ name: '@connect properties of 0', only: false }, async (context) => {
  await context.step(
    'sends a Topic Alias Maximum and a Will Delay Interval of 0 as they are given, instead of leaving them out',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        const { promise: connectReceived, resolve } = Promise.withResolvers<MqttPackets.ConnectPacket>();
        broker.on('connect', (event) => {
          const packet = event.detail;
          resolve(packet);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger });
        await client.connect({
          properties: { topicAliasMaximum: 0 },
          will: { topic: 'willTopic', payload: new Uint8Array([0x77]), properties: { willDelayInterval: 0 } },
        });

        // Both mean the same as leaving the property out: no topic aliases, and the Will is published at once.
        const connect = await connectReceived;
        assertEquals(connect.properties, { topicAliasMaximum: 0 });
        assertEquals(connect.will?.properties, { willDelayInterval: 0 });
        await client.disconnect();
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @connect properties of 0

Deno.test({ name: '@connect clientId, username and password', only: false }, async (context) => {
  await context.step(
    'the constructors throw for a clientId, a username or a password that CONNECT cannot carry',
    () => {
      const cases: [ClientTypes.ClientOptions, string][] = [
        // UTF-8 Encoded Strings [MQTT-1.5.4-1] [MQTT-1.5.4-2]
        [{ clientId: 'a\u0000' }, 'clientId must not contain U+0000'],
        [{ clientId: 'x\uD800' }, 'clientId must not contain a lone surrogate, which UTF-8 cannot encode (found at index 1)'],
        [{ clientId: 'a'.repeat(65_536) }, 'clientId must be at most 65535 bytes long in UTF-8'],
        [{ username: 'u\u0000' }, 'username must not contain U+0000'],
        [{ username: '\uDC00' }, 'username must not contain a lone surrogate, which UTF-8 cannot encode (found at index 0)'],
        [{ username: 'あ'.repeat(21_846) }, 'username must be at most 65535 bytes long in UTF-8'],
        // Binary Data
        [{ password: 'p\uD800' }, 'password must not contain a lone surrogate, which UTF-8 cannot encode (found at index 1)'],
        [{ password: 'a'.repeat(65_536) }, 'password must be at most 65535 bytes long in UTF-8'],
        [{ password: new Uint8Array(65_536) }, 'password must be at most 65535 bytes long'],
      ];
      for (const [options, message] of cases) {
        for (const protocolVersion of [Mqtt.ProtocolVersion.MqttV5, Mqtt.ProtocolVersion.MqttV3_1_1]) {
          assertThrows(() => new MqttClient({ ...options, protocolVersion }), ClientErrors.InvalidArgumentError, message, message);
          assertThrows(
            () => new WebSocketMqttClient({ ...options, protocolVersion, url: new URL('ws://127.0.0.1:8080') }),
            ClientErrors.InvalidArgumentError,
            message,
            message,
          );
        }
      }
    },
  );

  await context.step(
    'a string password is sent as its UTF-8 bytes, U+0000 included, and a valid clientId and username as they are',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();
        const received: MqttPackets.ConnectPacket[] = [];
        broker.on('connect', (event) => {
          const packet = event.detail;
          received.push(packet);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        for (const protocolVersion of [Mqtt.ProtocolVersion.MqttV5, Mqtt.ProtocolVersion.MqttV3_1_1]) {
          const client = new MqttClient({ clientId: '\u{FEFF}cid', username: 'u\u{1F600}', password: 'p\u0000w\u{1F600}', protocolVersion, logger });
          await client.connect();
          await client.disconnect();
        }
        assertEquals(received.length, 2);
        for (const packet of received) {
          assertEquals(packet.clientId, '\u{FEFF}cid');
          assertEquals(packet.username, 'u\u{1F600}');
          assertEquals(packet.password, new TextEncoder().encode('p\u0000w\u{1F600}'));
        }
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'a Uint8Array password is sent as it is on every connection, also after the caller changed it',
    async () => {
      const broker = new TestBroker();

      try {
        broker.listen();
        const passwords: (string | Uint8Array | undefined)[] = [];
        broker.on('connect', (event) => {
          const packet = event.detail;
          passwords.push(packet.password);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        // Not UTF-8, and with 0x00: Binary Data may be any bytes.
        const password = new Uint8Array([0xFF, 0x00, 0x70]);
        const client = new MqttClient({ clientId: 'cid', username: 'u', password, logger });
        // The client keeps a copy: changing the caller's array does not change what is sent.
        password.fill(0x41);
        await client.connect();
        await client.disconnect();
        password.fill(0x42);
        await client.connect();
        await client.disconnect();
        assertEquals(passwords, [new Uint8Array([0xFF, 0x00, 0x70]), new Uint8Array([0xFF, 0x00, 0x70])]);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @connect clientId, username and password

Deno.test({ name: '@connect failure leaves the client offline', only: false }, async (context) => {
  await context.step(
    'rejects with ConnectionClosed when the broker closes the connection before CONNACK',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        let connects = 0;
        broker.on('connect', (event) => {
          const packet = event.detail;
          if (++connects === 1) {
            broker.closeConnectionFromBroker(packet.clientId);
          } else {
            broker.sendConnack(packet.clientId, false, packet.protocolVersion);
          }
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger, connectTimeoutMS: 10000 });
        await assertRejects(() => client.connect(), ClientErrors.ConnectionClosed);

        // The client is offline: it can connect again right away.
        const connack = await client.connect();
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'after ConnectTimeout, the client is offline and can connect again right away',
    async () => {
      const broker = new TestBroker();
      try {
        broker.listen();
        let connects = 0;
        broker.on('connect', (event) => {
          const packet = event.detail;
          if (++connects > 1) { // no CONNACK for the first CONNECT
            broker.sendConnack(packet.clientId, false, packet.protocolVersion);
          }
        });

        const client = new MqttClient({ clientId: 'cid', logger: logger, connectTimeoutMS: 200 });
        let closed = 0;
        client.on('closed', () => {
          closed++;
        });

        await assertRejects(() => client.connect(), ClientErrors.ConnectTimeout);
        assertEquals(closed, 1); // the connection was closed before connect() rejected

        const connack = await client.connect();
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'ConnectTimeout while the connection is being opened rejects in time, and the connection opened later is closed',
    async () => {
      const broker = new TestBroker();
      const connect = Deno.connect;
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        // The TCP connection does not open within connectTimeoutMS, e.g. the broker's address does not answer.
        const { promise: opening, resolve: open } = Promise.withResolvers<Deno.TcpConn>();
        Deno.connect = (() => opening) as unknown as typeof Deno.connect;

        const client = new MqttClient({ clientId: 'cid', logger: logger, connectTimeoutMS: 200 });
        const start = Date.now();
        await assertRejects(() => client.connect(), ClientErrors.ConnectTimeout);
        const elapsed = Date.now() - start;
        assert(elapsed < 1000, `rejected after ${elapsed} ms`);

        // The client is offline: it can connect again right away.
        Deno.connect = connect;
        const connack = await client.connect();
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);

        // The first connection opens late: it is closed, and the connected client is not affected.
        let lateConnectionClosed = false;
        open({ close: () => lateConnectionClosed = true } as unknown as Deno.TcpConn);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert(lateConnectionClosed);
        assertEquals(await client.publish('topicA', 'x'), { result: 0, reason: '' });
      } finally {
        Deno.connect = connect;
        await broker.destroy();
      }
    },
  );
}); // @connect failure leaves the client offline

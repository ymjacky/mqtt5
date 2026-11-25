import { ClientErrors, Mqtt, MqttClient, MqttPackets, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assert, assertEquals } from '@std/assert';

// How the client ends the connection when it receives, while it waits for CONNACK, a packet that it cannot accept.

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

// Rejects if the promise does not settle within `ms`, instead of letting the test hang.
async function settleWithin<T>(promise: Promise<T>, label: string, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Longer than the time the tests wait for connect(): a rejection with ConnectTimeout would come too late.
const connectTimeoutMS = 5000;

/** The error with which connect() rejects. Fails if connect() resolves, or does not settle soon. */
async function connectError(connecting: Promise<unknown>): Promise<unknown> {
  const settled = await settleWithin(
    connecting.then((connack) => ({ connack }), (error: unknown) => ({ error })),
    'connect()',
    1000,
  );
  assert('error' in settled, `connect() must reject, but resolved with ${JSON.stringify(settled)}`);
  return settled.error;
}

function assertInvalidPacketBeforeConnack(error: unknown, reasonCode: Mqtt.ReasonCode): void {
  assertEquals((error as Error).name, 'InvalidPacketBeforeConnackError', String(error));
  assert(error instanceof ClientErrors.InvalidPacketBeforeConnackError);
  assertEquals(error.reasonCode, reasonCode);
}

/** What the broker gets from the client, and how often the client emits `closed`. */
function record(client: MqttClient | WebSocketMqttClient, broker: TestBroker | TestWsBroker) {
  const recorded = {
    disconnects: [] as (number | undefined)[],
    brokerSawClose: false,
    closedEvents: 0,
  };
  client.on('closed', () => {
    recorded.closedEvents++;
  });
  broker.on('disconnect', (event) => {
    recorded.disconnects.push(event.detail.reasonCode);
  });
  broker.on('closed', () => {
    recorded.brokerSawClose = true;
  });
  return recorded;
}

/** Makes the broker answer the first CONNECT with `bytes`, and the next ones with a CONNACK that accepts the connection. */
function answerFirstConnect(broker: TestBroker | TestWsBroker, bytes: Uint8Array): void {
  let connects = 0;
  broker.on('connect', (event) => {
    const packet = event.detail;
    if (connects++ === 0) {
      // The client may have closed the connection already when the broker writes.
      Promise.resolve(broker.sendRawBytes(packet.clientId, bytes)).catch(() => {});
    } else {
      broker.sendConnack(packet.clientId, false, packet.protocolVersion);
    }
  });
}

/** A CONNACK (MQTT 5.0) that accepts the connection, but has a property 0x7F, which MQTT 5.0 does not define. */
const connackWithUnknownProperty = [0x20, 0x04, 0x00, 0x00, 0x01, 0x7F];

/** A CONNACK (MQTT 5.0) that accepts the connection. */
const validConnack = [
  ...MqttPackets.packetToBytes({ type: 'connack', sessionPresent: false, reasonCode: Mqtt.ReasonCode.Success }, Mqtt.ProtocolVersion.MQTT_V5),
];

/** Packets that the client cannot accept while it waits for CONNACK (MQTT 5.0), and the reason it ends the connection with. */
const invalidPackets: [string, number[], Mqtt.ReasonCode][] = [
  ['a CONNACK with a property that MQTT 5.0 does not define', connackWithUnknownProperty, Mqtt.ReasonCode.MalformedPacket],
  // Property Length 4: Reason String (0x1F) of length 1, the byte 0xFF, which is never in UTF-8 [MQTT-1.5.4-1].
  ['a CONNACK whose Reason String is not valid UTF-8', [0x20, 0x07, 0x00, 0x00, 0x04, 0x1F, 0x00, 0x01, 0xFF], Mqtt.ReasonCode.MalformedPacket],
  // Property Length 6: Receive Maximum (0x21) 10, twice (MQTT 5.0 3.2.2.3.3).
  [
    'a CONNACK with the Receive Maximum twice, a Protocol Error',
    [0x20, 0x09, 0x00, 0x00, 0x06, 0x21, 0x00, 0x0A, 0x21, 0x00, 0x0A],
    Mqtt.ReasonCode.ProtocolError,
  ],
  // An AUTH has either no Reason Code, or a Reason Code and the Property Length (MQTT 5.0 3.15.2.1).
  ['an AUTH that has a Reason Code but no Property Length', [0xF0, 0x01, 0x18], Mqtt.ReasonCode.MalformedPacket],
  // Packet ID 1, no properties, the Topic Filter 'a' with QoS 0.
  ['a SUBSCRIBE, which only a client sends', [0x82, 0x07, 0x00, 0x01, 0x00, 0x00, 0x01, 0x61, 0x00], Mqtt.ReasonCode.ProtocolError],
  // A Remaining Length is at most 4 bytes (MQTT 5.0 1.5.5): the client cannot tell where the next packet starts.
  ['a packet whose Remaining Length is longer than 4 bytes', [0x20, 0xFF, 0xFF, 0xFF, 0xFF, 0x01], Mqtt.ReasonCode.MalformedPacket],
];

Deno.test({ name: '@receive before CONNACK: a packet that the client cannot accept', only: false }, async (context) => {
  for (const [name, bytes, reasonCode] of invalidPackets) {
    await context.step(
      `MQTT 5.0: on ${name}, the client closes the connection without DISCONNECT, and connect() rejects at once`,
      async () => {
        const broker = new TestBroker();
        const client = new MqttClient({ clientId: 'cid', logger, connectTimeoutMS });
        try {
          broker.listen();
          const recorded = record(client, broker);
          answerFirstConnect(broker, new Uint8Array(bytes));

          assertInvalidPacketBeforeConnack(await connectError(client.connect()), reasonCode);
          await waitFor(() => recorded.brokerSawClose, 'the close');
          assertEquals(recorded.disconnects, []);
          assertEquals(recorded.closedEvents, 1);
        } finally {
          await client.disconnect(true);
          await broker.destroy();
        }
      },
    );
  }

  await context.step('MQTT 5.0: a packet larger than the Maximum Packet Size of CONNECT ends the connection with Packet too large', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, connectTimeoutMS });
    try {
      broker.listen();
      const recorded = record(client, broker);
      const publish = MqttPackets.packetToBytes(
        { type: 'publish', topic: 'a', payload: new Uint8Array(40), dup: false, retain: false, qos: Mqtt.QoS.AT_MOST_ONCE },
        Mqtt.ProtocolVersion.MQTT_V5,
      );
      answerFirstConnect(broker, publish);

      const connecting = client.connect({ properties: { maximumPacketSize: 20 } });
      assertInvalidPacketBeforeConnack(await connectError(connecting), Mqtt.ReasonCode.PacketTooLarge);
      await waitFor(() => recorded.brokerSawClose, 'the close');
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.closedEvents, 1);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('MQTT 5.0: a valid CONNACK right after the packet does not make connect() resolve', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, connectTimeoutMS });
    try {
      broker.listen();
      const recorded = record(client, broker);
      // Both in one write: the client reads the valid CONNACK before the connection is closed.
      answerFirstConnect(broker, new Uint8Array([...connackWithUnknownProperty, ...validConnack]));

      assertInvalidPacketBeforeConnack(await connectError(client.connect()), Mqtt.ReasonCode.MalformedPacket);
      await waitFor(() => recorded.brokerSawClose, 'the close');
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.closedEvents, 1);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('MQTT 5.0: the client is offline afterwards, and connect() can be called again', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, connectTimeoutMS });
    try {
      broker.listen();
      answerFirstConnect(broker, new Uint8Array(connackWithUnknownProperty));

      assertInvalidPacketBeforeConnack(await connectError(client.connect()), Mqtt.ReasonCode.MalformedPacket);
      const connack = await settleWithin(client.connect(), 'the second connect()', 1000);
      assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('MQTT 3.1.1: connect() rejects with the same error, with the reason the connection was closed for', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, connectTimeoutMS, protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1 });
    try {
      broker.listen();
      const recorded = record(client, broker);
      // A CONNACK of MQTT 3.1.1 is 2 bytes after the fixed header (3.1.1 3.2): this one has one more.
      answerFirstConnect(broker, new Uint8Array([0x20, 0x03, 0x00, 0x00, 0x00]));

      assertInvalidPacketBeforeConnack(await connectError(client.connect()), Mqtt.ReasonCode.MalformedPacket);
      await waitFor(() => recorded.brokerSawClose, 'the close');
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.closedEvents, 1);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('WebSocket: the client closes the connection without DISCONNECT, and connect() rejects at once', async () => {
    const broker = new TestWsBroker();
    const client = new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger, connectTimeoutMS });
    try {
      broker.listen();
      const recorded = record(client, broker);
      answerFirstConnect(broker, new Uint8Array(connackWithUnknownProperty));

      assertInvalidPacketBeforeConnack(await connectError(client.connect()), Mqtt.ReasonCode.MalformedPacket);
      await waitFor(() => recorded.brokerSawClose, 'the close');
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.closedEvents, 1);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

/** Encodes a packet, for MQTT 5.0 unless `protocolVersion` is given. */
function bytesOf(packet: MqttPackets.AnyPacket, protocolVersion: Mqtt.ProtocolVersion = Mqtt.ProtocolVersion.MQTT_V5): number[] {
  return [...MqttPackets.packetToBytes(packet, protocolVersion)];
}

const payload = new Uint8Array([1]);
const publishQoS1: MqttPackets.PublishPacket = { type: 'publish', topic: 'a', payload, dup: false, retain: false, qos: Mqtt.QoS.AT_LEAST_ONCE, packetId: 7 };

/** Packets that the broker must not send before CONNACK: with MQTT 5.0, it sends AUTH only [MQTT-3.2.0-1]. */
const packetsBeforeConnack: [string, MqttPackets.AnyPacket][] = [
  ['a PUBLISH with QoS 0', { type: 'publish', topic: 'a', payload, dup: false, retain: false, qos: Mqtt.QoS.AT_MOST_ONCE }],
  ['a PUBLISH with QoS 1', publishQoS1],
  ['a PUBLISH with QoS 2', { type: 'publish', topic: 'a', payload, dup: false, retain: false, qos: Mqtt.QoS.EXACTLY_ONCE, packetId: 7 }],
  ['a PUBACK', { type: 'puback', packetId: 1 }],
  ['a PUBREC', { type: 'pubrec', packetId: 1 }],
  ['a PUBREL', { type: 'pubrel', packetId: 1 }],
  ['a PUBCOMP', { type: 'pubcomp', packetId: 1 }],
  ['a SUBACK', { type: 'suback', packetId: 1, reasonCodes: [Mqtt.ReasonCode.GrantedQoS0] }],
  ['an UNSUBACK', { type: 'unsuback', packetId: 1, reasonCodes: [Mqtt.ReasonCode.Success] }],
  ['a PINGRESP', { type: 'pingresp' }],
];

/** A CONNACK (MQTT 3.1.1) that accepts the connection. */
const validConnackV3_1_1 = [0x20, 0x02, 0x00, 0x00];

/** What the client does with a packet: the events it emits, and the acknowledgments that the broker gets. */
function recordHandling(client: MqttClient | WebSocketMqttClient, broker: TestBroker | TestWsBroker) {
  const recorded = {
    publishEvents: 0,
    authEvents: 0,
    acknowledgments: [] as string[],
  };
  client.on('publish', () => {
    recorded.publishEvents++;
  });
  client.on('auth', () => {
    recorded.authEvents++;
  });
  for (const type of ['puback', 'pubrec', 'pubrel', 'pubcomp'] as const) {
    broker.on(type, () => {
      recorded.acknowledgments.push(type);
    });
  }
  return recorded;
}

Deno.test({ name: '@receive before CONNACK: a packet that the broker must not send before CONNACK', only: false }, async (context) => {
  for (const [name, packet] of packetsBeforeConnack) {
    await context.step(
      `MQTT 5.0: on ${name}, the client does not handle it, closes the connection without DISCONNECT, and connect() rejects`,
      async () => {
        const broker = new TestBroker();
        const client = new MqttClient({ clientId: 'cid', logger, connectTimeoutMS });
        try {
          broker.listen();
          const recorded = record(client, broker);
          const handling = recordHandling(client, broker);
          // Both in one write: the client reads the valid CONNACK before the connection is closed.
          answerFirstConnect(broker, new Uint8Array([...bytesOf(packet), ...validConnack]));

          assertInvalidPacketBeforeConnack(await connectError(client.connect()), Mqtt.ReasonCode.ProtocolError);
          await waitFor(() => recorded.brokerSawClose, 'the close');
          assertEquals(recorded.disconnects, []);
          assertEquals(recorded.closedEvents, 1);
          assertEquals(handling.publishEvents, 0);
          assertEquals(handling.acknowledgments, []);
        } finally {
          await client.disconnect(true);
          await broker.destroy();
        }
      },
    );
  }

  await context.step('MQTT 5.0: a PUBLISH right after CONNACK in the same write is handled as usual', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, connectTimeoutMS });
    try {
      broker.listen();
      const recorded = record(client, broker);
      const handling = recordHandling(client, broker);
      // Both in one write: the client reads them at once.
      answerFirstConnect(broker, new Uint8Array([...validConnack, ...bytesOf(publishQoS1)]));

      const connack = await settleWithin(client.connect(), 'connect()', 1000);
      assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
      await waitFor(() => handling.acknowledgments.length > 0, 'the PUBACK');
      assertEquals(handling.publishEvents, 1);
      assertEquals(handling.acknowledgments, ['puback']);
      // The connection stays open.
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.closedEvents, 0);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('WebSocket: a PUBLISH right after CONNACK in the same message is handled as usual', async () => {
    const broker = new TestWsBroker();
    const client = new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger, connectTimeoutMS });
    try {
      broker.listen();
      const recorded = record(client, broker);
      const handling = recordHandling(client, broker);
      // One message: the client receives both packets at once, without waiting between them, so it receives the PUBLISH
      // before it has handled the CONNACK.
      answerFirstConnect(broker, new Uint8Array([...validConnack, ...bytesOf(publishQoS1)]));

      const connack = await settleWithin(client.connect(), 'connect()', 1000);
      assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
      await waitFor(() => handling.acknowledgments.length > 0, 'the PUBACK');
      assertEquals(handling.publishEvents, 1);
      assertEquals(handling.acknowledgments, ['puback']);
      // The connection stays open.
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.closedEvents, 0);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step(
    'MQTT 5.0: on a DISCONNECT, the client emits `disconnect` and closes the connection, and connect() rejects with ConnectionClosed',
    async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger, connectTimeoutMS });
      try {
        broker.listen();
        const recorded = record(client, broker);
        const disconnectEvents: (number | undefined)[] = [];
        client.on('disconnect', (event) => {
          disconnectEvents.push(event.detail.reasonCode);
        });
        answerFirstConnect(broker, new Uint8Array(bytesOf({ type: 'disconnect', reasonCode: Mqtt.ReasonCode.ServerBusy })));

        const error = await connectError(client.connect());
        assert(error instanceof ClientErrors.ConnectionClosed, String(error));
        assertEquals(disconnectEvents, [Mqtt.ReasonCode.ServerBusy]);
        await waitFor(() => recorded.brokerSawClose, 'the close');
        assertEquals(recorded.disconnects, []);
        assertEquals(recorded.closedEvents, 1);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    },
  );

  // MQTT 3.1.1 has no AUTH: CONNACK is the first packet that the broker sends [MQTT-3.2.0-1].
  const packetsBeforeConnackV3_1_1: [string, number[]][] = [
    ['a PUBLISH with QoS 1', bytesOf(publishQoS1, Mqtt.ProtocolVersion.MQTT_V3_1_1)],
    ['an AUTH', [0xF0, 0x00]],
  ];
  for (const [name, bytes] of packetsBeforeConnackV3_1_1) {
    await context.step(`MQTT 3.1.1: on ${name}, the client does not handle it, closes the connection, and connect() rejects`, async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger, connectTimeoutMS, protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1 });
      try {
        broker.listen();
        const recorded = record(client, broker);
        const handling = recordHandling(client, broker);
        answerFirstConnect(broker, new Uint8Array([...bytes, ...validConnackV3_1_1]));

        assertInvalidPacketBeforeConnack(await connectError(client.connect()), Mqtt.ReasonCode.ProtocolError);
        await waitFor(() => recorded.brokerSawClose, 'the close');
        assertEquals(recorded.disconnects, []);
        assertEquals(recorded.closedEvents, 1);
        assertEquals(handling.publishEvents, 0);
        assertEquals(handling.authEvents, 0);
        assertEquals(handling.acknowledgments, []);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    });
  }

  await context.step('WebSocket: on a PUBLISH, the client does not handle it, closes the connection without DISCONNECT, and connect() rejects', async () => {
    const broker = new TestWsBroker();
    const client = new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger, connectTimeoutMS });
    try {
      broker.listen();
      const recorded = record(client, broker);
      const handling = recordHandling(client, broker);
      answerFirstConnect(broker, new Uint8Array([...bytesOf(publishQoS1), ...validConnack]));

      assertInvalidPacketBeforeConnack(await connectError(client.connect()), Mqtt.ReasonCode.ProtocolError);
      await waitFor(() => recorded.brokerSawClose, 'the close');
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.closedEvents, 1);
      assertEquals(handling.publishEvents, 0);
      assertEquals(handling.acknowledgments, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

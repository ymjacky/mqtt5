import { Mqtt, MqttClient, MqttPackets, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assertEquals } from '@std/assert';

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

/** The bytes of a QoS 0 PUBLISH to 'topicA' that is `size` bytes long. */
function publishOfSize(size: number, protocolVersion: Mqtt.ProtocolVersion = Mqtt.ProtocolVersion.MqttV5): Uint8Array {
  const encode = (payloadLength: number) =>
    MqttPackets.packetToBytes(
      { type: 'publish', topic: 'topicA', payload: new Uint8Array(payloadLength), dup: false, retain: false, qos: Mqtt.QoS.AtMostOnce },
      protocolVersion,
    );
  let payloadLength = size - encode(0).length;
  payloadLength -= encode(payloadLength).length - size; // the Remaining Length takes more bytes with the payload
  const bytes = encode(payloadLength);
  assertEquals(bytes.length, size);
  return bytes;
}

/** What a client receives and what the broker gets back: the payload sizes of `publish` events and the DISCONNECT Reason Codes. */
function record(client: MqttClient | WebSocketMqttClient, broker: TestBroker | TestWsBroker) {
  const recorded = { published: [] as number[], disconnects: [] as (number | undefined)[], closed: false };
  client.on('publish', (event) => {
    recorded.published.push(event.detail.payload.length);
  });
  client.on('closed', () => {
    recorded.closed = true;
  });
  broker.on('disconnect', (event) => {
    recorded.disconnects.push(event.detail.reasonCode);
  });
  broker.on('connect', (event) => {
    const packet = event.detail;
    broker.sendConnack(packet.clientId, false, packet.protocolVersion);
  });
  return recorded;
}

Deno.test({ name: '@receive packets larger than the Maximum Packet Size', only: false }, async (context) => {
  await context.step(
    'MQTT 5.0: a packet larger than the Maximum Packet Size of CONNECT is not received, and the client sends DISCONNECT with Packet too large',
    async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger });
      try {
        broker.listen();
        const recorded = record(client, broker);
        await client.connect({ properties: { maximumPacketSize: 1024 } });

        // A packet of the Maximum Packet Size is received.
        await broker.sendRawBytes('cid', publishOfSize(1024));
        await waitFor(() => recorded.published.length === 1, 'the PUBLISH of 1024 bytes');

        // [MQTT-3.1.2-24] one byte more: the client ends the connection with DISCONNECT 0x95 (Packet too large).
        await broker.sendRawBytes('cid', publishOfSize(1025));
        await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
        assertEquals(recorded.disconnects, [Mqtt.ReasonCode.PacketTooLarge]);
        assertEquals(recorded.published.length, 1);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    },
  );

  await context.step('the client ends the connection as soon as the fixed header has been received, without waiting for the rest', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect({ properties: { maximumPacketSize: 1024 } });

      // Only the fixed header of a PUBLISH of 1 MiB: 1 byte and a 3-byte Remaining Length.
      await broker.sendRawBytes('cid', publishOfSize(1024 * 1024).slice(0, 4));
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.PacketTooLarge]);
      assertEquals(recorded.published, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('MQTT 3.1.1: CONNECT has no Maximum Packet Size, so a larger packet is received', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, protocolVersion: Mqtt.ProtocolVersion.MqttV3_1_1 });
    try {
      broker.listen();
      const recorded = record(client, broker);
      // The property is not sent in MQTT 3.1.1, so the broker does not know of the limit.
      await client.connect({ properties: { maximumPacketSize: 1024 } });

      await broker.sendRawBytes('cid', publishOfSize(2048, Mqtt.ProtocolVersion.MqttV3_1_1));
      await waitFor(() => recorded.published.length === 1, 'the PUBLISH of 2048 bytes');
      assertEquals(recorded.disconnects, []);
      assertEquals(recorded.closed, false);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('without a Maximum Packet Size, a packet of 1 MiB is received', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      const publish = publishOfSize(1024 * 1024);
      await broker.sendRawBytes('cid', publish);
      await waitFor(() => recorded.published.length === 1, 'the PUBLISH of 1 MiB');
      assertEquals(recorded.published, [(MqttPackets.decode(publish) as MqttPackets.PublishPacket).payload.length]);
      assertEquals(recorded.closed, false);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step(
    'WebSocket: a packet larger than the Maximum Packet Size is not received, and the client sends DISCONNECT with Packet too large',
    async () => {
      const broker = new TestWsBroker();
      const client = new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger });
      try {
        broker.listen();
        const recorded = record(client, broker);
        await client.connect({ properties: { maximumPacketSize: 1024 } });

        await broker.sendRawBytes('cid', publishOfSize(1024));
        await waitFor(() => recorded.published.length === 1, 'the PUBLISH of 1024 bytes');

        await broker.sendRawBytes('cid', publishOfSize(1025));
        await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
        assertEquals(recorded.disconnects, [Mqtt.ReasonCode.PacketTooLarge]);
        assertEquals(recorded.published.length, 1);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    },
  );
});

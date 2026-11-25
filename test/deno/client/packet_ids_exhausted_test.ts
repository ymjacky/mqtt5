import { ClientErrors, Mqtt, MqttClient, MqttPackets } from '../../../deno/mod.ts';
import * as MqttStream from '../../../lib/mqtt_stream_utils/mod.ts';
import { connackBytes, type RawConnection, RawServer, waitUntil } from '../broker/raw_server.ts';
import { assert, assertEquals, assertRejects } from '@std/assert';

// The number of packet IDs: 1 to 65,535.
const packetIdCount = 65_535;

// Decodes the MQTT 5.0 packets that the client sends on a raw connection, as they arrive.
class ReceivedPackets {
  readonly packets: MqttPackets.AnyPacket[] = [];
  readonly #connection: RawConnection;
  readonly #frames = new MqttStream.MqttFrameBuffer();
  #read = 0;

  constructor(connection: RawConnection) {
    this.#connection = connection;
  }

  // Decodes the bytes received since the last call, and returns all the packets so far.
  update(): MqttPackets.AnyPacket[] {
    const received = this.#connection.received;
    this.#frames.append(received.subarray(this.#read));
    this.#read = received.length;
    for (let bytes = this.#frames.takePacket(); bytes; bytes = this.#frames.takePacket()) {
      this.packets.push(MqttPackets.decode(bytes, Mqtt.ProtocolVersion.MqttV5));
    }
    return this.packets;
  }
}

Deno.test({ name: '@packet IDs exhausted', only: false }, async (context) => {
  await context.step(
    'when all the packet IDs are in use, the calls that need one reject with PacketIdsExhaustedError and send nothing',
    async () => {
      const server = new RawServer({ port: 1883 });
      const client = new MqttClient({ clientId: 'cid' });
      try {
        const connecting = client.connect();
        const connection = await server.connection(0);
        await waitUntil(() => connection.received.length > 0, 'CONNECT');
        await connection.send(connackBytes());
        await connecting;

        // The broker does not answer them: each SUBSCRIBE keeps its packet ID. They fail when the connection is closed.
        const subscribing: Promise<unknown>[] = [];
        for (let i = 0; i < packetIdCount; i++) {
          subscribing.push(client.subscribe('topicA').catch((err) => err));
        }

        await assertRejects(() => client.subscribe('topicA'), ClientErrors.PacketIdsExhaustedError, 'all the IDs from 1 to 65535 are in use');
        await assertRejects(() => client.unsubscribe('topicA'), ClientErrors.PacketIdsExhaustedError);
        await assertRejects(() => client.publish('topicA', 'QoS 1', { qos: Mqtt.QoS.AtLeastOnce }), ClientErrors.PacketIdsExhaustedError);
        // QoS 0 needs no packet ID.
        await client.publish('topicA', 'QoS 0');

        // SUBACK ends the first SUBSCRIBE and frees its packet ID, which the next SUBSCRIBE gets.
        await connection.send(MqttPackets.packetToBytes({ type: 'suback', packetId: 1, reasonCodes: [0] }, Mqtt.ProtocolVersion.MqttV5));
        assertEquals(await subscribing[0], { reasons: [0], reason: undefined });
        subscribing.push(client.subscribe('topicB').catch((err) => err));

        // Nothing was sent for the calls that rejected: after the SUBSCRIBE packets come only the QoS 0 PUBLISH and the
        // SUBSCRIBE that got the packet ID again.
        const received = new ReceivedPackets(connection);
        const expected = 1 + packetIdCount + 2;
        await waitUntil(() => received.update().length >= expected, 'the packets', 10_000);
        const packets = received.packets;
        assertEquals(packets.length, expected);
        assertEquals(packets[0]?.type, 'connect');
        const packetIds = new Set<number>();
        for (const packet of packets.slice(1, 1 + packetIdCount)) {
          assert(packet.type === 'subscribe' && packet.subscriptions[0]?.topicFilter === 'topicA', packet.type);
          packetIds.add(packet.packetId);
        }
        assertEquals(packetIds.size, packetIdCount);
        const [publish, subscribe] = packets.slice(1 + packetIdCount);
        assert(publish?.type === 'publish', publish?.type);
        assertEquals([publish.qos, new TextDecoder().decode(publish.payload)], [Mqtt.QoS.AtMostOnce, 'QoS 0']);
        assert(subscribe?.type === 'subscribe', subscribe?.type);
        assertEquals([subscribe.packetId, subscribe.subscriptions[0]?.topicFilter], [1, 'topicB']);

        await client.disconnect(true);
        for (const result of await Promise.all(subscribing.slice(1))) {
          assert(result instanceof ClientErrors.ConnectionClosed, String(result));
        }
      } finally {
        await client.disconnect(true);
        await server.close();
      }
    },
  );
}); // @packet IDs exhausted

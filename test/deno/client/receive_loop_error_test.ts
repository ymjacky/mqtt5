import { Mqtt, MqttClient, MqttPackets } from '../../../deno/mod.ts';
import type { MqttFrameBuffer } from '../../../lib/mqtt_stream_utils/mod.ts';
import { connackBytes, type RawConnection, RawServer, waitUntil } from '../broker/raw_server.ts';
import { assertEquals } from '@std/assert';

// How MqttClient (TCP) ends a connection whose receive loop fails with an error that the received bytes do not cause,
// e.g. a bug in handling a packet, or memory that cannot be allocated for a large packet.

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

/** The first byte of the fixed header of PUBLISH, QoS 0. */
const publishHeader = 0x30;

/** A client whose handling of a received PUBLISH fails with an error that is not caused by the bytes. */
class PublishHandlingFailingClient extends MqttClient {
  protected override handleReceivedBytes(receiveBytes: Uint8Array): Promise<void> {
    if (receiveBytes[0] === publishHeader) {
      return Promise.reject(new Error('a bug in handling PUBLISH'));
    }
    return super.handleReceivedBytes(receiveBytes);
  }
}

/** A client whose frame buffer fails, as when the memory for a packet cannot be allocated, once `failFraming` is set. */
class FramingFailingClient extends MqttClient {
  failFraming = false;
  protected override createFrameBuffer(): MqttFrameBuffer {
    const frameBuffer = super.createFrameBuffer();
    const takePacket = frameBuffer.takePacket.bind(frameBuffer);
    frameBuffer.takePacket = () => {
      if (this.failFraming) {
        throw new RangeError('Array buffer allocation failed');
      }
      return takePacket();
    };
    return frameBuffer;
  }
}

/** A QoS 0 PUBLISH (MQTT 5.0). */
const publish = MqttPackets.packetToBytes(
  { type: 'publish', topic: 'a', payload: new Uint8Array([0x78]), dup: false, retain: false, qos: Mqtt.QoS.AtMostOnce },
  Mqtt.ProtocolVersion.MqttV5,
);

/** Connects `client` to `server`, which accepts the connection. Returns the connection on the side of the server. */
async function connect(client: MqttClient, server: RawServer, index: number): Promise<RawConnection> {
  const connecting = client.connect();
  const connection = await server.connection(index);
  await waitUntil(() => connection.received.length > 0, 'CONNECT');
  await connection.send(connackBytes());
  await connecting;
  return connection;
}

Deno.test({ name: '@receive loop (TCP): an error that the received bytes do not cause', only: false }, async (context) => {
  await context.step('an error in handling a received packet closes the connection, and the client is offline', async () => {
    const server = new RawServer({ port: 1883 });
    const client = new PublishHandlingFailingClient({ clientId: 'cid', logger });
    try {
      let closedEvents = 0;
      client.on('closed', () => {
        closedEvents++;
      });
      const connection = await connect(client, server, 0);

      await connection.send(publish);
      await waitUntil(() => closedEvents === 1, 'the closed event');
      // Closed by the client: the server does not close it, and keep alive would take 15 s (1.5 times 10 s).
      await waitUntil(() => connection.isClosed, 'the close of the connection', 1000);
      assertEquals(closedEvents, 1);
    } finally {
      await client.disconnect(true);
      await server.close();
    }
  });

  await context.step('an error in splitting the received bytes into packets closes the connection, and the client is offline', async () => {
    const server = new RawServer({ port: 1883 });
    const client = new FramingFailingClient({ clientId: 'cid', logger });
    try {
      let closedEvents = 0;
      client.on('closed', () => {
        closedEvents++;
      });
      const connection = await connect(client, server, 0);

      client.failFraming = true;
      await connection.send(publish);
      await waitUntil(() => closedEvents === 1, 'the closed event');
      await waitUntil(() => connection.isClosed, 'the close of the connection', 1000);
      assertEquals(closedEvents, 1);
    } finally {
      await client.disconnect(true);
      await server.close();
    }
  });

  await context.step('reconnecting on the closed event does not leave the previous connection open', async () => {
    const server = new RawServer({ port: 1883 });
    const client = new PublishHandlingFailingClient({ clientId: 'cid', logger });
    try {
      const first = await connect(client, server, 0);
      const closed = Promise.withResolvers<void>();
      client.on('closed', () => closed.resolve());

      await first.send(publish);
      await closed.promise;
      const second = await connect(client, server, 1);
      await waitUntil(() => first.isClosed, 'the close of the previous connection', 1000);
      assertEquals(second.isClosed, false);
    } finally {
      await client.disconnect(true);
      await server.close();
    }
  });
});

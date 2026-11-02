import { assertEquals, assertRejects } from 'std/assert/mod.ts';
import * as MqttStream from '../../../lib/mqtt_stream_utils/mod.ts';
import * as Publish from '../../../lib/mqtt_packets/publish.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';
import { ConnectionClosed, ConnectionReset } from '../../../lib/client/error.ts';

/**
 * Creates a `ReadableStream<Uint8Array>` that delivers the given chunks in
 * order, just like a real `Deno.Conn`'s `readable` stream delivers whatever
 * the network hands over. This lets us unit test the receive path without
 * opening an actual TCP connection.
 */
function createStreamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

Deno.test('readChunkReturnsChunksAsDelivered', async function () {
  const reader = createStreamFromChunks([new Uint8Array([1, 2]), new Uint8Array([3])]).getReader();

  assertEquals(await MqttStream.readChunk(reader), new Uint8Array([1, 2]));
  assertEquals(await MqttStream.readChunk(reader), new Uint8Array([3]));
});

Deno.test('readChunkRejectsWithConnectionClosedAtEndOfStream', async function () {
  const reader = createStreamFromChunks([]).getReader();

  await assertRejects(
    () => MqttStream.readChunk(reader),
    ConnectionClosed,
  );
});

Deno.test('readChunkRejectsWithConnectionResetOnReset', async function () {
  const error = new Error('reset by peer');
  error.name = 'ConnectionReset';
  const reader = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(error);
    },
  }).getReader();

  await assertRejects(
    () => MqttStream.readChunk(reader),
    ConnectionReset,
  );
});

// Regression test for a large packet delivered by the network in several
// chunks (a read may return fewer bytes than a whole packet). The packet must
// be reassembled correctly, without spreading large byte arrays as function
// call arguments (which used to throw "RangeError: Maximum call stack size
// exceeded").
Deno.test('readChunkWithLargePublishPacketSplitAcrossChunks', async function () {
  const largePayloadSize = 300_000; // well beyond the ~65536 argument-spread limit
  const largePayload = new Uint8Array(largePayloadSize).fill(0x62); // 'b'

  const encoded = Publish.toBytes(
    {
      type: 'publish',
      topic: 'a/b',
      payload: largePayload,
      dup: false,
      retain: false,
      qos: 0,
      packetId: 0,
    },
    Mqtt.ProtocolVersion.MQTT_V3_1_1,
  );

  const chunkSize = 65_536;
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < encoded.length; offset += chunkSize) {
    chunks.push(encoded.slice(offset, offset + chunkSize));
  }

  const reader = createStreamFromChunks(chunks).getReader();
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  let packet: Uint8Array | undefined;
  while (!packet) {
    frameBuffer.append(await MqttStream.readChunk(reader));
    packet = frameBuffer.takePacket();
  }

  assertEquals(packet, encoded);
});

import { assert, assertEquals, assertThrows } from '@std/assert';
import * as MqttStream from '../../../lib/mqtt_stream_utils/mod.ts';
import * as Publish from '../../../lib/mqtt_packets/publish.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';
import { MalformedPacketError } from '../../../lib/mqtt_stream_utils/error.ts';

const pingresp = new Uint8Array([0xD0, 0x00]);

function publishBytes(payloadSize: number): Uint8Array {
  return Publish.toBytes(
    {
      type: 'publish',
      topic: 'a/b',
      payload: new Uint8Array(payloadSize).fill(0x62),
      dup: false,
      retain: false,
      qos: 0,
    },
    Mqtt.ProtocolVersion.MqttV3_1_1,
  );
}

function takeAll(frameBuffer: MqttStream.MqttFrameBuffer): Uint8Array[] {
  const packets: Uint8Array[] = [];
  let packet: Uint8Array | undefined;
  while ((packet = frameBuffer.takePacket())) {
    packets.push(packet);
  }
  return packets;
}

function appendAndTake(frameBuffer: MqttStream.MqttFrameBuffer, data: Uint8Array): Uint8Array[] {
  frameBuffer.append(data);
  return takeAll(frameBuffer);
}

/** Splits `bytes` into chunks of `size` bytes, as TCP reads deliver them. */
function chunksOf(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(bytes.slice(i, i + size));
  }
  return chunks;
}

/** Whether `a` and `b` have the same bytes. Faster than assertEquals() for large arrays. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

Deno.test('decodeRemainingLength', function () {
  assertEquals(MqttStream.decodeRemainingLength(new Uint8Array([0x30, 0x00]), 1), { number: 0, size: 1 });
  assertEquals(MqttStream.decodeRemainingLength(new Uint8Array([0x30, 0xC1, 0x02]), 1), { number: 321, size: 2 });
  assertEquals(MqttStream.decodeRemainingLength(new Uint8Array([0xFF, 0xFF, 0xFF, 0x7F]), 0), { number: 268_435_455, size: 4 });

  // incomplete
  assertEquals(MqttStream.decodeRemainingLength(new Uint8Array([0x30]), 1), undefined);
  assertEquals(MqttStream.decodeRemainingLength(new Uint8Array([0x30, 0x80, 0x80]), 1), undefined);

  // continuation bit still set after 4 bytes
  assertThrows(
    () => MqttStream.decodeRemainingLength(new Uint8Array([0x30, 0xFF, 0xFF, 0xFF, 0xFF]), 1),
    MalformedPacketError,
  );
});

Deno.test('mqttFrameBufferWithMultiplePacketsInOneChunk', function () {
  const publish = publishBytes(10);
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  const packets = appendAndTake(frameBuffer, new Uint8Array([...publish, ...pingresp]));

  assertEquals(packets, [publish, pingresp]);
});

Deno.test('mqttFrameBufferWithPacketSplitAcrossChunks', function () {
  const publish = publishBytes(300); // 2-byte Remaining Length
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  // split inside the Remaining Length
  assertEquals(appendAndTake(frameBuffer, publish.slice(0, 2)), []);
  // split inside the payload
  assertEquals(appendAndTake(frameBuffer, publish.slice(2, 100)), []);
  // rest of the packet followed by the head of the next one
  assertEquals(appendAndTake(frameBuffer, new Uint8Array([...publish.slice(100), pingresp[0]])), [publish]);
  assertEquals(appendAndTake(frameBuffer, pingresp.slice(1)), [pingresp]);
});

// Regression test for receiving a payload beyond the argument-spread limit, which used to throw
// "RangeError: Maximum call stack size exceeded".
Deno.test('mqttFrameBufferWithLargePublishPacket', function () {
  const publish = publishBytes(300_000);
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  assertEquals(appendAndTake(frameBuffer, publish.slice(0, 100_000)), []);
  assertEquals(appendAndTake(frameBuffer, publish.slice(100_000)), [publish]);
});

// Each byte of a packet is copied once. Joining the buffered bytes on every chunk copied a large packet again and again:
// it took about 1 s for 32 MiB in 64 KiB chunks, in a time that grows with the square of the size. Now it takes a few ms.
Deno.test('mqttFrameBufferWithLargePacketInManyChunks', function () {
  const publish = publishBytes(32 * 1024 * 1024);
  const chunks = chunksOf(publish, 64 * 1024);
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  const start = performance.now();
  const packets: Uint8Array[] = [];
  for (const chunk of chunks) {
    packets.push(...appendAndTake(frameBuffer, chunk));
  }
  const elapsed = performance.now() - start;

  assertEquals(packets.length, 1);
  assert(sameBytes(packets[0], publish), 'the packet has the received bytes');
  assert(elapsed < 300, `putting the packet together took ${elapsed.toFixed(0)} ms`);
});

// Nothing is allocated for a packet before its bytes are received: the fixed header alone of the largest packet does not
// make the buffer allocate 256 MiB.
Deno.test('mqttFrameBufferDoesNotAllocateBeforeTheBytesAreReceived', function () {
  const frameBuffer = new MqttStream.MqttFrameBuffer();
  const before = Deno.memoryUsage().external;

  frameBuffer.append(new Uint8Array([0x30, 0xFF, 0xFF, 0xFF, 0x7F])); // PUBLISH with a Remaining Length of 268,435,455
  assertEquals(frameBuffer.takePacket(), undefined);

  const allocated = Deno.memoryUsage().external - before;
  assert(allocated < 16 * 1024 * 1024, `${(allocated / 2 ** 20).toFixed(0)} MiB allocated`);
});

// The fixed header, including a 3-byte Remaining Length, and the packets can be split anywhere.
Deno.test('mqttFrameBufferWithBytesOneByOne', function () {
  const publish = publishBytes(20_000); // 3-byte Remaining Length
  const small = publishBytes(10);
  const stream = new Uint8Array([...pingresp, ...publish, ...small]);
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  const packets: Uint8Array[] = [];
  for (const byte of stream) {
    packets.push(...appendAndTake(frameBuffer, new Uint8Array([byte])));
  }
  assertEquals(packets, [pingresp, publish, small]);
});

Deno.test('mqttFrameBufferWithMaximumPacketSize', function () {
  const publish = publishBytes(300); // 2-byte Remaining Length

  // A packet of the Maximum Packet Size is returned.
  assertEquals(appendAndTake(new MqttStream.MqttFrameBuffer(publish.length), publish), [publish]);

  // A larger one throws as soon as its fixed header has been received, before the rest of it.
  const frameBuffer = new MqttStream.MqttFrameBuffer(publish.length - 1);
  assertEquals(appendAndTake(frameBuffer, publish.slice(0, 2)), []);
  frameBuffer.append(publish.slice(2, 3));
  const err = assertThrows(() => frameBuffer.takePacket(), MqttStream.PacketTooLargeToReceiveError);
  assertEquals(err.packetSize, publish.length);
  assertEquals(err.maximumPacketSize, publish.length - 1);

  // The bytes after it cannot be split into packets: the same error is thrown again.
  frameBuffer.append(publish.slice(3));
  frameBuffer.append(pingresp);
  assertThrows(() => frameBuffer.takePacket(), MqttStream.PacketTooLargeToReceiveError);
});

// Packets preceding a packet that is too large in the same chunk are returned, as before a malformed one.
Deno.test('mqttFrameBufferReturnsPacketsBeforeTooLargeOne', function () {
  const frameBuffer = new MqttStream.MqttFrameBuffer(100);

  frameBuffer.append(new Uint8Array([...pingresp, ...publishBytes(300)]));

  assertEquals(frameBuffer.takePacket(), pingresp);
  assertThrows(() => frameBuffer.takePacket(), MqttStream.PacketTooLargeToReceiveError);
});

Deno.test('mqttFrameBufferWithMultipleAppendsBeforeTake', function () {
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  frameBuffer.append(pingresp);
  frameBuffer.append(pingresp);

  assertEquals(frameBuffer.takePacket(), pingresp);
  assertEquals(frameBuffer.takePacket(), pingresp);
  assertEquals(frameBuffer.takePacket(), undefined);
});

Deno.test('mqttFrameBufferThrowsMalformedPacketErrorForInvalidRemainingLength', function () {
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  frameBuffer.append(new Uint8Array([0x30, 0xFF, 0xFF, 0xFF, 0xFF]));
  assertThrows(
    () => frameBuffer.takePacket(),
    MalformedPacketError,
  );
});

// Packets preceding a malformed one in the same chunk must still be returned,
// so the client processes them before handling the framing error.
Deno.test('mqttFrameBufferReturnsPacketsBeforeMalformedOne', function () {
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  frameBuffer.append(new Uint8Array([...pingresp, ...pingresp, 0x30, 0xFF, 0xFF, 0xFF, 0xFF]));

  assertEquals(frameBuffer.takePacket(), pingresp);
  assertEquals(frameBuffer.takePacket(), pingresp);
  assertThrows(
    () => frameBuffer.takePacket(),
    MalformedPacketError,
  );
});

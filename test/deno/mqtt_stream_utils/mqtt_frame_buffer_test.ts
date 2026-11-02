import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import * as MqttStream from '../../../lib/mqtt_stream_utils/mod.ts';
import * as Publish from '../../../lib/mqtt_packets/publish.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';
import { MalformedPacketError } from '../../../lib/client/error.ts';

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
      packetId: 0,
    },
    Mqtt.ProtocolVersion.MQTT_V3_1_1,
  );
}

function appendAndTake(frameBuffer: MqttStream.MqttFrameBuffer, data: Uint8Array): Uint8Array[] {
  frameBuffer.append(data);
  return frameBuffer.takePackets();
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

// Regression test for receiving a payload beyond the argument-spread limit
// (see readMqttBytesWithLargePublishPacket).
Deno.test('mqttFrameBufferWithLargePublishPacket', function () {
  const publish = publishBytes(300_000);
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  assertEquals(appendAndTake(frameBuffer, publish.slice(0, 100_000)), []);
  assertEquals(appendAndTake(frameBuffer, publish.slice(100_000)), [publish]);
});

Deno.test('mqttFrameBufferWithMultipleAppendsBeforeTake', function () {
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  frameBuffer.append(pingresp);
  frameBuffer.append(pingresp);

  assertEquals(frameBuffer.takePackets(), [pingresp, pingresp]);
  assertEquals(frameBuffer.takePackets(), []);
});

Deno.test('mqttFrameBufferThrowsMalformedPacketErrorForInvalidRemainingLength', function () {
  const frameBuffer = new MqttStream.MqttFrameBuffer();

  frameBuffer.append(new Uint8Array([0x30, 0xFF, 0xFF, 0xFF, 0xFF]));
  assertThrows(
    () => frameBuffer.takePackets(),
    MalformedPacketError,
  );
});

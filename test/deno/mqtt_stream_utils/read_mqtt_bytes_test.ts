import { assertEquals } from 'std/assert/mod.ts';
import * as MqttStream from '../../../lib/mqtt_stream_utils/mod.ts';
import * as Publish from '../../../lib/mqtt_packets/publish.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

/**
 * Creates a `ReadableStream<Uint8Array>` of type `bytes` backed by a fixed
 * `Uint8Array`, so it can be read from via a BYOB reader just like a real
 * `Deno.Conn`'s `readable` stream. This lets us unit test `readMqttBytes()`
 * without opening an actual TCP connection.
 */
function createByobStreamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    type: 'bytes',
    pull(controller) {
      const byobRequest = controller.byobRequest;
      if (!byobRequest) {
        controller.close();
        return;
      }

      const view = byobRequest.view as Uint8Array;
      const remaining = bytes.length - offset;
      if (remaining <= 0) {
        controller.close();
        byobRequest.respond(0);
        return;
      }

      const toCopy = Math.min(view.byteLength, remaining);
      view.set(bytes.subarray(offset, offset + toCopy));
      offset += toCopy;
      byobRequest.respond(toCopy);
    },
  });
}

// Regression test for a bug where spreading a large byte array as function
// call arguments (e.g. `array.push(...bytes)`) could throw
// "RangeError: Maximum call stack size exceeded" while receiving bytes from
// the network. A broker sending any packet whose payload exceeds the
// argument-spread limit (tens of thousands of elements) used to crash the
// client. This test feeds a large PUBLISH packet through `readMqttBytes()`
// and verifies it is received correctly without throwing.
Deno.test('readMqttBytesWithLargePublishPacket', async function () {
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

  const stream = createByobStreamFromBytes(encoded);
  const reader = stream.getReader({ mode: 'byob' });

  const receiveBytes = await MqttStream.readMqttBytes(reader);

  assertEquals(receiveBytes, encoded);
});

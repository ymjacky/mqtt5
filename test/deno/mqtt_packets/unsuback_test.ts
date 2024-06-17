import { assertEquals } from 'std/assert/mod.ts';
import type { UnsubackPacket } from '../../../lib/mqtt_packets/unsuback.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/unsuback.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodeUnsubackPacket', function encodeUnsubackPacket() {
  assertEquals(
    toBytes(
      {
        type: 'unsuback',
        packetId: 1,
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0xb0, // packetType + flags
      2, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
    ]),
  );
});

Deno.test('decodeUnsubackPacket', function decodeUnsubackPacket() {
  assertEquals<UnsubackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        1, // id LSB
      ]),
      2, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    {
      type: 'unsuback',
      packetId: 1,
    },
  );
});

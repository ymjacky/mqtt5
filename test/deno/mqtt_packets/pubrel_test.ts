import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import type { PubrelPacket } from '../../../lib/mqtt_packets/pubrel.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/pubrel.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodePubrelPacket', function encodePubrelPacket() {
  assertEquals(
    toBytes(
      {
        type: 'pubrel',
        packetId: 1337,
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0x62, // packetType + flags
      2, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
    ]),
  );
});

Deno.test('decodePubrelPacket', function decodePubrelPacket() {
  assertEquals<PubrelPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        5, // id MSB
        57, // id LSB
      ]),
      2, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    {
      type: 'pubrel',
      packetId: 1337,
    },
  );
});

Deno.test('decodeShortPubrelPackets', function decodeShortPubrelPackets() {
  // assertEquals(parse(Uint8Array.from([0x62]), new TextDecoder()), null);
  assertThrows(() => parse(Uint8Array.from([0x62, 2]), 0, Mqtt.ProtocolVersion.MQTT_V3_1_1));
  assertThrows(() => parse(Uint8Array.from([0x62, 2, 5]), 1, Mqtt.ProtocolVersion.MQTT_V3_1_1));
});

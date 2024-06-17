import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import type { PubrecPacket } from '../../../lib/mqtt_packets/pubrec.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/pubrec.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodePubrecPacket', function encodePubrecPacket() {
  assertEquals(
    toBytes(
      {
        type: 'pubrec',
        packetId: 1337,
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0x50, // packetType + flags
      2, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
    ]),
  );
});

Deno.test('decodePubrecPacket', function decodePubrecPacket() {
  assertEquals<PubrecPacket>(
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
      type: 'pubrec',
      packetId: 1337,
    },
  );
});

Deno.test('decodeShortPubrecPackets', function decodeShortPubrecPackets() {
  assertThrows(() => parse(Uint8Array.from([0x50, 2]), 0, Mqtt.ProtocolVersion.MQTT_V3_1_1));
  assertThrows(() => parse(Uint8Array.from([0x50, 2, 5]), 1, Mqtt.ProtocolVersion.MQTT_V3_1_1));
});

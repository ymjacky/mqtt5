import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import type { PubcompPacket } from '../../../lib/mqtt_packets/pubcomp.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/pubcomp.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodePubcompPacket', function encodePubcompPacket() {
  assertEquals(
    toBytes({
      type: 'pubcomp',
      packetId: 1337,
    }, 4 // protocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0x70, // packetType + flags
      2, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
    ]),
  );
});

Deno.test('decodePubcompPacket', function decodePubcompPacket() {
  assertEquals<PubcompPacket>(
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
      type: 'pubcomp',
      packetId: 1337,
    },
  );
});

Deno.test('decodeShortPubcompPackets', function decodeShortPubcompPackets() {
  assertThrows(() => parse(Uint8Array.from([0x70, 2]), 0, Mqtt.ProtocolVersion.MQTT_V3_1_1));
  assertThrows(() => parse(Uint8Array.from([0x70, 2, 5]), 1, Mqtt.ProtocolVersion.MQTT_V3_1_1));
});

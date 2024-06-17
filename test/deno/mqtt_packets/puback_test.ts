import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import type { PubackPacket } from '../../../lib/mqtt_packets/puback.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/puback.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodePubackPacket', function encodePubackPacket() {
  assertEquals(
    toBytes({
      type: 'puback',
      packetId: 1337,
    }, 4 // protocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0x40, // packetType + flags
      2, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
    ]),
  );
});

Deno.test('decodePubackPacket', function decodePubackPacket() {
  assertEquals<PubackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        5, // id MSB
        57, // id LSB
      ]),
      2, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtcolVersion
    ),
    {
      type: 'puback',
      packetId: 1337,
    },
  );
});

Deno.test('decodeShortPubackPackets', function decodeShortPubackPackets() {
  assertThrows(() => parse(Uint8Array.from([0x40, 2]), 0, Mqtt.ProtocolVersion.MQTT_V3_1_1));
  assertThrows(() => parse(Uint8Array.from([0x40, 2, 5]), 1, Mqtt.ProtocolVersion.MQTT_V3_1_1));
});

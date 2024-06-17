import { assertEquals } from 'std/assert/mod.ts';
import type { SubackPacket } from '../../../lib/mqtt_packets/suback.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/suback.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodeSubackPacket', function decodeSubackPacket() {
  assertEquals(
    toBytes(
      {
        type: 'suback',
        packetId: 1,
        returnCodes: [0, 1],
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0x90, // packetType + flags
      4, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // payload
      0,
      1,
    ]),
  );
});

Deno.test('decodeSubackPacket', function decodeSubackPacket() {
  assertEquals<SubackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        1, // id LSB
        // payload
        0,
        1,
      ]),
      4, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    {
      type: 'suback',
      packetId: 1,
      returnCodes: [0, 1],
    },
  );
});

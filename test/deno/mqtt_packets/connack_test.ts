import { assertEquals, assertThrows } from 'std/assert/mod.ts';

import type { ConnackPacket } from '../../../lib/mqtt_packets/connack.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/connack.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodeConnackPacket', function encodeConnackPacket() {
  assertEquals(
    toBytes(
      {
        type: 'connack',
        sessionPresent: false,
        returnCode: 0,
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      // 32, // packetType + flags
      (0b0010 << 4) + 0b0000,
      2, // remainingLength
      // variableHeader
      0, // connack flags
      0, // return code
    ]),
  );
});

Deno.test('decodeConnackPacket', function decodeConnackPacket() {
  assertEquals<ConnackPacket>(
    parse(
      Uint8Array.from(
        [
          // variableHeader
          0, // connack flags
          0, // return code
        ],
      ),
      2, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    {
      type: 'connack',
      sessionPresent: false,
      returnCode: 0,
    },
  );
});

Deno.test(
  'enodeConnackPacketWithSessionPresent',
  function decodeConnackPacketWithSessionPresent() {
    assertEquals(
      toBytes({
        type: 'connack',
        sessionPresent: true,
        returnCode: 0,
      }, 4 // ProtocolVersion
      ),
      new Uint8Array([
        // fixedHeader
        32, // packetType + flags
        2, // remainingLength
        // variableHeader
        1, // connack flags (sessionPresent)
        0, // return code
      ]),
    );
  },
);

Deno.test(
  'decodeConnackPacketWithSessionPresent',
  function decodeConnackPacketWithSessionPresent() {
    assertEquals<ConnackPacket>(
      parse(
        Uint8Array.from([
          // variableHeader
          1, // connack flags (sessionPresent)
          0, // return code
        ]),
        2, // remainingLength
        Mqtt.ProtocolVersion.MQTT_V3_1_1,
      ),
      {
        type: 'connack',
        sessionPresent: true,
        returnCode: 0,
      },
    );
  },
);

Deno.test(
  'decodeConnackPacketWithReturnCode',
  function decodeConnackPacketWithReturnCode() {
    assertEquals<ConnackPacket>(
      parse(
        Uint8Array.from([
          // variableHeader
          0, // connack flags
          4, // return code (bad username or password)
        ]),
        2, // remainingLength
        Mqtt.ProtocolVersion.MQTT_V3_1_1,
      ),
      {
        type: 'connack',
        sessionPresent: false,
        returnCode: 4,
      },
    );
  },
);

Deno.test('decodeShortConnackPackets', function decodeShortConnackPackets() {
  assertThrows(() => parse(Uint8Array.from([32, 2]), 0, 4));
  assertThrows(() => parse(Uint8Array.from([32, 2, 0]), 1, 4));
});

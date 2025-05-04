import { assertEquals } from 'std/assert/mod.ts';
import type { UnsubscribePacket } from '../../../lib/mqtt_packets/unsubscribe.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/unsubscribe.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodeUnsubscribePacket', function () {
  assertEquals(
    toBytes(
      {
        type: 'unsubscribe',
        packetId: 1,
        topicFilters: ['a/b', 'c/d'],
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0xa2, // packetType + flags
      12, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // payload
      0, // topic filter length MSB
      3, // topic filter length LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      0, // topic filter length MSB
      3, // topic filter length LSB
      99, // 'c'
      47, // '/'
      100, // 'd'
    ]),
  );
});

Deno.test('encodeUnsubscribePacketMQTT5', function () {
  assertEquals(
    toBytes(
      {
        type: 'unsubscribe',
        packetId: 1,
        topicFilters: ['a/b', 'c/d'],
        properties: {
          userProperties: [
            { key: 'key1', val: 'value1' },
            { key: 'key2', val: 'value2' },
          ],
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0xa2, // packetType + flags
      43, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // properties
      30, // properties length
      0x26, // User Property Identifier
      0,
      4,
      107,
      101,
      121,
      49, // 'key1'
      0,
      6,
      118,
      97,
      108,
      117,
      101,
      49, // 'value1'
      0x26, // User Property Identifier
      0,
      4,
      107,
      101,
      121,
      50, // 'key2'
      0,
      6,
      118,
      97,
      108,
      117,
      101,
      50, // 'value2'
      // payload
      0, // topic filter length MSB
      3, // topic filter length LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      0, // topic filter length MSB
      3, // topic filter length LSB
      99, // 'c'
      47, // '/'
      100, // 'd'
    ]),
  );
});

// Test for Unsubscribe packet without properties in MQTT v5
Deno.test('encodeUnsubscribePacketMQTT5NoProperties', function () {
  assertEquals(
    toBytes(
      {
        type: 'unsubscribe',
        packetId: 1,
        topicFilters: ['a/b', 'c/d'],
      },
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0xa2, // packetType + flags
      13, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      0, // properties length = 0
      // payload
      0, // topic filter length MSB
      3, // topic filter length LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      0, // topic filter length MSB
      3, // topic filter length LSB
      99, // 'c'
      47, // '/'
      100, // 'd'
    ]),
  );
});

Deno.test('decodeUnsubscribePacket', function () {
  assertEquals<UnsubscribePacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        1, // id LSB
        // payload
        0, // topic filter length MSB
        3, // topic filter length LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        0, // topic filter length MSB
        3, // topic filter length LSB
        99, // 'c'
        47, // '/'
        100, // 'd'
      ]),
      12, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    {
      type: 'unsubscribe',
      packetId: 1,
      topicFilters: ['a/b', 'c/d'],
    },
  );
});

Deno.test('decodeUnsubscribePacketMQTT5', function () {
  // Create a buffer with the expected bytes
  const buffer = Uint8Array.from([
    // variableHeader
    0, // id MSB
    1, // id LSB
    // properties
    30, // properties length
    0x26, // User Property Identifier
    0,
    4,
    107,
    101,
    121,
    49, // 'key1'
    0,
    6,
    118,
    97,
    108,
    117,
    101,
    49, // 'value1'
    0x26, // User Property Identifier
    0,
    4,
    107,
    101,
    121,
    50, // 'key2'
    0,
    6,
    118,
    97,
    108,
    117,
    101,
    50, // 'value2'
    // payload
    0, // topic filter length MSB
    3, // topic filter length LSB
    97, // 'a'
    47, // '/'
    98, // 'b'
    0, // topic filter length MSB
    3, // topic filter length LSB
    99, // 'c'
    47, // '/'
    100, // 'd'
  ]);

  // Calculate the correct remaining length
  const remainingLength = buffer.length;

  assertEquals<UnsubscribePacket>(
    parse(
      buffer,
      remainingLength,
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'unsubscribe',
      packetId: 1,
      topicFilters: ['a/b', 'c/d'],
      properties: {
        userProperties: [
          { key: 'key1', val: 'value1' },
          { key: 'key2', val: 'value2' },
        ],
      },
    },
  );
});

// Test for parsing Unsubscribe packet without properties in MQTT v5
Deno.test('decodeUnsubscribePacketMQTT5NoProperties', function () {
  assertEquals<UnsubscribePacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        1, // id LSB
        0, // properties length = 0
        // payload
        0, // topic filter length MSB
        3, // topic filter length LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        0, // topic filter length MSB
        3, // topic filter length LSB
        99, // 'c'
        47, // '/'
        100, // 'd'
      ]),
      13, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'unsubscribe',
      packetId: 1,
      topicFilters: ['a/b', 'c/d'],
      properties: {},
    },
  );
});

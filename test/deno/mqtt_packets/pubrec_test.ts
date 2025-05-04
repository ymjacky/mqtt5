import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import type { PubrecPacket } from '../../../lib/mqtt_packets/pubrec.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/pubrec.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

// Test basic PUBREC packet encoding for MQTT v3.1.1
Deno.test('encodePubrecPacket', function () {
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

// Test PUBREC packet encoding with success reason code for MQTT v5
Deno.test('encodePubrecPacketMQTT5WithSuccessReasonCode', function () {
  assertEquals(
    toBytes(
      {
        type: 'pubrec',
        packetId: 1337,
        reasonCode: Mqtt.ReasonCode.Success,
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0x50, // packetType + flags
      2, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
      // No reasonCode for Success without properties
    ]),
  );
});

// Test PUBREC packet encoding with error reason code for MQTT v5
Deno.test('encodePubrecPacketMQTT5WithErrorReasonCode', function () {
  assertEquals(
    toBytes(
      {
        type: 'pubrec',
        packetId: 1337,
        reasonCode: Mqtt.ReasonCode.NoMatchingSubscribers,
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0x50, // packetType + flags
      3, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
      0x10, // reasonCode = NoMatchingSubscribers (16)
    ]),
  );
});

// Test PUBREC packet encoding with properties for MQTT v5
Deno.test('encodePubrecPacketMQTT5WithProperties', function () {
  assertEquals(
    toBytes(
      {
        type: 'pubrec',
        packetId: 1337,
        reasonCode: Mqtt.ReasonCode.NoMatchingSubscribers,
        properties: {
          reasonString: 'No matching subscribers',
          userProperties: [
            { key: 'topicName', val: 'sensors/temperature' },
          ],
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0x50, // packetType + flags
      63, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
      0x10, // reasonCode = NoMatchingSubscribers (16)
      // properties
      59, // properties length
      0x1F, // Reason String Identifier
      0,
      23,
      78,
      111,
      32,
      109,
      97,
      116,
      99,
      104,
      105,
      110,
      103,
      32,
      115,
      117,
      98,
      115,
      99,
      114,
      105,
      98,
      101,
      114,
      115, // 'No matching subscribers'
      0x26, // User Property Identifier
      0,
      9,
      116,
      111,
      112,
      105,
      99,
      78,
      97,
      109,
      101, // 'topicName'
      0,
      19,
      115,
      101,
      110,
      115,
      111,
      114,
      115,
      47,
      116,
      101,
      109,
      112,
      101,
      114,
      97,
      116,
      117,
      114,
      101, // 'sensors/temperature'
    ]),
  );
});

// Test basic PUBREC packet parsing for MQTT v3.1.1
Deno.test('decodePubrecPacket', function () {
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

// Test PUBREC packet parsing with error reason code for MQTT v5
Deno.test('decodePubrecPacketMQTT5WithReasonCode', function () {
  assertEquals<PubrecPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        5, // id MSB
        57, // id LSB
        0x10, // reasonCode = NoMatchingSubscribers (16)
      ]),
      3, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'pubrec',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.NoMatchingSubscribers,
    },
  );
});

// Test PUBREC packet parsing with properties for MQTT v5
Deno.test('decodePubrecPacketMQTT5WithProperties', function () {
  assertEquals<PubrecPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        5, // id MSB
        57, // id LSB
        0x10, // reasonCode = NoMatchingSubscribers (16)
        // properties
        59, // properties length
        0x1F, // Reason String Identifier
        0,
        23,
        78,
        111,
        32,
        109,
        97,
        116,
        99,
        104,
        105,
        110,
        103,
        32,
        115,
        117,
        98,
        115,
        99,
        114,
        105,
        98,
        101,
        114,
        115, // 'No matching subscribers'
        0x26, // User Property Identifier
        0,
        9,
        116,
        111,
        112,
        105,
        99,
        78,
        97,
        109,
        101, // 'topicName'
        0,
        19,
        115,
        101,
        110,
        115,
        111,
        114,
        115,
        47,
        116,
        101,
        109,
        112,
        101,
        114,
        97,
        116,
        117,
        114,
        101, // 'sensors/temperature'
      ]),
      63, // remainingLength (packetId: 2 bytes + reasonCode: 1 byte + properties length: 1 byte + properties: 59 bytes = 63 bytes)
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'pubrec',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.NoMatchingSubscribers,
      properties: {
        reasonString: 'No matching subscribers',
        userProperties: [
          { key: 'topicName', val: 'sensors/temperature' },
        ],
      },
    },
  );
});

// Test handling of short PUBREC packets (error cases)
Deno.test('decodeShortPubrecPackets', function () {
  assertThrows(() => parse(Uint8Array.from([]), 0, Mqtt.ProtocolVersion.MQTT_V3_1_1));
  assertThrows(() => parse(Uint8Array.from([5]), 1, Mqtt.ProtocolVersion.MQTT_V3_1_1));
});

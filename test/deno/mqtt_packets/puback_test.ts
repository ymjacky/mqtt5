import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import type { PubackPacket } from '../../../lib/mqtt_packets/puback.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/puback.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

// Test basic PUBACK packet encoding for MQTT v3.1.1
Deno.test('encodePubackPacket', function () {
  assertEquals(
    toBytes({
      type: 'puback',
      packetId: 1337,
    }, Mqtt.ProtocolVersion.MQTT_V3_1_1),
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

// Test PUBACK packet encoding with success reason code for MQTT v5
Deno.test('encodePubackPacketMQTT5WithSuccessReasonCode', function () {
  assertEquals(
    toBytes({
      type: 'puback',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.Success,
    }, Mqtt.ProtocolVersion.MQTT_V5),
    new Uint8Array([
      // fixedHeader
      0x40, // packetType + flags
      2, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
      // No reasonCode for Success without properties
    ]),
  );
});

// Test PUBACK packet encoding with error reason code for MQTT v5
Deno.test('encodePubackPacketMQTT5WithErrorReasonCode', function () {
  assertEquals(
    toBytes({
      type: 'puback',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.NotAuthorized,
    }, Mqtt.ProtocolVersion.MQTT_V5),
    new Uint8Array([
      // fixedHeader
      0x40, // packetType + flags
      3, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
      0x87, // reasonCode = NotAuthorized (135)
    ]),
  );
});

// Test PUBACK packet encoding with properties for MQTT v5
Deno.test('encodePubackPacketMQTT5WithProperties', function () {
  assertEquals(
    toBytes({
      type: 'puback',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.NotAuthorized,
      properties: {
        reasonString: 'Not authorized to publish',
        userProperties: [
          { key: 'topic', val: 'restricted/topic' },
        ],
      },
    }, Mqtt.ProtocolVersion.MQTT_V5),
    new Uint8Array([
      // fixedHeader
      0x40, // packetType + flags
      58, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
      0x87, // reasonCode = NotAuthorized (135)
      // properties
      54, // properties length
      0x1F, // Reason String Identifier
      0,
      25,
      78,
      111,
      116,
      32,
      97,
      117,
      116,
      104,
      111,
      114,
      105,
      122,
      101,
      100,
      32,
      116,
      111,
      32,
      112,
      117,
      98,
      108,
      105,
      115,
      104, // 'Not authorized to publish'
      0x26, // User Property Identifier
      0,
      5,
      116,
      111,
      112,
      105,
      99, // 'topic'
      0,
      16,
      114,
      101,
      115,
      116,
      114,
      105,
      99,
      116,
      101,
      100,
      47,
      116,
      111,
      112,
      105,
      99, // 'restricted/topic'
    ]),
  );
});

// Test basic PUBACK packet parsing for MQTT v3.1.1
Deno.test('decodePubackPacket', function () {
  assertEquals<PubackPacket>(
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
      type: 'puback',
      packetId: 1337,
    },
  );
});

// Test PUBACK packet parsing with error reason code for MQTT v5
Deno.test('decodePubackPacketMQTT5WithReasonCode', function () {
  assertEquals<PubackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        5, // id MSB
        57, // id LSB
        0x87, // reasonCode = NotAuthorized (135)
      ]),
      3, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'puback',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.NotAuthorized,
    },
  );
});

// Test PUBACK packet parsing with properties for MQTT v5
Deno.test('decodePubackPacketMQTT5WithProperties', function () {
  assertEquals<PubackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        5, // id MSB
        57, // id LSB
        0x87, // reasonCode = NotAuthorized (135)
        // properties
        54, // properties length
        0x1F, // Reason String Identifier
        0,
        25,
        78,
        111,
        116,
        32,
        97,
        117,
        116,
        104,
        111,
        114,
        105,
        122,
        101,
        100,
        32,
        116,
        111,
        32,
        112,
        117,
        98,
        108,
        105,
        115,
        104, // 'Not authorized to publish'
        0x26, // User Property Identifier
        0,
        5,
        116,
        111,
        112,
        105,
        99, // 'topic'
        0,
        16,
        114,
        101,
        115,
        116,
        114,
        105,
        99,
        116,
        101,
        100,
        47,
        116,
        111,
        112,
        105,
        99, // 'restricted/topic'
      ]),
      58, // remainingLength (packetId: 2 bytes + reasonCode: 1 byte + properties length: 1 byte + properties: 54 bytes = 58 bytes)
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'puback',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.NotAuthorized,
      properties: {
        reasonString: 'Not authorized to publish',
        userProperties: [
          { key: 'topic', val: 'restricted/topic' },
        ],
      },
    },
  );
});

// Test handling of short PUBACK packets (error cases)
Deno.test('decodeShortPubackPackets', function () {
  assertThrows(() => parse(Uint8Array.from([]), 0, Mqtt.ProtocolVersion.MQTT_V3_1_1));
  assertThrows(() => parse(Uint8Array.from([5]), 1, Mqtt.ProtocolVersion.MQTT_V3_1_1));
});

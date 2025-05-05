import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import type { PubcompPacket } from '../../../lib/mqtt_packets/pubcomp.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/pubcomp.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

// Test basic PUBCOMP packet encoding for MQTT v3.1.1
Deno.test('encodePubcompPacket', function () {
  assertEquals(
    toBytes({
      type: 'pubcomp',
      packetId: 1337,
    }, Mqtt.ProtocolVersion.MQTT_V3_1_1),
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

// Test PUBCOMP packet encoding with success reason code for MQTT v5
Deno.test('encodePubcompPacketMQTT5WithSuccessReasonCode', function () {
  assertEquals(
    toBytes({
      type: 'pubcomp',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.Success,
    }, Mqtt.ProtocolVersion.MQTT_V5),
    new Uint8Array([
      // fixedHeader
      0x70, // packetType + flags
      2, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
      // No reasonCode for Success without properties
    ]),
  );
});

// Test PUBCOMP packet encoding with error reason code for MQTT v5
Deno.test('encodePubcompPacketMQTT5WithErrorReasonCode', function () {
  assertEquals(
    toBytes({
      type: 'pubcomp',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.PacketIdentifierNotFound,
    }, Mqtt.ProtocolVersion.MQTT_V5),
    new Uint8Array([
      // fixedHeader
      0x70, // packetType + flags
      3, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
      0x92, // reasonCode = PacketIdentifierNotFound (146)
    ]),
  );
});

// Test PUBCOMP packet encoding with properties for MQTT v5
Deno.test('encodePubcompPacketMQTT5WithProperties', function () {
  assertEquals(
    toBytes({
      type: 'pubcomp',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.PacketIdentifierNotFound,
      properties: {
        reasonString: 'Packet identifier not found',
        userProperties: [
          { key: 'clientId', val: 'mqtt-client-123' },
        ],
      },
    }, Mqtt.ProtocolVersion.MQTT_V5),
    new Uint8Array([
      // fixedHeader
      0x70, // packetType + flags
      62, // remainingLength
      // variableHeader
      5, // id MSB
      57, // id LSB
      0x92, // reasonCode = PacketIdentifierNotFound (146)
      // properties
      58, // properties length
      0x1F, // Reason String Identifier
      0,
      27,
      80,
      97,
      99,
      107,
      101,
      116,
      32,
      105,
      100,
      101,
      110,
      116,
      105,
      102,
      105,
      101,
      114,
      32,
      110,
      111,
      116,
      32,
      102,
      111,
      117,
      110,
      100, // 'Packet identifier not found'
      0x26, // User Property Identifier
      0,
      8,
      99,
      108,
      105,
      101,
      110,
      116,
      73,
      100, // 'clientId'
      0,
      15,
      109,
      113,
      116,
      116,
      45,
      99,
      108,
      105,
      101,
      110,
      116,
      45,
      49,
      50,
      51, // 'mqtt-client-123'
    ]),
  );
});

// Test basic PUBCOMP packet parsing for MQTT v3.1.1
Deno.test('decodePubcompPacket', function () {
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

// Test PUBCOMP packet parsing with error reason code for MQTT v5
Deno.test('decodePubcompPacketMQTT5WithReasonCode', function () {
  assertEquals<PubcompPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        5, // id MSB
        57, // id LSB
        0x92, // reasonCode = PacketIdentifierNotFound (146)
      ]),
      3, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'pubcomp',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.PacketIdentifierNotFound,
    },
  );
});

// Test PUBCOMP packet parsing with properties for MQTT v5
Deno.test('decodePubcompPacketMQTT5WithProperties', function () {
  assertEquals<PubcompPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        5, // id MSB
        57, // id LSB
        0x92, // reasonCode = PacketIdentifierNotFound (146)
        // properties
        58, // properties length
        0x1F, // Reason String Identifier
        0,
        27,
        80,
        97,
        99,
        107,
        101,
        116,
        32,
        105,
        100,
        101,
        110,
        116,
        105,
        102,
        105,
        101,
        114,
        32,
        110,
        111,
        116,
        32,
        102,
        111,
        117,
        110,
        100, // 'Packet identifier not found'
        0x26, // User Property Identifier
        0,
        8,
        99,
        108,
        105,
        101,
        110,
        116,
        73,
        100, // 'clientId'
        0,
        15,
        109,
        113,
        116,
        116,
        45,
        99,
        108,
        105,
        101,
        110,
        116,
        45,
        49,
        50,
        51, // 'mqtt-client-123'
      ]),
      62, // remainingLength (packetId: 2 bytes + reasonCode: 1 byte + properties length: 1 byte + properties: 58 bytes = 62 bytes)
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'pubcomp',
      packetId: 1337,
      reasonCode: Mqtt.ReasonCode.PacketIdentifierNotFound,
      properties: {
        reasonString: 'Packet identifier not found',
        userProperties: [
          { key: 'clientId', val: 'mqtt-client-123' },
        ],
      },
    },
  );
});

// Test handling of short PUBCOMP packets (error cases)
Deno.test('decodeShortPubcompPackets', function () {
  assertThrows(() => parse(Uint8Array.from([]), 0, Mqtt.ProtocolVersion.MQTT_V3_1_1));
  assertThrows(() => parse(Uint8Array.from([5]), 1, Mqtt.ProtocolVersion.MQTT_V3_1_1));
});

import { assertEquals } from 'std/assert/mod.ts';
import type { PublishPacket } from '../../../lib/mqtt_packets/publish.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/publish.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

// Test basic PUBLISH packet encoding for MQTT v3.1.1
Deno.test('encodePublishPacket', function () {
  assertEquals(
    toBytes(
      {
        type: 'publish',
        topic: 'a/b',
        payload: new TextEncoder().encode('payload'),
        dup: false,
        retain: false,
        qos: 0,
        packetId: 0,
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1,
    ),
    new Uint8Array([
      // fixedHeader
      48, // packetType + flags
      12, // remainingLength
      // variableHeader
      0, // topicLength MSB
      3, // topicLength LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      // payload
      112, // 'p'
      97, // 'a'
      121, // 'y'
      108, // 'l'
      111, // 'o'
      97, // 'a'
      100, // 'd'
    ]),
  );
});

// Test PUBLISH packet encoding with QoS 1 for MQTT v3.1.1
Deno.test('encodePublishPacketWithQoS1', function () {
  assertEquals(
    toBytes(
      {
        type: 'publish',
        topic: 'a/b',
        payload: new TextEncoder().encode('payload'),
        dup: false,
        retain: false,
        qos: 1,
        packetId: 42,
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1,
    ),
    new Uint8Array([
      // fixedHeader
      50, // packetType + flags (QoS 1)
      14, // remainingLength
      // variableHeader
      0, // topicLength MSB
      3, // topicLength LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      0, // packetId MSB
      42, // packetId LSB
      // payload
      112, // 'p'
      97, // 'a'
      121, // 'y'
      108, // 'l'
      111, // 'o'
      97, // 'a'
      100, // 'd'
    ]),
  );
});

// Test PUBLISH packet encoding with Topic Alias for MQTT v5
Deno.test('encodePublishPacketMQTT5WithTopicAlias', function () {
  assertEquals(
    toBytes(
      {
        type: 'publish',
        topic: 'a/b',
        payload: new TextEncoder().encode('payload'),
        dup: false,
        retain: false,
        qos: 0,
        packetId: 0,
        properties: {
          topicAlias: 5,
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      48, // packetType + flags
      16, // remainingLength
      // variableHeader
      0, // topicLength MSB
      3, // topicLength LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      // properties
      3, // properties length
      0x23, // Topic Alias Identifier
      0, // MSB
      5, // LSB (value = 5)
      // payload
      112, // 'p'
      97, // 'a'
      121, // 'y'
      108, // 'l'
      111, // 'o'
      97, // 'a'
      100, // 'd'
    ]),
  );
});

// Test PUBLISH packet encoding with Payload Format Indicator for MQTT v5
Deno.test('encodePublishPacketMQTT5WithPayloadFormatIndicator', function () {
  assertEquals(
    toBytes(
      {
        type: 'publish',
        topic: 'a/b',
        payload: new TextEncoder().encode('payload'),
        dup: false,
        retain: false,
        qos: 0,
        packetId: 0,
        properties: {
          payloadFormatIndicator: 1, // 1 = UTF-8 encoded data
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      48, // packetType + flags
      15, // remainingLength
      // variableHeader
      0, // topicLength MSB
      3, // topicLength LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      // properties
      2, // properties length
      0x01, // Payload Format Indicator Identifier
      1, // value (1 = UTF-8 encoded data)
      // payload
      112, // 'p'
      97, // 'a'
      121, // 'y'
      108, // 'l'
      111, // 'o'
      97, // 'a'
      100, // 'd'
    ]),
  );
});

// Test PUBLISH packet encoding with multiple properties for MQTT v5
Deno.test('encodePublishPacketMQTT5WithMultipleProperties', function () {
  assertEquals(
    toBytes(
      {
        type: 'publish',
        topic: 'sensors/temperature',
        payload: new TextEncoder().encode('25.5'),
        dup: false,
        retain: true,
        qos: 1,
        packetId: 123,
        properties: {
          payloadFormatIndicator: 1,
          messageExpiryInterval: 3600, // 1 hour
          contentType: 'application/json',
          topicAlias: 15,
          userProperties: [
            { key: 'deviceId', val: 'sensor-123' },
          ],
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      51, // packetType + flags (QoS 1 + retain)
      80, // remainingLength
      // variableHeader
      0, // topicLength MSB
      19, // topicLength LSB
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
      0, // packetId MSB
      123, // packetId LSB
      // properties
      52, // properties length
      0x01, // Payload Format Indicator Identifier
      1, // value (1 = UTF-8 encoded data)
      0x02, // Message Expiry Interval Identifier
      0,
      0,
      14,
      16, // value (3600 = 0x0E10)
      0x03, // Content Type Identifier
      0,
      16,
      97,
      112,
      112,
      108,
      105,
      99,
      97,
      116,
      105,
      111,
      110,
      47,
      106,
      115,
      111,
      110, // 'application/json'
      0x23, // Topic Alias Identifier
      0,
      15, // value (15)
      0x26, // User Property Identifier
      0,
      8,
      100,
      101,
      118,
      105,
      99,
      101,
      73,
      100, // 'deviceId'
      0,
      10,
      115,
      101,
      110,
      115,
      111,
      114,
      45,
      49,
      50,
      51, // 'sensor-123'
      // payload
      50,
      53,
      46,
      53, // '25.5'
    ]),
  );
});

// Test basic PUBLISH packet parsing for MQTT v3.1.1
Deno.test('decodePublishPacket', function () {
  assertEquals<PublishPacket>(
    parse(
      0b0000, // packetFlag
      Uint8Array.from([
        // variableHeader
        0, // topicLength MSB
        3, // topicLength LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        // payload
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
      ]),
      12, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1,
    ),
    {
      type: 'publish',
      dup: false,
      qos: 0,
      retain: false,
      packetId: undefined,
      topic: 'a/b',
      payload: Uint8Array.from([
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
      ]),
      properties: undefined,
    },
  );
});

// Test PUBLISH packet parsing with QoS 1 for MQTT v3.1.1
Deno.test('decodePublishPacketWithQoS1', function () {
  assertEquals<PublishPacket>(
    parse(
      0b0010, // packetFlag (QoS 1)
      Uint8Array.from([
        // variableHeader
        0, // topicLength MSB
        3, // topicLength LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        0, // packetId MSB
        42, // packetId LSB
        // payload
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
      ]),
      14, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1,
    ),
    {
      type: 'publish',
      dup: false,
      qos: 1,
      retain: false,
      packetId: 42,
      topic: 'a/b',
      payload: Uint8Array.from([
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
      ]),
      properties: undefined,
    },
  );
});

// Test PUBLISH packet parsing with Topic Alias for MQTT v5
Deno.test('decodePublishPacketMQTT5WithTopicAlias', function () {
  assertEquals<PublishPacket>(
    parse(
      0b0000, // packetFlag
      Uint8Array.from([
        // variableHeader
        0, // topicLength MSB
        3, // topicLength LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        // properties
        3, // properties length
        0x23, // Topic Alias Identifier
        0, // MSB
        5, // LSB (value = 5)
        // payload
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
      ]),
      16, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    {
      type: 'publish',
      dup: false,
      qos: 0,
      retain: false,
      packetId: undefined,
      topic: 'a/b',
      payload: Uint8Array.from([
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
      ]),
      properties: {
        topicAlias: 5,
      },
    },
  );
});

// Test PUBLISH packet parsing with multiple properties for MQTT v5
Deno.test('decodePublishPacketMQTT5WithMultipleProperties', function () {
  assertEquals<PublishPacket>(
    parse(
      0b0011, // packetFlag (QoS 1 + retain)
      Uint8Array.from([
        // variableHeader
        0, // topicLength MSB
        19, // topicLength LSB
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
        0, // packetId MSB
        123, // packetId LSB
        // properties
        52, // properties length
        0x01, // Payload Format Indicator Identifier
        1, // value (1 = UTF-8 encoded data)
        0x02, // Message Expiry Interval Identifier
        0,
        0,
        14,
        16, // value (3600 = 0x0E10)
        0x03, // Content Type Identifier
        0,
        16,
        97,
        112,
        112,
        108,
        105,
        99,
        97,
        116,
        105,
        111,
        110,
        47,
        106,
        115,
        111,
        110, // 'application/json'
        0x23, // Topic Alias Identifier
        0,
        15, // value (15)
        0x26, // User Property Identifier
        0,
        8,
        100,
        101,
        118,
        105,
        99,
        101,
        73,
        100, // 'deviceId'
        0,
        10,
        115,
        101,
        110,
        115,
        111,
        114,
        45,
        49,
        50,
        51, // 'sensor-123'
        // payload
        50,
        53,
        46,
        53, // '25.5'
      ]),
      80, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    {
      type: 'publish',
      dup: false,
      qos: 1,
      retain: true,
      packetId: 123,
      topic: 'sensors/temperature',
      payload: Uint8Array.from([
        50,
        53,
        46,
        53, // '25.5'
      ]),
      properties: {
        payloadFormatIndicator: 1,
        messageExpiryInterval: 3600,
        contentType: 'application/json',
        topicAlias: 15,
        userProperties: [
          { key: 'deviceId', val: 'sensor-123' },
        ],
      },
    },
  );
});

// Test PUBLISH packet parsing with extra bytes (to ensure handling of variable length payload)
Deno.test('decodePublishPacketWithExtraBytes', function () {
  assertEquals<PublishPacket>(
    parse(
      0b0000, // packetFlag
      Uint8Array.from([
        // variableHeader
        0, // topicLength MSB
        3, // topicLength LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        // payload
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
        101, // 'e'
        116, // 't'
        99, // 'c'
      ]),
      15,
      Mqtt.ProtocolVersion.MQTT_V3_1_1,
    ),
    {
      type: 'publish',
      dup: false,
      qos: 0,
      retain: false,
      packetId: undefined,
      topic: 'a/b',
      payload: Uint8Array.from([
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
        101, // 'e'
        116, // 't'
        99, // 'c'
      ]),
      properties: undefined,
    },
  );
});

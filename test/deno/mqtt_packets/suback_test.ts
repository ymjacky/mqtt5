import { assertEquals } from 'std/assert/mod.ts';
import type { SubackPacket } from '../../../lib/mqtt_packets/suback.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/suback.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

// Test basic SUBACK packet encoding for MQTT v3.1.1
Deno.test('encodeSubackPacket', function () {
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
      0, // Success QoS 0
      1, // Success QoS 1
    ]),
  );
});

// Test SUBACK packet encoding with reason codes for MQTT v5
Deno.test('encodeSubackPacketMQTT5WithReasonCodes', function () {
  assertEquals(
    toBytes(
      {
        type: 'suback',
        packetId: 1,
        reasonCodes: [
          Mqtt.ReasonCode.GrantedQoS0,
          Mqtt.ReasonCode.GrantedQoS1,
          Mqtt.ReasonCode.GrantedQoS2,
          Mqtt.ReasonCode.UnspecifiedError,
          Mqtt.ReasonCode.ImplementationSpecificError,
          Mqtt.ReasonCode.NotAuthorized,
          Mqtt.ReasonCode.TopicFilterInvalid,
          Mqtt.ReasonCode.PacketIdentifierInUse,
          Mqtt.ReasonCode.QuotaExceeded,
          Mqtt.ReasonCode.SharedSubscriptionsNotSupported,
          Mqtt.ReasonCode.SubscriptionIdentifiersNotSupported,
          Mqtt.ReasonCode.WildcardSubscriptionsNotSupported,
        ],
        properties: {},
      },
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0x90, // packetType + flags
      15, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // properties
      0, // properties length = 0
      // payload (reason codes)
      0x00, // GrantedQoS0
      0x01, // GrantedQoS1
      0x02, // GrantedQoS2
      0x80, // UnspecifiedError
      0x83, // ImplementationSpecificError
      0x87, // NotAuthorized
      0x8F, // TopicFilterInvalid
      0x91, // PacketIdentifierInUse
      0x97, // QuotaExceeded
      0x9E, // SharedSubscriptionsNotSupported
      0xA1, // SubscriptionIdentifiersNotSupported
      0xA2, // WildcardSubscriptionsNotSupported
    ]),
  );
});

// Test SUBACK packet encoding with reason string property for MQTT v5
Deno.test('encodeSubackPacketMQTT5WithProperties', function () {
  assertEquals(
    toBytes(
      {
        type: 'suback',
        packetId: 1,
        reasonCodes: [Mqtt.ReasonCode.GrantedQoS0, Mqtt.ReasonCode.NotAuthorized],
        properties: {
          reasonString: 'Subscription partially accepted',
          userProperties: [
            { key: 'requestId', val: 'abc123' },
          ],
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0x90, // packetType + flags
      59, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // properties
      54, // properties length
      0x1F, // Reason String Identifier
      0,
      31,
      83,
      117,
      98,
      115,
      99,
      114,
      105,
      112,
      116,
      105,
      111,
      110,
      32,
      112,
      97,
      114,
      116,
      105,
      97,
      108,
      108,
      121,
      32,
      97,
      99,
      99,
      101,
      112,
      116,
      101,
      100, // 'Subscription partially accepted'
      0x26, // User Property Identifier
      0,
      9,
      114,
      101,
      113,
      117,
      101,
      115,
      116,
      73,
      100, // 'requestId'
      0,
      6,
      97,
      98,
      99,
      49,
      50,
      51, // 'abc123'
      // payload (reason codes)
      0x00, // GrantedQoS0
      0x87, // NotAuthorized
    ]),
  );
});

// Test basic SUBACK packet parsing for MQTT v3.1.1
Deno.test('decodeSubackPacket', function () {
  assertEquals<SubackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        1, // id LSB
        // payload
        0, // Success QoS 0
        1, // Success QoS 1
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

// Test SUBACK packet parsing with reason codes for MQTT v5
Deno.test('decodeSubackPacketMQTT5WithReasonCodes', function () {
  assertEquals<SubackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        1, // id LSB
        // properties
        0, // properties length = 0
        // payload (reason codes)
        0x00, // GrantedQoS0
        0x01, // GrantedQoS1
        0x02, // GrantedQoS2
        0x80, // UnspecifiedError
        0x83, // ImplementationSpecificError
        0x87, // NotAuthorized
        0x8F, // TopicFilterInvalid
        0x91, // PacketIdentifierInUse
        0x97, // QuotaExceeded
        0x9E, // SharedSubscriptionsNotSupported
        0xA1, // SubscriptionIdentifiersNotSupported
        0xA2, // WildcardSubscriptionsNotSupported
      ]),
      15, // remainingLength (packetId: 2 bytes + properties length: 1 byte + reasonCodes: 12 bytes = 15 bytes)
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'suback',
      packetId: 1,
      reasonCodes: [
        Mqtt.ReasonCode.GrantedQoS0,
        Mqtt.ReasonCode.GrantedQoS1,
        Mqtt.ReasonCode.GrantedQoS2,
        Mqtt.ReasonCode.UnspecifiedError,
        Mqtt.ReasonCode.ImplementationSpecificError,
        Mqtt.ReasonCode.NotAuthorized,
        Mqtt.ReasonCode.TopicFilterInvalid,
        Mqtt.ReasonCode.PacketIdentifierInUse,
        Mqtt.ReasonCode.QuotaExceeded,
        Mqtt.ReasonCode.SharedSubscriptionsNotSupported,
        Mqtt.ReasonCode.SubscriptionIdentifiersNotSupported,
        Mqtt.ReasonCode.WildcardSubscriptionsNotSupported,
      ],
      properties: {},
    },
  );
});

// Test SUBACK packet parsing with reason string property for MQTT v5
Deno.test('decodeSubackPacketMQTT5WithProperties', function () {
  assertEquals<SubackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        1, // id LSB
        // properties
        54, // properties length
        0x1F, // Reason String Identifier
        0,
        31,
        83,
        117,
        98,
        115,
        99,
        114,
        105,
        112,
        116,
        105,
        111,
        110,
        32,
        112,
        97,
        114,
        116,
        105,
        97,
        108,
        108,
        121,
        32,
        97,
        99,
        99,
        101,
        112,
        116,
        101,
        100, // 'Subscription partially accepted'
        0x26, // User Property Identifier
        0,
        9,
        114,
        101,
        113,
        117,
        101,
        115,
        116,
        73,
        100, // 'requestId'
        0,
        6,
        97,
        98,
        99,
        49,
        50,
        51, // 'abc123'
        // payload (reason codes)
        0x00, // GrantedQoS0
        0x87, // NotAuthorized
      ]),
      59, // remainingLength (packetId: 2 bytes + properties length: 1 byte + properties: 54 bytes + reasonCodes: 2 bytes = 59 bytes)
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'suback',
      packetId: 1,
      reasonCodes: [Mqtt.ReasonCode.GrantedQoS0, Mqtt.ReasonCode.NotAuthorized],
      properties: {
        reasonString: 'Subscription partially accepted',
        userProperties: [
          { key: 'requestId', val: 'abc123' },
        ],
      },
    },
  );
});

import { assertEquals } from 'std/assert/mod.ts';
import type { UnsubackPacket } from '../../../lib/mqtt_packets/unsuback.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/unsuback.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

// Test basic UNSUBACK packet encoding for MQTT v3.1.1
Deno.test('encodeUnsubackPacket', function () {
  assertEquals(
    toBytes(
      {
        type: 'unsuback',
        packetId: 1,
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0xb0, // packetType + flags
      2, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
    ]),
  );
});

// Test UNSUBACK packet encoding with reason codes for MQTT v5
Deno.test('encodeUnsubackPacketMQTT5WithReasonCodes', function () {
  assertEquals(
    toBytes(
      {
        type: 'unsuback',
        packetId: 1,
        reasonCodes: [
          Mqtt.ReasonCode.Success,
          Mqtt.ReasonCode.NoSubscriptionExisted,
          Mqtt.ReasonCode.UnspecifiedError,
          Mqtt.ReasonCode.ImplementationSpecificError,
          Mqtt.ReasonCode.NotAuthorized,
          Mqtt.ReasonCode.TopicFilterInvalid,
          Mqtt.ReasonCode.PacketIdentifierInUse,
        ],
        properties: {},
      },
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0xb0, // packetType + flags
      10, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // properties
      0, // properties length = 0
      // payload (reason codes)
      0x00, // Success
      0x11, // NoSubscriptionExisted
      0x80, // UnspecifiedError
      0x83, // ImplementationSpecificError
      0x87, // NotAuthorized
      0x8F, // TopicFilterInvalid
      0x91, // PacketIdentifierInUse
    ]),
  );
});

// Test UNSUBACK packet encoding with reason string property for MQTT v5
Deno.test('encodeUnsubackPacketMQTT5WithProperties', function () {
  assertEquals(
    toBytes(
      {
        type: 'unsuback',
        packetId: 1,
        reasonCodes: [Mqtt.ReasonCode.Success, Mqtt.ReasonCode.NoSubscriptionExisted],
        properties: {
          reasonString: 'Unsubscribe operation completed',
          userProperties: [
            { key: 'processId', val: '123456' },
          ],
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0xb0, // packetType + flags
      59, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // properties
      54, // properties length
      0x1F, // Reason String Identifier
      0,
      31,
      85,
      110,
      115,
      117,
      98,
      115,
      99,
      114,
      105,
      98,
      101,
      32,
      111,
      112,
      101,
      114,
      97,
      116,
      105,
      111,
      110,
      32,
      99,
      111,
      109,
      112,
      108,
      101,
      116,
      101,
      100, // 'Unsubscribe operation completed'
      0x26, // User Property Identifier
      0,
      9,
      112,
      114,
      111,
      99,
      101,
      115,
      115,
      73,
      100, // 'processId'
      0,
      6,
      49,
      50,
      51,
      52,
      53,
      54, // '123456'
      // payload (reason codes)
      0x00, // Success
      0x11, // NoSubscriptionExisted
    ]),
  );
});

// Test basic UNSUBACK packet parsing for MQTT v3.1.1
Deno.test('decodeUnsubackPacket', function () {
  assertEquals<UnsubackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        1, // id LSB
      ]),
      2, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    {
      type: 'unsuback',
      packetId: 1,
    },
  );
});

// Test UNSUBACK packet parsing with reason codes for MQTT v5
Deno.test('decodeUnsubackPacketMQTT5WithReasonCodes', function () {
  assertEquals<UnsubackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        1, // id LSB
        // properties
        0, // properties length = 0
        // payload (reason codes)
        0x00, // Success
        0x11, // NoSubscriptionExisted
        0x80, // UnspecifiedError
        0x83, // ImplementationSpecificError
        0x87, // NotAuthorized
        0x8F, // TopicFilterInvalid
        0x91, // PacketIdentifierInUse
      ]),
      10, // remainingLength (packetId: 2 bytes + properties length: 1 byte + reasonCodes: 7 bytes = 10 bytes)
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'unsuback',
      reasonCodes: [
        Mqtt.ReasonCode.Success,
        Mqtt.ReasonCode.NoSubscriptionExisted,
        Mqtt.ReasonCode.UnspecifiedError,
        Mqtt.ReasonCode.ImplementationSpecificError,
        Mqtt.ReasonCode.NotAuthorized,
        Mqtt.ReasonCode.TopicFilterInvalid,
        Mqtt.ReasonCode.PacketIdentifierInUse,
      ],
      packetId: 1,
    },
  );
});

// Test UNSUBACK packet parsing with reason string property for MQTT v5
Deno.test('decodeUnsubackPacketMQTT5WithProperties', function () {
  assertEquals<UnsubackPacket>(
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
        85,
        110,
        115,
        117,
        98,
        115,
        99,
        114,
        105,
        98,
        101,
        32,
        111,
        112,
        101,
        114,
        97,
        116,
        105,
        111,
        110,
        32,
        99,
        111,
        109,
        112,
        108,
        101,
        116,
        101,
        100, // 'Unsubscribe operation completed'
        0x26, // User Property Identifier
        0,
        9,
        112,
        114,
        111,
        99,
        101,
        115,
        115,
        73,
        100, // 'processId'
        0,
        6,
        49,
        50,
        51,
        52,
        53,
        54, // '123456'
        // payload (reason codes)
        0x00, // Success
        0x11, // NoSubscriptionExisted
      ]),
      59, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'unsuback',
      packetId: 1,
      reasonCodes: [Mqtt.ReasonCode.Success, Mqtt.ReasonCode.NoSubscriptionExisted],
      properties: {
        reasonString: 'Unsubscribe operation completed',
        userProperties: [
          { key: 'processId', val: '123456' },
        ],
      },
    },
  );
});

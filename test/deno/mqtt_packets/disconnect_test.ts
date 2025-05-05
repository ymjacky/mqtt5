import { assertEquals } from 'std/assert/mod.ts';
import type { DisconnectPacket } from '../../../lib/mqtt_packets/disconnect.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/disconnect.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

// Test basic DISCONNECT packet encoding for MQTT v3.1.1
Deno.test('encodeDisconnectPacket', function () {
  assertEquals(
    toBytes({
      type: 'disconnect',
    }, Mqtt.ProtocolVersion.MQTT_V3_1_1),
    new Uint8Array([
      // fixedHeader
      0xe0, // packetType + flags
      0x00, // remainingLength
    ]),
  );
});

// Test DISCONNECT packet encoding with reason code for MQTT v5
Deno.test('encodeDisconnectPacketMQTT5WithReasonCode', function () {
  assertEquals(
    toBytes({
      type: 'disconnect',
      reasonCode: Mqtt.ReasonCode.ServerBusy,
    }, Mqtt.ProtocolVersion.MQTT_V5),
    new Uint8Array([
      // fixedHeader
      0xe0, // packetType + flags
      0x01, // remainingLength
      // variableHeader
      0x89, // reasonCode = ServerBusy (137)
    ]),
  );
});

// Test DISCONNECT packet encoding with Success reason code (default) for MQTT v5
Deno.test('encodeDisconnectPacketMQTT5WithSuccessReasonCode', function () {
  assertEquals(
    toBytes({
      type: 'disconnect',
      reasonCode: Mqtt.ReasonCode.Success,
    }, Mqtt.ProtocolVersion.MQTT_V5),
    new Uint8Array([
      // fixedHeader
      0xe0, // packetType + flags
      0x00, // remainingLength
      // No reasonCode for Success without properties
    ]),
  );
});

// Test DISCONNECT packet encoding with properties for MQTT v5
Deno.test('encodeDisconnectPacketMQTT5WithProperties', function () {
  assertEquals(
    toBytes({
      type: 'disconnect',
      reasonCode: Mqtt.ReasonCode.ServerBusy,
      properties: {
        sessionExpiryInterval: 3600,
        reasonString: 'Server too busy, please try again later',
        userProperties: [
          { key: 'diagnostic', val: 'high-load' },
        ],
      },
    }, Mqtt.ProtocolVersion.MQTT_V5),
    new Uint8Array([
      // fixedHeader
      0xe0, // packetType + flags
      0x49, // remainingLength (73)
      // variableHeader
      0x89, // reasonCode = ServerBusy (137)
      // properties
      0x47, // properties length (71)
      0x11, // Session Expiry Interval Identifier
      0x00,
      0x00,
      0x0e,
      0x10, // 3600 (Session Expiry Interval value)
      0x1f, // Reason String Identifier
      0x00,
      0x27,
      0x53,
      0x65,
      0x72,
      0x76,
      0x65,
      0x72,
      0x20,
      0x74,
      0x6f,
      0x6f,
      0x20,
      0x62,
      0x75,
      0x73,
      0x79,
      0x2c,
      0x20,
      0x70,
      0x6c,
      0x65,
      0x61,
      0x73,
      0x65,
      0x20,
      0x74,
      0x72,
      0x79,
      0x20,
      0x61,
      0x67,
      0x61,
      0x69,
      0x6e,
      0x20,
      0x6c,
      0x61,
      0x74,
      0x65,
      0x72, // 'Server too busy, please try again later'
      0x26, // User Property Identifier
      0x00,
      0x0a,
      0x64,
      0x69,
      0x61,
      0x67,
      0x6e,
      0x6f,
      0x73,
      0x74,
      0x69,
      0x63, // 'diagnostic'
      0x00,
      0x09,
      0x68,
      0x69,
      0x67,
      0x68,
      0x2d,
      0x6c,
      0x6f,
      0x61,
      0x64, // 'high-load'
    ]),
  );
});

// Test DISCONNECT packet encoding with server reference property for MQTT v5
Deno.test('encodeDisconnectPacketMQTT5WithServerReference', function () {
  assertEquals(
    toBytes({
      type: 'disconnect',
      reasonCode: Mqtt.ReasonCode.ServerMoved,
      properties: {
        serverReference: 'server2.example.com',
      },
    }, Mqtt.ProtocolVersion.MQTT_V5),
    new Uint8Array([
      // fixedHeader
      0xe0, // packetType + flags
      0x18, // remainingLength (24)
      // variableHeader
      0x9d, // reasonCode = ServerMoved (157)
      // properties
      0x16, // properties length (22)
      0x1c, // Server Reference Identifier
      0x00,
      0x13,
      0x73,
      0x65,
      0x72,
      0x76,
      0x65,
      0x72,
      0x32,
      0x2e,
      0x65,
      0x78,
      0x61,
      0x6d,
      0x70,
      0x6c,
      0x65,
      0x2e,
      0x63,
      0x6f,
      0x6d, // 'server2.example.com'
    ]),
  );
});

// Test DISCONNECT packet encoding with empty properties for MQTT v5
Deno.test('encodeDisconnectPacketMQTT5WithEmptyProperties', function () {
  assertEquals(
    toBytes({
      type: 'disconnect',
      reasonCode: Mqtt.ReasonCode.NormalDisconnection,
      properties: {},
    }, Mqtt.ProtocolVersion.MQTT_V5),
    new Uint8Array([
      // fixedHeader
      0xe0, // packetType + flags
      0x02, // remainingLength
      // variableHeader
      0x00, // reasonCode = NormalDisconnection (0)
      0x00, // properties length = 0
    ]),
  );
});

// Test basic DISCONNECT packet parsing for MQTT v3.1.1
Deno.test('decodeDisconnectPacket', function () {
  assertEquals<DisconnectPacket>(
    parse(
      new Uint8Array([
        // Empty buffer for v3.1.1
      ]),
      0, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    {
      type: 'disconnect',
    },
  );
});

// Test DISCONNECT packet parsing with reason code for MQTT v5
Deno.test('decodeDisconnectPacketMQTT5WithReasonCode', function () {
  assertEquals<DisconnectPacket>(
    parse(
      new Uint8Array([
        0x89, // reasonCode = ServerBusy (137)
      ]),
      1, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'disconnect',
      reasonCode: Mqtt.ReasonCode.ServerBusy,
    },
  );
});

// Test DISCONNECT packet parsing with properties for MQTT v5
Deno.test('decodeDisconnectPacketMQTT5WithProperties', function () {
  assertEquals<DisconnectPacket>(
    parse(
      new Uint8Array([
        0x89, // reasonCode = ServerBusy (137)
        // properties
        0x47, // properties length (71)
        0x11, // Session Expiry Interval Identifier
        0x00,
        0x00,
        0x0e,
        0x10, // 3600 (Session Expiry Interval value)
        0x1f, // Reason String Identifier
        0x00,
        0x27,
        0x53,
        0x65,
        0x72,
        0x76,
        0x65,
        0x72,
        0x20,
        0x74,
        0x6f,
        0x6f,
        0x20,
        0x62,
        0x75,
        0x73,
        0x79,
        0x2c,
        0x20,
        0x70,
        0x6c,
        0x65,
        0x61,
        0x73,
        0x65,
        0x20,
        0x74,
        0x72,
        0x79,
        0x20,
        0x61,
        0x67,
        0x61,
        0x69,
        0x6e,
        0x20,
        0x6c,
        0x61,
        0x74,
        0x65,
        0x72, // 'Server too busy, please try again later'
        0x26, // User Property Identifier
        0x00,
        0x0a,
        0x64,
        0x69,
        0x61,
        0x67,
        0x6e,
        0x6f,
        0x73,
        0x74,
        0x69,
        0x63, // 'diagnostic'
        0x00,
        0x09,
        0x68,
        0x69,
        0x67,
        0x68,
        0x2d,
        0x6c,
        0x6f,
        0x61,
        0x64, // 'high-load'
      ]),
      72, // remainingLength (1 + 71)
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'disconnect',
      reasonCode: Mqtt.ReasonCode.ServerBusy,
      properties: {
        sessionExpiryInterval: 3600,
        reasonString: 'Server too busy, please try again later',
        userProperties: [
          { key: 'diagnostic', val: 'high-load' },
        ],
      },
    },
  );
});

// Test DISCONNECT packet parsing with server reference property for MQTT v5
Deno.test('decodeDisconnectPacketMQTT5WithServerReference', function () {
  assertEquals<DisconnectPacket>(
    parse(
      new Uint8Array([
        0x9d, // reasonCode = ServerMoved (157)
        // properties
        0x16, // properties length (22)
        0x1c, // Server Reference Identifier
        0x00,
        0x13,
        0x73,
        0x65,
        0x72,
        0x76,
        0x65,
        0x72,
        0x32,
        0x2e,
        0x65,
        0x78,
        0x61,
        0x6d,
        0x70,
        0x6c,
        0x65,
        0x2e,
        0x63,
        0x6f,
        0x6d, // 'server2.example.com'
      ]),
      23, // remainingLength (1 + 22)
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'disconnect',
      reasonCode: Mqtt.ReasonCode.ServerMoved,
      properties: {
        serverReference: 'server2.example.com',
      },
    },
  );
});

// Test DISCONNECT packet parsing with empty properties for MQTT v5
Deno.test('decodeDisconnectPacketMQTT5WithEmptyProperties', function () {
  assertEquals<DisconnectPacket>(
    parse(
      new Uint8Array([
        0x00, // reasonCode = NormalDisconnection (0)
        0x00, // properties length = 0
      ]),
      2, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'disconnect',
      reasonCode: Mqtt.ReasonCode.Success,
    },
  );
});

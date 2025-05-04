// filepath: /Users/jacky/develop/deno/mqtt5/test/deno/mqtt_packets/auth_test.ts
import { assertEquals } from 'std/assert/mod.ts';
import type { AuthPacket } from '../../../lib/mqtt_packets/auth.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/auth.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

// Test basic Auth packet encoding (no reason code, no properties)
Deno.test('encodeAuthPacketBasic', function () {
  assertEquals(
    toBytes(
      {
        type: 'auth',
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0xf0, // packetType + flags
      0x00, // remainingLength (no payload)
    ]),
  );
});

// Test Auth packet encoding with success reason code
Deno.test('encodeAuthPacketWithReasonCode', function () {
  assertEquals(
    toBytes(
      {
        type: 'auth',
        reasonCode: Mqtt.ReasonCode.Success,
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0xf0, // packetType + flags
      0x00, // remainingLength
      // variableHeader
      // No variableHeader because Success (0x00) without properties doesn't add reasonCode
    ]),
  );
});

// Test Auth packet encoding with "continue authentication" reason code
Deno.test('encodeAuthPacketWithContinueAuth', function () {
  assertEquals(
    toBytes(
      {
        type: 'auth',
        reasonCode: Mqtt.ReasonCode.ContinueAuthentication,
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0xf0, // packetType + flags
      0x01, // remainingLength
      // variableHeader
      0x18, // reasonCode = ContinueAuthentication (24)
    ]),
  );
});

// Test Auth packet encoding with properties
Deno.test('encodeAuthPacketWithProperties', function () {
  assertEquals(
    toBytes(
      {
        type: 'auth',
        reasonCode: Mqtt.ReasonCode.ReAuthenticate,
        properties: {
          authenticationMethod: 'SCRAM-SHA-1',
          reasonString: 'Re-authentication required',
          userProperties: [
            { key: 'key1', val: 'value1' },
            { key: 'key2', val: 'value2' },
          ],
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0xf0, // packetType + flags
      0x4b, // remainingLength (75)
      // variableHeader
      0x19, // reasonCode = ReAuthenticate (25)
      // properties
      0x49, // properties length (73)
      0x15, // Auth Method Identifier
      0x00,
      0x0b,
      0x53,
      0x43,
      0x52,
      0x41,
      0x4d,
      0x2d,
      0x53,
      0x48,
      0x41,
      0x2d,
      0x31, // 'SCRAM-SHA-1'
      0x1f, // Reason String Identifier
      0x00,
      0x1a,
      0x52,
      0x65,
      0x2d,
      0x61,
      0x75,
      0x74,
      0x68,
      0x65,
      0x6e,
      0x74,
      0x69,
      0x63,
      0x61,
      0x74,
      0x69,
      0x6f,
      0x6e,
      0x20,
      0x72,
      0x65,
      0x71,
      0x75,
      0x69,
      0x72,
      0x65,
      0x64, // 'Re-authentication required'
      0x26, // User Property Identifier
      0x00,
      0x04,
      0x6b,
      0x65,
      0x79,
      0x31, // 'key1'
      0x00,
      0x06,
      0x76,
      0x61,
      0x6c,
      0x75,
      0x65,
      0x31, // 'value1'
      0x26, // User Property Identifier
      0x00,
      0x04,
      0x6b,
      0x65,
      0x79,
      0x32, // 'key2'
      0x00,
      0x06,
      0x76,
      0x61,
      0x6c,
      0x75,
      0x65,
      0x32, // 'value2'
    ]),
  );
});

// Test Auth packet encoding with authenticationData property
Deno.test('encodeAuthPacketWithAuthData', function () {
  assertEquals(
    toBytes(
      {
        type: 'auth',
        reasonCode: Mqtt.ReasonCode.ContinueAuthentication,
        properties: {
          authenticationMethod: 'SCRAM-SHA-1',
          authenticationData: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0xf0, // packetType + flags
      0x17, // remainingLength (23)
      // variableHeader
      0x18, // reasonCode = ContinueAuthentication (24)
      // properties
      0x15, // properties length (21)
      0x15, // Auth Method Identifier
      0x00,
      0x0b,
      0x53,
      0x43,
      0x52,
      0x41,
      0x4d,
      0x2d,
      0x53,
      0x48,
      0x41,
      0x2d,
      0x31, // 'SCRAM-SHA-1'
      0x16, // Auth Data Identifier
      0x00,
      0x04, // Data length 4
      0x01,
      0x02,
      0x03,
      0x04, // Auth data bytes
    ]),
  );
});

// Test basic Auth packet parsing (no reason code, no properties)
Deno.test('decodeAuthPacketBasic', function () {
  assertEquals<AuthPacket>(
    parse(
      new Uint8Array([]), // empty buffer for no variable header
      0, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    {
      type: 'auth',
      reasonCode: Mqtt.ReasonCode.Success,
    },
  );
});

// Test Auth packet parsing with reason code only
Deno.test('decodeAuthPacketWithReasonCode', function () {
  assertEquals<AuthPacket>(
    parse(
      new Uint8Array([
        0x18, // reasonCode = ContinueAuthentication (24)
      ]),
      1, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    {
      type: 'auth',
      reasonCode: Mqtt.ReasonCode.ContinueAuthentication,
    },
  );
});

// Test Auth packet parsing with properties
Deno.test('decodeAuthPacketWithProperties', function () {
  assertEquals<AuthPacket>(
    parse(
      new Uint8Array([
        0x19, // reasonCode = ReAuthenticate (25)
        // properties
        0x49, // properties length (73)
        0x15, // Auth Method Identifier
        0x00,
        0x0b,
        0x53,
        0x43,
        0x52,
        0x41,
        0x4d,
        0x2d,
        0x53,
        0x48,
        0x41,
        0x2d,
        0x31, // 'SCRAM-SHA-1'
        0x1f, // Reason String Identifier
        0x00,
        0x1a,
        0x52,
        0x65,
        0x2d,
        0x61,
        0x75,
        0x74,
        0x68,
        0x65,
        0x6e,
        0x74,
        0x69,
        0x63,
        0x61,
        0x74,
        0x69,
        0x6f,
        0x6e,
        0x20,
        0x72,
        0x65,
        0x71,
        0x75,
        0x69,
        0x72,
        0x65,
        0x64, // 'Re-authentication required'
        0x26, // User Property Identifier
        0x00,
        0x04,
        0x6b,
        0x65,
        0x79,
        0x31, // 'key1'
        0x00,
        0x06,
        0x76,
        0x61,
        0x6c,
        0x75,
        0x65,
        0x31, // 'value1'
        0x26, // User Property Identifier
        0x00,
        0x04,
        0x6b,
        0x65,
        0x79,
        0x32, // 'key2'
        0x00,
        0x06,
        0x76,
        0x61,
        0x6c,
        0x75,
        0x65,
        0x32, // 'value2'
      ]),
      74, // remainingLength (1 + 73)
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    {
      type: 'auth',
      reasonCode: Mqtt.ReasonCode.ReAuthenticate,
      properties: {
        authenticationMethod: 'SCRAM-SHA-1',
        reasonString: 'Re-authentication required',
        userProperties: [
          { key: 'key1', val: 'value1' },
          { key: 'key2', val: 'value2' },
        ],
      },
    },
  );
});

// Test Auth packet parsing with authenticationData property
Deno.test('decodeAuthPacketWithAuthData', function () {
  assertEquals<AuthPacket>(
    parse(
      new Uint8Array([
        0x18, // reasonCode = ContinueAuthentication (24)
        // properties
        0x15, // properties length (21)
        0x15, // Auth Method Identifier
        0x00,
        0x0b,
        0x53,
        0x43,
        0x52,
        0x41,
        0x4d,
        0x2d,
        0x53,
        0x48,
        0x41,
        0x2d,
        0x31, // 'SCRAM-SHA-1'
        0x16, // Auth Data Identifier
        0x00,
        0x04, // Data length 4
        0x01,
        0x02,
        0x03,
        0x04, // Auth data bytes
      ]),
      23, // remainingLength (1 + 22)
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    {
      type: 'auth',
      reasonCode: Mqtt.ReasonCode.ContinueAuthentication,
      properties: {
        authenticationMethod: 'SCRAM-SHA-1',
        authenticationData: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
      },
    },
  );
});

// Test Auth packet encoding with Success reason code and empty properties
Deno.test('encodeAuthPacketWithEmptyProperties', function () {
  assertEquals(
    toBytes(
      {
        type: 'auth',
        reasonCode: Mqtt.ReasonCode.Success,
        properties: {},
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0xf0, // packetType + flags
      0x02, // remainingLength
      // variableHeader
      0x00, // reasonCode = Success
      0x00, // properties length = 0
    ]),
  );
});

// Test Auth packet parsing with Success reason code and empty properties
Deno.test('decodeAuthPacketWithEmptyProperties', function () {
  assertEquals<AuthPacket>(
    parse(
      new Uint8Array([
        0x00, // reasonCode = Success
        0x00, // properties length = 0
      ]),
      2, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    {
      type: 'auth',
      reasonCode: Mqtt.ReasonCode.Success,
      properties: {},
    },
  );
});

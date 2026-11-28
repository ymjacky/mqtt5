// filepath: /Users/jacky/develop/deno/mqtt5/test/deno/mqtt_packets/auth_test.ts
import { assertEquals, assertInstanceOf, assertThrows } from '@std/assert';
import { MqttUtilsError } from '../../../lib/mqtt_utils/mod.ts';
import { MqttPacketsError, packetToBytes } from '../../../lib/mqtt_packets/mod.ts';
import type { AuthPacket } from '../../../lib/mqtt_packets/packet_types.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/auth.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

/** The Authentication Method 'M', which every AUTH carries (MQTT 5.0 3.15.2.2.2). */
const methodM = [0x15, 0x00, 0x01, 0x4D];

// As AUTH always has a property, the Reason Code and the Property Length are always written: they can be omitted only
// without properties (MQTT 5.0 3.15.2.1).
Deno.test('encodeAuthPacketWithTheAuthenticationMethodOnly', function () {
  const cases: [AuthPacket, number][] = [
    // 0x00 (Success) is used if the Reason Code is omitted.
    [{ type: 'auth', properties: { authenticationMethod: 'M' } }, 0x00],
    [{ type: 'auth', reasonCode: Mqtt.ReasonCode.Success, properties: { authenticationMethod: 'M' } }, 0x00],
    [{ type: 'auth', reasonCode: Mqtt.ReasonCode.ContinueAuthentication, properties: { authenticationMethod: 'M' } }, 0x18],
    [{ type: 'auth', reasonCode: Mqtt.ReasonCode.ReAuthenticate, properties: { authenticationMethod: 'M' } }, 0x19],
  ];
  for (const [packet, reasonCode] of cases) {
    assertEquals(
      toBytes(packet, Mqtt.ProtocolVersion.MqttV5),
      new Uint8Array([0xF0, 0x06, reasonCode, 0x04, ...methodM]),
      JSON.stringify(packet),
    );
  }
  // An empty string is a valid UTF-8 Encoded String.
  assertEquals(
    toBytes({ type: 'auth', reasonCode: Mqtt.ReasonCode.ContinueAuthentication, properties: { authenticationMethod: '' } }, Mqtt.ProtocolVersion.MqttV5),
    new Uint8Array([0xF0, 0x05, 0x18, 0x03, 0x15, 0x00, 0x00]),
  );
});

Deno.test('encodeAuthPacketWithoutAnAuthenticationMethod', function () {
  // The receiver, a client or a server, would take it as a Protocol Error (MQTT 5.0 3.15.2.2.2). The first two were written as
  // F0 00, and the third as F0 01 18, a Malformed Packet.
  const cases: AuthPacket[] = [
    { type: 'auth' },
    { type: 'auth', reasonCode: Mqtt.ReasonCode.Success },
    { type: 'auth', reasonCode: Mqtt.ReasonCode.ContinueAuthentication },
    { type: 'auth', reasonCode: Mqtt.ReasonCode.ReAuthenticate, properties: {} },
    {
      type: 'auth',
      reasonCode: Mqtt.ReasonCode.ContinueAuthentication,
      properties: { authenticationData: new Uint8Array([0x01]), reasonString: 'r', userProperties: [{ key: 'k', val: 'v' }] },
    },
    { type: 'auth', reasonCode: Mqtt.ReasonCode.ContinueAuthentication, properties: { authenticationMethod: undefined } },
  ];
  for (const packet of cases) {
    const name = JSON.stringify(packet);
    assertThrows(
      () => toBytes(packet, Mqtt.ProtocolVersion.MqttV5),
      MqttPacketsError.MissingPropertyError,
      'missing property: AUTH must carry an authenticationMethod (MQTT 5.0 3.15.2.2.2)',
      name,
    );
    const error = assertThrows(() => packetToBytes(packet, Mqtt.ProtocolVersion.MqttV5), MqttPacketsError.MqttPacketSerializeError, undefined, name);
    assertInstanceOf(error.cause, MqttPacketsError.MissingPropertyError, name);
  }
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
      Mqtt.ProtocolVersion.MqttV5,
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
      Mqtt.ProtocolVersion.MqttV5,
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

Deno.test('decodeAuthPacketWithTheAuthenticationMethodOnly', function () {
  assertEquals<AuthPacket>(parse(new Uint8Array([0x18, 0x04, ...methodM]), 6, Mqtt.ProtocolVersion.MqttV5), {
    type: 'auth',
    reasonCode: Mqtt.ReasonCode.ContinueAuthentication,
    properties: { authenticationMethod: 'M' },
  });
  assertEquals<AuthPacket>(parse(new Uint8Array([0x00, 0x03, 0x15, 0x00, 0x00]), 5, Mqtt.ProtocolVersion.MqttV5), {
    type: 'auth',
    reasonCode: Mqtt.ReasonCode.Success,
    properties: { authenticationMethod: '' },
  });
});

Deno.test('decodeAuthPacketWithoutAnAuthenticationMethod', function () {
  // A Protocol Error (MQTT 5.0 3.15.2.2.2), for which the receiver sends DISCONNECT with 0x82. So is an AUTH with a Remaining
  // Length of 0, which 3.15.2.1 allows for the Reason Code 0x00 (Success) without properties: it has no Authentication Method.
  const cases: [string, number[], string][] = [
    ['a Remaining Length of 0', [], 'protocol error: AUTH must carry the Authentication Method (it has a Remaining Length of 0)'],
    ['0x00 with a Property Length of 0', [0x00, 0x00], 'protocol error: AUTH must carry the Authentication Method'],
    ['0x18 with a Property Length of 0', [0x18, 0x00], 'protocol error: AUTH must carry the Authentication Method'],
    ['0x19 with the Authentication Data only', [0x19, 0x03, 0x16, 0x00, 0x00], 'protocol error: AUTH must carry the Authentication Method'],
    ['0x18 with a Reason String only', [0x18, 0x04, 0x1F, 0x00, 0x01, 0x72], 'protocol error: AUTH must carry the Authentication Method'],
  ];
  for (const [name, bytes, message] of cases) {
    assertThrows(() => parse(new Uint8Array(bytes), bytes.length, Mqtt.ProtocolVersion.MqttV5), MqttUtilsError.ProtocolViolationError, message, name);
  }
});

// Unlike DISCONNECT, AUTH can omit the Property Length only together with the Reason Code (Remaining Length 0,
// MQTT 5.0 3.15.2.1): a Reason Code without a Property Length is a Malformed Packet, which is found before the missing
// Authentication Method.
Deno.test('decodeAuthPacketWithReasonCodeAndNoPropertyLength', function () {
  assertThrows(
    () => parse(new Uint8Array([0x18]), 1, Mqtt.ProtocolVersion.MqttV5),
    MqttUtilsError.MalformedDataError,
    '1 bytes are needed at byte 1, but only 0 are left',
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
      75, // remainingLength (1 + 1 + 73)
      Mqtt.ProtocolVersion.MqttV5,
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
      Mqtt.ProtocolVersion.MqttV5,
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

// MQTT 3.1.1 has no AUTH: its packet type 15 is Reserved (MQTT 3.1.1 2.2.1).
Deno.test('AUTH cannot be encoded with MQTT 3.1.1', function () {
  assertThrows(
    () => toBytes({ type: 'auth', properties: { authenticationMethod: 'M' } }, Mqtt.ProtocolVersion.MqttV3_1_1),
    MqttPacketsError.UnsupportedPacketError,
    'unsupported packet: AUTH (packet type 15 is Reserved in MQTT 3.1.1)',
  );
});

Deno.test('AUTH cannot be decoded with MQTT 3.1.1', function () {
  assertThrows(
    () => parse(new Uint8Array([]), 0, Mqtt.ProtocolVersion.MqttV3_1_1),
    MqttPacketsError.UnsupportedPacketError,
    'unsupported packet: AUTH (packet type 15 is Reserved in MQTT 3.1.1)',
  );
});

Deno.test('packetToBytes throws for AUTH with MQTT 3.1.1, and encodes it with MQTT 5.0', function () {
  const packet: AuthPacket = { type: 'auth', properties: { authenticationMethod: 'M' } };
  const error = assertThrows(() => packetToBytes(packet, Mqtt.ProtocolVersion.MqttV3_1_1), MqttPacketsError.MqttPacketSerializeError);
  assertInstanceOf(error.cause, MqttPacketsError.UnsupportedPacketError);
  assertEquals(packetToBytes(packet, Mqtt.ProtocolVersion.MqttV5), new Uint8Array([0xF0, 0x06, 0x00, 0x04, ...methodM]));
});

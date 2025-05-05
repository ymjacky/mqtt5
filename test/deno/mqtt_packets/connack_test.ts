import { assertEquals, assertThrows } from 'std/assert/mod.ts';

import type { ConnackPacket } from '../../../lib/mqtt_packets/connack.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/connack.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodeConnackPacket', function () {
  assertEquals(
    toBytes(
      {
        type: 'connack',
        sessionPresent: false,
        returnCode: 0,
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      // 32, // packetType + flags
      (0b0010 << 4) + 0b0000,
      2, // remainingLength
      // variableHeader
      0, // connack flags
      0, // return code
    ]),
  );
});

Deno.test('decodeConnackPacket', function () {
  assertEquals<ConnackPacket>(
    parse(
      Uint8Array.from(
        [
          // variableHeader
          0, // connack flags
          0, // return code
        ],
      ),
      2, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    {
      type: 'connack',
      sessionPresent: false,
      returnCode: 0,
    },
  );
});

Deno.test(
  'enodeConnackPacketWithSessionPresent',
  function () {
    assertEquals(
      toBytes({
        type: 'connack',
        sessionPresent: true,
        returnCode: 0,
      }, 4 // ProtocolVersion
      ),
      new Uint8Array([
        // fixedHeader
        32, // packetType + flags
        2, // remainingLength
        // variableHeader
        1, // connack flags (sessionPresent)
        0, // return code
      ]),
    );
  },
);

Deno.test(
  'decodeConnackPacketWithSessionPresent',
  function () {
    assertEquals<ConnackPacket>(
      parse(
        Uint8Array.from([
          // variableHeader
          1, // connack flags (sessionPresent)
          0, // return code
        ]),
        2, // remainingLength
        Mqtt.ProtocolVersion.MQTT_V3_1_1,
      ),
      {
        type: 'connack',
        sessionPresent: true,
        returnCode: 0,
      },
    );
  },
);

Deno.test(
  'decodeConnackPacketWithReturnCode',
  function () {
    assertEquals<ConnackPacket>(
      parse(
        Uint8Array.from([
          // variableHeader
          0, // connack flags
          4, // return code (bad username or password)
        ]),
        2, // remainingLength
        Mqtt.ProtocolVersion.MQTT_V3_1_1,
      ),
      {
        type: 'connack',
        sessionPresent: false,
        returnCode: 4,
      },
    );
  },
);

Deno.test('decodeShortConnackPackets', function () {
  assertThrows(() => parse(Uint8Array.from([32, 2]), 0, Mqtt.ProtocolVersion.MQTT_V3_1_1));
  assertThrows(() => parse(Uint8Array.from([32, 2, 0]), 1, Mqtt.ProtocolVersion.MQTT_V3_1_1));
});

// Test encoding a CONNACK packet with MQTT v5
Deno.test('encodeConnackPacketMQTT5', function () {
  assertEquals(
    toBytes(
      {
        type: 'connack',
        sessionPresent: false,
        reasonCode: 0, // Success
        properties: {
          sessionExpiryInterval: 3600,
          receiveMaximum: 100,
          maximumQoS: 1,
          retainAvailable: true,
          maximumPacketSize: 1024,
          assignedClientIdentifier: 'mqtt-client-123',
          topicAliasMaximum: 10,
          reasonString: 'Success',
          userProperties: [
            { key: 'key1', val: 'value1' },
            { key: 'key2', val: 'value2' },
          ],
          wildcardSubscriptionAvailable: true,
          subscriptionIdentifiersAvailable: true,
          sharedSubscriptionAvailable: true,
          serverKeepAlive: 60,
          responseInformation: 'response-info',
          serverReference: 'server-ref',
          authenticationMethod: 'oauth2',
          authenticationData: new Uint8Array([1, 2, 3, 4]),
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      32, // packetType + flags (value is 0b0010 << 4 = 32)
      136, // remainingLength (variable byte integer)
      1, // remainingLength continued
      // variableHeader
      0, // session present flag
      0, // reason code (success)
      // properties length
      132, // properties length (variable byte integer)
      1, // properties length continued
      // properties (in ID order)
      0x11, // Session Expiry Interval Identifier (17)
      0,
      0,
      14,
      16, // 3600 (session expiry interval value)
      0x12, // Assigned Client Identifier Identifier (18)
      0,
      15, // length of client id string
      0x6D,
      0x71,
      0x74,
      0x74,
      0x2D,
      0x63,
      0x6C,
      0x69,
      0x65,
      0x6E,
      0x74,
      0x2D,
      0x31,
      0x32,
      0x33, // "mqtt-client-123"
      0x13, // Server Keep Alive Identifier (19)
      0,
      60, // 60 (server keep alive value)
      0x15, // Authentication Method Identifier (21)
      0,
      6, // length of authentication method
      0x6F,
      0x61,
      0x75,
      0x74,
      0x68,
      0x32, // "oauth2"
      0x16, // Authentication Data Identifier (22)
      0,
      4, // length of authentication data
      0x01,
      0x02,
      0x03,
      0x04, // authentication data bytes
      0x1A, // Response Information Identifier (26)
      0,
      13, // length of response information
      0x72,
      0x65,
      0x73,
      0x70,
      0x6F,
      0x6E,
      0x73,
      0x65,
      0x2D,
      0x69,
      0x6E,
      0x66,
      0x6F, // "response-info"
      0x1C, // Server Reference Identifier (28)
      0,
      10, // length of server reference
      0x73,
      0x65,
      0x72,
      0x76,
      0x65,
      0x72,
      0x2D,
      0x72,
      0x65,
      0x66, // "server-ref"
      0x1F, // Reason String Identifier (31)
      0,
      7, // length of reason string
      0x53,
      0x75,
      0x63,
      0x63,
      0x65,
      0x73,
      0x73, // "Success"
      0x21, // Receive Maximum Identifier (33)
      0,
      100, // 100 (receive maximum value)
      0x22, // Topic Alias Maximum Identifier (34)
      0,
      10, // 10 (topic alias maximum value)
      0x24, // Maximum QoS Identifier (36)
      0x01, // 1 (maximum QoS value)
      0x25, // Retain Available Identifier (37)
      0x01, // true (retain available value)
      0x26, // User Property Identifier (38)
      0,
      4, // length of property key
      0x6B,
      0x65,
      0x79,
      0x31, // "key1"
      0,
      6, // length of property value
      0x76,
      0x61,
      0x6C,
      0x75,
      0x65,
      0x31, // "value1"
      0x26, // User Property Identifier (38)
      0,
      4, // length of property key
      0x6B,
      0x65,
      0x79,
      0x32, // "key2"
      0,
      6, // length of property value
      0x76,
      0x61,
      0x6C,
      0x75,
      0x65,
      0x32, // "value2"
      0x27, // Maximum Packet Size Identifier (39)
      0,
      0,
      4,
      0, // 1024 (maximum packet size value)
      0x28, // Wildcard Subscription Available Identifier (40)
      0x01, // true (wildcard subscription available value)
      0x29, // Subscription Identifier Available Identifier (41)
      0x01, // true (subscription identifier available value)
      0x2A, // Shared Subscription Available Identifier (42)
      0x01, // true (shared subscription available value)
    ]),
  );
});

// Test encoding a CONNACK packet with MQTT v5 with no properties
Deno.test('encodeConnackPacketMQTT5NoProperties', function () {
  assertEquals(
    toBytes(
      {
        type: 'connack',
        sessionPresent: true,
        reasonCode: 0, // Success
      },
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      (0b0010 << 4) + 0b0000, // packetType + flags
      3, // remainingLength
      // variableHeader
      1, // session present flag
      0, // reason code (success)
      0, // properties length (0 = no properties)
    ]),
  );
});

// Test decoding a CONNACK packet with MQTT v5
Deno.test('decodeConnackPacketMQTT5Dynamic', function () {
  const packet = Uint8Array.from([
    // variableHeader
    0, // session present flag
    0, // reason code (success)
    // properties
    132, // properties length (corrected length)
    1, // properties length continued
    0x11, // Session Expiry Interval Identifier (17)
    0,
    0,
    14,
    16, // 3600 (session expiry interval value)
    0x12, // Assigned Client Identifier Identifier (18)
    0,
    15, // length of client id string
    0x6D,
    0x71,
    0x74,
    0x74,
    0x2D,
    0x63,
    0x6C,
    0x69,
    0x65,
    0x6E,
    0x74,
    0x2D,
    0x31,
    0x32,
    0x33, // "mqtt-client-123"
    0x13, // Server Keep Alive Identifier (19)
    0,
    60, // 60 (server keep alive value)
    0x15, // Authentication Method Identifier (21)
    0,
    6, // length of authentication method
    0x6F,
    0x61,
    0x75,
    0x74,
    0x68,
    0x32, // "oauth2"
    0x16, // Authentication Data Identifier (22)
    0,
    4, // length of authentication data
    0x01,
    0x02,
    0x03,
    0x04, // authentication data bytes
    0x1A, // Response Information Identifier (26)
    0,
    13, // length of response information
    0x72,
    0x65,
    0x73,
    0x70,
    0x6F,
    0x6E,
    0x73,
    0x65,
    0x2D,
    0x69,
    0x6E,
    0x66,
    0x6F, // "response-info"
    0x1C, // Server Reference Identifier (28)
    0,
    10, // length of server reference
    0x73,
    0x65,
    0x72,
    0x76,
    0x65,
    0x72,
    0x2D,
    0x72,
    0x65,
    0x66, // "server-ref"
    0x1F, // Reason String Identifier (31)
    0,
    7, // length of reason string
    0x53,
    0x75,
    0x63,
    0x63,
    0x65,
    0x73,
    0x73, // "Success"
    0x21, // Receive Maximum Identifier (33)
    0,
    100, // 100 (receive maximum value)
    0x22, // Topic Alias Maximum Identifier (34)
    0,
    10, // 10 (topic alias maximum value)
    0x24, // Maximum QoS Identifier (36)
    0x01, // 1 (maximum QoS value)
    0x25, // Retain Available Identifier (37)
    0x01, // true (retain available value)
    0x26, // User Property Identifier (38)
    0,
    4, // length of property key
    0x6B,
    0x65,
    0x79,
    0x31, // "key1"
    0,
    6, // length of property value
    0x76,
    0x61,
    0x6C,
    0x75,
    0x65,
    0x31, // "value1"
    0x26, // User Property Identifier (38)
    0,
    4, // length of property key
    0x6B,
    0x65,
    0x79,
    0x32, // "key2"
    0,
    6, // length of property value
    0x76,
    0x61,
    0x6C,
    0x75,
    0x65,
    0x32, // "value2"
    0x27, // Maximum Packet Size Identifier (39)
    0,
    0,
    4,
    0, // 1024 (maximum packet size value)
    0x28, // Wildcard Subscription Available Identifier (40)
    0x01, // true (wildcard subscription available value)
    0x29, // Subscription Identifier Available Identifier (41)
    0x01, // true (subscription identifier available value)
    0x2A, // Shared Subscription Available Identifier (42)
    0x01, // true (shared subscription available value)
  ]);

  // Calculate and use the actual length of the byte array
  const remainingLength = packet.length;

  assertEquals<ConnackPacket>(
    parse(
      packet,
      remainingLength, // Pass the actual length
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'connack',
      sessionPresent: false,
      reasonCode: 0,
      properties: {
        sessionExpiryInterval: 3600,
        receiveMaximum: 100,
        maximumQoS: 1,
        retainAvailable: true,
        maximumPacketSize: 1024,
        assignedClientIdentifier: 'mqtt-client-123',
        topicAliasMaximum: 10,
        reasonString: 'Success',
        userProperties: [
          { key: 'key1', val: 'value1' },
          { key: 'key2', val: 'value2' },
        ],
        wildcardSubscriptionAvailable: true,
        subscriptionIdentifiersAvailable: true,
        sharedSubscriptionAvailable: true,
        serverKeepAlive: 60,
        responseInformation: 'response-info',
        serverReference: 'server-ref',
        authenticationMethod: 'oauth2',
        authenticationData: new Uint8Array([1, 2, 3, 4]),
      },
    },
  );
});

// Test decoding a CONNACK packet with MQTT v5
Deno.test('decodeConnackPacketMQTT5', function () {
  assertEquals<ConnackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // session present flag
        0, // reason code (success)
        // properties
        132, // properties length (corrected length)
        1, // properties length continued
        0x11, // Session Expiry Interval Identifier (17)
        0,
        0,
        14,
        16, // 3600 (session expiry interval value)
        0x12, // Assigned Client Identifier Identifier (18)
        0,
        15, // length of client id string
        0x6D,
        0x71,
        0x74,
        0x74,
        0x2D,
        0x63,
        0x6C,
        0x69,
        0x65,
        0x6E,
        0x74,
        0x2D,
        0x31,
        0x32,
        0x33, // "mqtt-client-123"
        0x13, // Server Keep Alive Identifier (19)
        0,
        60, // 60 (server keep alive value)
        0x15, // Authentication Method Identifier (21)
        0,
        6, // length of authentication method
        0x6F,
        0x61,
        0x75,
        0x74,
        0x68,
        0x32, // "oauth2"
        0x16, // Authentication Data Identifier (22)
        0,
        4, // length of authentication data
        0x01,
        0x02,
        0x03,
        0x04, // authentication data bytes
        0x1A, // Response Information Identifier (26)
        0,
        13, // length of response information
        0x72,
        0x65,
        0x73,
        0x70,
        0x6F,
        0x6E,
        0x73,
        0x65,
        0x2D,
        0x69,
        0x6E,
        0x66,
        0x6F, // "response-info"
        0x1C, // Server Reference Identifier (28)
        0,
        10, // length of server reference
        0x73,
        0x65,
        0x72,
        0x76,
        0x65,
        0x72,
        0x2D,
        0x72,
        0x65,
        0x66, // "server-ref"
        0x1F, // Reason String Identifier (31)
        0,
        7, // length of reason string
        0x53,
        0x75,
        0x63,
        0x63,
        0x65,
        0x73,
        0x73, // "Success"
        0x21, // Receive Maximum Identifier (33)
        0,
        100, // 100 (receive maximum value)
        0x22, // Topic Alias Maximum Identifier (34)
        0,
        10, // 10 (topic alias maximum value)
        0x24, // Maximum QoS Identifier (36)
        0x01, // 1 (maximum QoS value)
        0x25, // Retain Available Identifier (37)
        0x01, // true (retain available value)
        0x26, // User Property Identifier (38)
        0,
        4, // length of property key
        0x6B,
        0x65,
        0x79,
        0x31, // "key1"
        0,
        6, // length of property value
        0x76,
        0x61,
        0x6C,
        0x75,
        0x65,
        0x31, // "value1"
        0x26, // User Property Identifier (38)
        0,
        4, // length of property key
        0x6B,
        0x65,
        0x79,
        0x32, // "key2"
        0,
        6, // length of property value
        0x76,
        0x61,
        0x6C,
        0x75,
        0x65,
        0x32, // "value2"
        0x27, // Maximum Packet Size Identifier (39)
        0,
        0,
        4,
        0, // 1024 (maximum packet size value)
        0x28, // Wildcard Subscription Available Identifier (40)
        0x01, // true (wildcard subscription available value)
        0x29, // Subscription Identifier Available Identifier (41)
        0x01, // true (subscription identifier available value)
        0x2A, // Shared Subscription Available Identifier (42)
        0x01, // true (shared subscription available value)
      ]),
      136, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'connack',
      sessionPresent: false,
      reasonCode: 0,
      properties: {
        sessionExpiryInterval: 3600,
        receiveMaximum: 100,
        maximumQoS: 1,
        retainAvailable: true,
        maximumPacketSize: 1024,
        assignedClientIdentifier: 'mqtt-client-123',
        topicAliasMaximum: 10,
        reasonString: 'Success',
        userProperties: [
          { key: 'key1', val: 'value1' },
          { key: 'key2', val: 'value2' },
        ],
        wildcardSubscriptionAvailable: true,
        subscriptionIdentifiersAvailable: true,
        sharedSubscriptionAvailable: true,
        serverKeepAlive: 60,
        responseInformation: 'response-info',
        serverReference: 'server-ref',
        authenticationMethod: 'oauth2',
        authenticationData: new Uint8Array([1, 2, 3, 4]),
      },
    },
  );
});

// Test decoding a CONNACK packet with MQTT v5 with no properties
Deno.test('decodeConnackPacketMQTT5NoProperties', function () {
  assertEquals<ConnackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        1, // session present flag
        0, // reason code (success)
        0, // properties length (0 = no properties)
      ]),
      3, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'connack',
      sessionPresent: true,
      reasonCode: 0,
    },
  );
});

// Test decoding a CONNACK packet with MQTT v5 with reason code other than success
Deno.test('decodeConnackPacketMQTT5WithReasonCode', function () {
  assertEquals<ConnackPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // session present flag
        134, // reason code (not authorized)
        0, // properties length (0 = no properties)
      ]),
      3, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
    ),
    {
      type: 'connack',
      sessionPresent: false,
      reasonCode: 134, // Not authorized
    },
  );
});

// Test for malformed MQTT v5 CONNACK packets
Deno.test('decodeShortConnackPacketsMQTT5', function () {
  assertThrows(() => parse(Uint8Array.from([32, 2]), 0, Mqtt.ProtocolVersion.MQTT_V5));
  assertThrows(() => parse(Uint8Array.from([32, 2, 0]), 1, Mqtt.ProtocolVersion.MQTT_V5));
});

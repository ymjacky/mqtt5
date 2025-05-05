import { assertEquals } from 'std/assert/mod.ts';
import type { ConnectPacket } from '../../../lib/mqtt_packets/connect.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/connect.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodeConnectPacketWithClientId', function () {
  assertEquals(
    toBytes(
      {
        type: 'connect',
        clientId: 'id',
        protocolVersion: 4,
      },
    ),
    new Uint8Array([
      // fixedHeader
      16, // packetType + flags
      14, // remainingLength
      // variableHeader
      0, // protocolNameLength MSB
      4, // protocolNameLength LSB
      77, // 'M'
      81, // 'Q'
      84, // 'T'
      84, // 'T'
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
      2, // connectFlags (cleanSession)
      0, // keepAlive MSB
      0, // keepAlive LSB
      // payload
      // clientId
      0, // length MSB
      2, // length LSB
      105, // 'i'
      100, // 'd'
    ]),
  );
});

Deno.test('encodeConnectPacketWithCleanFalse', function () {
  assertEquals(
    toBytes(
      {
        type: 'connect',
        clientId: 'id',
        protocolVersion: 4,
        clean: false,
      },
    ),
    new Uint8Array([
      // fixedHeader
      16, // packetType + flags
      14, // remainingLength
      // variableHeader
      0, // protocolNameLength MSB
      4, // protocolNameLength LSB
      77, // 'M'
      81, // 'Q'
      84, // 'T'
      84, // 'T'
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
      0, // connectFlags
      0, // keepAlive MSB
      0, // keepAlive LSB
      // payload
      // clientId
      0, // length MSB
      2, // length LSB
      105, // 'i'
      100, // 'd'
    ]),
  );
});

Deno.test('encodeConnectPacketWithKeepAlive', function () {
  assertEquals(
    toBytes(
      {
        type: 'connect',
        clientId: 'id',
        protocolVersion: 4,
        keepAlive: 300,
      },
    ),
    new Uint8Array([
      // fixedHeader
      16, // packetType + flags
      14, // remainingLength
      // variableHeader
      0, // protocolNameLength MSB
      4, // protocolNameLength LSB
      77, // 'M'
      81, // 'Q'
      84, // 'T'
      84, // 'T'
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
      2, // connectFlags (cleanSession)
      1, // keepAlive MSB
      44, // keepAlive LSB
      // payload
      // clientId
      0, // length MSB
      2, // length LSB
      105, // 'i'
      100, // 'd'
    ]),
  );
});

Deno.test('encodeConnectPacketWithUsernameAndPassword', function () {
  assertEquals(
    toBytes(
      {
        type: 'connect',
        clientId: 'id',
        protocolVersion: 4,
        username: 'user',
        password: 'pass',
      },
    ),
    new Uint8Array([
      // fixedHeader
      16, // packetType + flags
      26, // remainingLength
      // variableHeader
      0, // protocolNameLength MSB
      4, // protocolNameLength LSB
      77, // 'M'
      81, // 'Q'
      84, // 'T'
      84, // 'T'
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
      194, // connectFlags (usernameFlag, passwordFlag, cleanSession)
      0, // keepAlive MSB
      0, // keepAlive LSB
      // payload
      // clientId
      0, // length MSB
      2, // length LSB
      105, // 'i'
      100, // 'd'
      // username
      0, // length MSB
      4, // length LSB
      117, // 'u'
      115, // 's'
      101, // 'e'
      114, // 'r'
      // password
      0, // length MSB
      4, // length LSB
      112, // 'p'
      97, // 'a'
      115, // 's'
      115, // 's'
    ]),
  );
});

// Test encoding a CONNECT packet with Will Message for MQTT v3.1.1
Deno.test('encodeConnectPacketWithWill', function () {
  assertEquals(
    toBytes(
      {
        type: 'connect',
        clientId: 'mqtt-client',
        protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
        clean: true,
        keepAlive: 30,
        will: {
          retain: true,
          qos: 1,
          topic: 'will/topic',
          payload: new TextEncoder().encode('goodbye'),
        },
      },
    ),
    new Uint8Array([
      // Fixed header
      16, // Packet type (1) and flags (0) - 0x10
      44, // Remaining length

      // Variable header - Protocol Name
      0,
      4, // Protocol name length
      77,
      81,
      84,
      84, // "MQTT"
      4, // Protocol version (MQTT v3.1.1)
      46, // Connect flags (will flag, will QoS 1, will retain, clean session)
      0,
      30, // Keep alive (30 seconds)

      // Payload - Client ID
      0,
      11, // Client ID length
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
      116, // "mqtt-client"

      // Will Topic
      0,
      10, // Topic length
      119,
      105,
      108,
      108,
      47,
      116,
      111,
      112,
      105,
      99, // "will/topic"

      // Will Payload
      0,
      7, // Payload length
      103,
      111,
      111,
      100,
      98,
      121,
      101, // "goodbye"
    ]),
  );
});

// Test encoding a CONNECT packet with MQTT v5 properties
Deno.test('encodeConnectPacketMQTTv5WithProperties', function () {
  assertEquals(
    toBytes(
      {
        type: 'connect',
        clientId: 'mqtt-client-123',
        protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
        clean: true,
        keepAlive: 60,
        properties: {
          // Properties ordered by ID ascending
          sessionExpiryInterval: 3600, // ID: 0x11
          authenticationMethod: 'SCRAM-SHA-1', // ID: 0x15
          requestProblemInformation: false, // ID: 0x17
          requestResponseInformation: true, // ID: 0x19
          receiveMaximum: 100, // ID: 0x21
          topicAliasMaximum: 10, // ID: 0x22
          userProperties: [ // ID: 0x26
            { key: 'key1', val: 'value1' },
            { key: 'key2', val: 'value2' },
          ],
          maximumPacketSize: 1024, // ID: 0x27
        },
      },
    ),
    new Uint8Array([
      // Fixed header
      16, // Packet type (1) and flags (0) - 0x10
      92, // Remaining length

      // Variable header
      0,
      4, // Protocol name length
      77,
      81,
      84,
      84, // "MQTT"
      5, // Protocol version (MQTT v5)
      2, // Connect flags (clean session)
      0,
      60, // Keep alive (60 seconds)

      // Properties length
      64, // Total properties length

      // Properties (IDs in ascending order)
      0x11,
      0x00,
      0x00,
      0x0E,
      0x10, // Session expiry interval (3600) (ID: 0x11)

      0x15,
      0x00,
      0x0B, // Authentication method length (ID: 0x15)
      0x53,
      0x43,
      0x52,
      0x41,
      0x4D,
      0x2D,
      0x53,
      0x48,
      0x41,
      0x2D,
      0x31, // "SCRAM-SHA-1"

      0x17,
      0x00, // Request problem information (false) (ID: 0x17)

      0x19,
      0x01, // Request response information (true) (ID: 0x19)

      0x21,
      0x00,
      0x64, // Receive maximum (100) (ID: 0x21)

      0x22,
      0x00,
      0x0A, // Topic alias maximum (10) (ID: 0x22)

      // User properties (ID: 0x26)
      0x26, // User property identifier
      0x00,
      0x04, // Key length
      0x6B,
      0x65,
      0x79,
      0x31, // "key1"
      0x00,
      0x06, // Value length
      0x76,
      0x61,
      0x6C,
      0x75,
      0x65,
      0x31, // "value1"

      0x26, // User property identifier
      0x00,
      0x04, // Key length
      0x6B,
      0x65,
      0x79,
      0x32, // "key2"
      0x00,
      0x06, // Value length
      0x76,
      0x61,
      0x6C,
      0x75,
      0x65,
      0x32, // "value2"

      0x27,
      0x00,
      0x00,
      0x04,
      0x00, // Maximum packet size (1024) (ID: 0x27)

      // Payload - Client ID
      0x00,
      0x0F, // Client ID length (15)
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
    ]),
  );
});

// Test encoding a CONNECT packet with MQTT v5 Will Message and Will Properties
Deno.test('encodeConnectPacketMQTTv5WithWill', function () {
  assertEquals(
    toBytes(
      {
        type: 'connect',
        clientId: 'mqtt-client',
        protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
        clean: true,
        keepAlive: 30,
        properties: {
          sessionExpiryInterval: 1800,
          userProperties: [
            { key: 'app', val: 'test' },
          ],
        },
        will: {
          retain: true,
          qos: 1,
          topic: 'will/topic',
          payload: new TextEncoder().encode('hello world!'),
          properties: {
            payloadFormatIndicator: 1,
            messageExpiryInterval: 300,
            contentType: 'text/plain',
            willDelayInterval: 60,
            userProperties: [
              { key: 'tag', val: 'important' },
            ],
          },
        },
      },
    ),
    new Uint8Array([
      // Fixed header
      16, // Packet type (1) and flags (0) - 0x10
      110, // Remaining length

      // Variable header - Protocol Name
      0,
      4, // Protocol name length
      77,
      81,
      84,
      84, // "MQTT"
      5, // Protocol version
      46, // Connect flags (will flag, will QoS 1, will retain, clean session)
      0,
      30, // Keep alive (30 seconds)

      // Properties Length
      17, // Total properties length

      // Properties (IDs in ascending order)
      0x11,
      0x00,
      0x00,
      0x07,
      0x08, // Session expiry interval (1800) (ID: 0x11)

      0x26, // User property ID
      0x00,
      0x03, // Key length
      0x61,
      0x70,
      0x70, // "app"
      0x00,
      0x04, // Value length
      0x74,
      0x65,
      0x73,
      0x74, // "test"

      // Payload - Client ID
      0x00,
      0x0B, // Client ID length
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
      0x74, // "mqtt-client"

      // Will Properties Length
      42, // Total will properties length - Updated

      // Will Properties (IDs in ascending order)
      0x01,
      0x01, // Payload format indicator (1)

      0x02,
      0x00,
      0x00,
      0x01,
      0x2C, // Message expiry interval (300) (ID: 0x02)
      0x03,
      0x00,
      0x0A, // Content type length (ID: 0x03)
      0x74,
      0x65,
      0x78,
      0x74,
      0x2F,
      0x70,
      0x6C,
      0x61,
      0x69,
      0x6E, // "text/plain"
      0x18,
      0x00,
      0x00,
      0x00,
      0x3C, // Will delay interval (60) (ID: 0x18)

      0x26, // User property ID
      0x00,
      0x03, // Key length
      0x74,
      0x61,
      0x67, // "tag"
      0x00,
      0x09, // Value length
      0x69,
      0x6D,
      0x70,
      0x6F,
      0x72,
      0x74,
      0x61,
      0x6E,
      0x74, // "important"

      // Will Topic
      0x00,
      0x0A, // Topic length
      0x77,
      0x69,
      0x6C,
      0x6C,
      0x2F,
      0x74,
      0x6F,
      0x70,
      0x69,
      0x63, // "will/topic"

      // Will Payload
      0x00,
      0x0C, // Payload length
      0x68,
      0x65,
      0x6C,
      0x6C,
      0x6F,
      0x20,
      0x77,
      0x6F,
      0x72,
      0x6C,
      0x64,
      0x21, // "hello world!"
    ]),
  );
});

// Test decoding a CONNECT packet with Will Message for MQTT v3.1.1

Deno.test('decodeConnectPacketWithUsernameAndPassword', function () {
  assertEquals<ConnectPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // protocolNameLength MSB
        4, // protocolNameLength LSB
        77, // 'M'
        81, // 'Q'
        84, // 'T'
        84, // 'T'
        Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
        194, // connectFlags (usernameFlag, passwordFlag, cleanSession)
        0, // keepAlive MSB
        0, // keepAlive LSB
        // payload
        // clientId
        0, // length MSB
        2, // length LSB
        105, // 'i'
        100, // 'd'
        // username
        0, // length MSB
        4, // length LSB
        117, // 'u'
        115, // 's'
        101, // 'e'
        114, // 'r'
        // password
        0, // length MSB
        4, // length LSB
        112, // 'p'
        97, // 'a'
        115, // 's'
        115, // 's'
      ]),
      26, // remainingLength
    ),
    {
      type: 'connect',
      clientId: 'id',
      protocolName: 'MQTT',
      protocolVersion: 4,
      username: 'user',
      password: 'pass',
      will: undefined,
      clean: true,
      keepAlive: 0,
    },
  );
});
Deno.test('decodeConnectPacketWithWill', function () {
  assertEquals<ConnectPacket>(
    parse(
      Uint8Array.from([
        // Variable header
        0,
        4, // Protocol name length
        77,
        81,
        84,
        84, // "MQTT"
        4, // Protocol version (MQTT v3.1.1)
        46, // Connect flags (will retain, will QoS 1, will flag, clean session)
        0,
        30, // Keep alive (30 seconds)

        // Payload - Client ID
        0,
        11, // Client ID length (11)
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
        116, // "mqtt-client"

        // Will Topic
        0,
        10, // Topic length (10)
        119,
        105,
        108,
        108,
        47,
        116,
        111,
        112,
        105,
        99, // "will/topic"

        // Will Payload
        0,
        7, // Payload length (7)
        103,
        111,
        111,
        100,
        98,
        121,
        101, // "goodbye"
      ]),
      41, // Remaining length
    ),
    {
      type: 'connect',
      clientId: 'mqtt-client',
      protocolName: 'MQTT',
      protocolVersion: Mqtt.ProtocolVersion.MQTT_V3_1_1,
      username: undefined,
      password: undefined,
      clean: true,
      keepAlive: 30,
      will: {
        retain: true,
        qos: 1,
        topic: 'will/topic',
        payload: new Uint8Array([103, 111, 111, 100, 98, 121, 101]), // "goodbye"
      },
    },
  );
});
Deno.test('decodeConnectPacketMQTTv5WithUsernameAndPassword', function () {
  assertEquals<ConnectPacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // protocolNameLength MSB
        4, // protocolNameLength LSB
        77, // 'M'
        81, // 'Q'
        84, // 'T'
        84, // 'T'
        Mqtt.ProtocolVersion.MQTT_V5, // ProtocolVersion
        194, // connectFlags (usernameFlag, passwordFlag, cleanSession)
        0, // keepAlive MSB
        0, // keepAlive LSB
        0, // property length
        // payload
        // clientId
        0, // length MSB
        2, // length LSB
        105, // 'i'
        100, // 'd'
        // username
        0, // length MSB
        4, // length LSB
        117, // 'u'
        115, // 's'
        101, // 'e'
        114, // 'r'
        // password
        0, // length MSB
        4, // length LSB
        112, // 'p'
        97, // 'a'
        115, // 's'
        115, // 's'
      ]),
      26, // remainingLength
    ),
    {
      type: 'connect',
      clientId: 'id',
      protocolName: 'MQTT',
      protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
      username: 'user',
      password: 'pass',
      will: undefined,
      clean: true,
      keepAlive: 0,
      properties: undefined,
    },
  );
});

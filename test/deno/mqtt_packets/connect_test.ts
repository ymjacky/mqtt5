import { assertEquals, assertThrows } from '@std/assert';
import { MqttUtilsError } from '../../../lib/mqtt_utils/mod.ts';
import type { ConnectPacket } from '../../../lib/mqtt_packets/packet_types.ts';
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
      44, // Remaining length
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
      27, // remainingLength
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

// Test decoding a CONNECT packet with MQTT v5 properties and Will Properties,
// each with User Properties that share a key
Deno.test('decodeConnectPacketMQTTv5WithPropertiesAndWillProperties', function () {
  assertEquals<ConnectPacket>(
    parse(
      Uint8Array.from([
        // Variable header
        0x00,
        0x04, // Protocol name length
        0x4D,
        0x51,
        0x54,
        0x54, // "MQTT"
        Mqtt.ProtocolVersion.MQTT_V5, // Protocol version
        14, // Connect flags (will QoS 1, will flag, clean session)
        0x00,
        0x3C, // Keep alive (60 seconds)

        // Properties
        21, // Properties length
        0x11,
        0x00,
        0x00,
        0x00,
        0x3C, // Session expiry interval (60) (ID: 0x11)
        0x26, // User property ID
        0x00,
        0x01,
        0x6B, // "k"
        0x00,
        0x02,
        0x76,
        0x31, // "v1"
        0x26, // User property ID
        0x00,
        0x01,
        0x6B, // "k"
        0x00,
        0x02,
        0x76,
        0x32, // "v2"

        // Payload - Client ID
        0x00,
        0x02, // Client ID length
        0x69,
        0x64, // "id"

        // Will Properties
        19, // Will properties length
        0x18,
        0x00,
        0x00,
        0x00,
        0x0A, // Will delay interval (10) (ID: 0x18)
        0x26, // User property ID
        0x00,
        0x01,
        0x77, // "w"
        0x00,
        0x01,
        0x61, // "a"
        0x26, // User property ID
        0x00,
        0x01,
        0x77, // "w"
        0x00,
        0x01,
        0x62, // "b"

        // Will Topic
        0x00,
        0x01, // Topic length
        0x74, // "t"

        // Will Payload
        0x00,
        0x01, // Payload length
        0x78, // "x"
      ]),
      62, // Remaining length
    ),
    {
      type: 'connect',
      clientId: 'id',
      protocolName: 'MQTT',
      protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
      username: undefined,
      password: undefined,
      clean: true,
      keepAlive: 60,
      properties: {
        sessionExpiryInterval: 60,
        userProperties: [
          { key: 'k', val: 'v1' },
          { key: 'k', val: 'v2' },
        ],
      },
      will: {
        retain: false,
        qos: 1,
        topic: 't',
        payload: new Uint8Array([0x78]), // "x"
        properties: {
          willDelayInterval: 10,
          userProperties: [
            { key: 'w', val: 'a' },
            { key: 'w', val: 'b' },
          ],
        },
      },
    },
  );
});

// A zero-length User Name / Password is a present value, not an absent one.
Deno.test('encodeConnectPacketWithEmptyUsernameAndPassword', function () {
  assertEquals(
    toBytes(
      {
        type: 'connect',
        clientId: 'id',
        protocolVersion: 4,
        username: '',
        password: '',
      },
    ),
    new Uint8Array([
      // fixedHeader
      16, // packetType + flags
      18, // remainingLength
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
      0, // length LSB
      // password
      0, // length MSB
      0, // length LSB
    ]),
  );
});

Deno.test('encodeConnectPacketWithEmptyUsernameOnly', function () {
  assertEquals(
    toBytes(
      {
        type: 'connect',
        clientId: 'id',
        protocolVersion: 4,
        username: '',
      },
    ),
    new Uint8Array([
      16, // packetType + flags
      16, // remainingLength
      0, // protocolNameLength MSB
      4, // protocolNameLength LSB
      77, // 'M'
      81, // 'Q'
      84, // 'T'
      84, // 'T'
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
      130, // connectFlags (usernameFlag, cleanSession)
      0, // keepAlive MSB
      0, // keepAlive LSB
      0, // clientId length MSB
      2, // clientId length LSB
      105, // 'i'
      100, // 'd'
      0, // username length MSB
      0, // username length LSB
    ]),
  );
});

Deno.test('decodeConnectPacketWithEmptyUsernameAndPassword', function () {
  assertEquals<ConnectPacket>(
    parse(
      Uint8Array.from([
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
        0, // clientId length MSB
        2, // clientId length LSB
        105, // 'i'
        100, // 'd'
        0, // username length MSB
        0, // username length LSB
        0, // password length MSB
        0, // password length LSB
      ]),
      18, // remainingLength
    ),
    {
      type: 'connect',
      clientId: 'id',
      protocolName: 'MQTT',
      protocolVersion: 4,
      username: '',
      password: '',
      will: undefined,
      clean: true,
      keepAlive: 0,
    },
  );
});

/** The bytes of a CONNECT (MQTT 3.1.1, Client ID 'id') after the fixed header, with the given User Name and Password bytes. */
function connectWithUsernameAndPassword(username: number[], password: number[]): Uint8Array {
  return Uint8Array.from([
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
    0, // clientId length MSB
    2, // clientId length LSB
    105, // 'i'
    100, // 'd'
    0, // username length MSB
    username.length, // username length LSB
    ...username,
    0, // password length MSB
    password.length, // password length LSB
    ...password,
  ]);
}

// The Password is Binary Data, not a UTF-8 Encoded String (MQTT 5.0 3.1.3.6, MQTT 3.1.1 3.1.3.5): it may hold any bytes,
// so a CONNECT with a Password that is not UTF-8 or contains 0x00 is decoded. A leading 0xEF 0xBB 0xBF is kept.
Deno.test('decodeConnectPacketWithAPasswordThatIsNotUtf8', function () {
  const bytes = connectWithUsernameAndPassword([0x75], [0xEF, 0xBB, 0xBF, 0xFF, 0x00]);
  assertEquals<ConnectPacket>(parse(bytes, bytes.length), {
    type: 'connect',
    clientId: 'id',
    protocolName: 'MQTT',
    protocolVersion: 4,
    username: 'u',
    password: '\u{FEFF}\u{FFFD}\u0000',
    will: undefined,
    clean: true,
    keepAlive: 0,
  });
});

// The User Name is a UTF-8 Encoded String: ill-formed UTF-8 and U+0000 are not accepted [MQTT-1.5.4-1] [MQTT-1.5.4-2].
Deno.test('decodeConnectPacketWithAnInvalidUsername', function () {
  for (const username of [[0xFF], [0x75, 0x00]]) {
    const bytes = connectWithUsernameAndPassword(username, [0x70]);
    assertThrows(() => parse(bytes, bytes.length), MqttUtilsError.InvalidUtf8EncodedStringError, undefined, JSON.stringify(username));
  }
});

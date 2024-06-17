import { assertEquals } from 'std/assert/mod.ts';
import type { ConnectPacket } from '../../../lib/mqtt_packets/connect.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/connect.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test(
  'encodeConnectPacketWithClientId',
  function encodeConnectPacketWithClientId() {
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
  },
);

Deno.test(
  'encodeConnectPacketWithCleanFalse',
  function encodeConnectPacketWithCleanFalse() {
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
  },
);

Deno.test(
  'encodeConnectPacketWithKeepAlive',
  function encodeConnectPacketWithKeepAlive() {
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
  },
);

Deno.test(
  'encodeConnectPacketWithUsernameAndPassword',
  function encodeConnectPacketWithUsernameAndPassword() {
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
  },
);

Deno.test(
  'decodeConnectPacketWithUsernameAndPassword',
  function decodeConnectPacketWithUsernameAndPassword() {
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
  },
);

Deno.test(
  'decodeV5ConnectPacketWithUsernameAndPassword',
  function decodeConnectPacketWithUsernameAndPassword() {
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
  },
);

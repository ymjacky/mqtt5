import { assertEquals } from 'std/assert/mod.ts';
import type { SubscribePacket } from '../../../lib/mqtt_packets/subscribe.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/subscribe.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

// Test SUBSCRIBE packet encoding for MQTT v3.1.1
Deno.test('encodeSubscribePacket', function () {
  assertEquals(
    toBytes(
      {
        type: 'subscribe',
        packetId: 1,
        subscriptions: [
          { topicFilter: 'a/b', qos: Mqtt.QoS.AT_MOST_ONCE },
          { topicFilter: 'c/d', qos: Mqtt.QoS.AT_LEAST_ONCE },
        ],
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1,
    ),
    new Uint8Array([
      // fixedHeader
      0x82, // packetType + flags
      14, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // payload
      0, // topic filter length MSB
      3, // topic filter length LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      0, // qos
      0, // topic filter length MSB
      3, // topic filter length LSB
      99, // 'c'
      47, // '/'
      100, // 'd'
      1, // qos
    ]),
  );
});

// Test SUBSCRIBE packet encoding with subscription options for MQTT v5
Deno.test('encodeSubscribePacketMQTT5WithOptions', function () {
  assertEquals(
    toBytes(
      {
        type: 'subscribe',
        packetId: 10,
        subscriptions: [
          {
            topicFilter: 'sensors/#',
            qos: Mqtt.QoS.EXACTRY_ONCE,
            noLocal: true,
            retainAsPublished: true,
            retainHandling: Mqtt.RetainHandling.AtSubscribeOnlyIfTheSubscriptionDoesNotCurrentlyExist,
          },
          {
            topicFilter: 'status/+',
            qos: Mqtt.QoS.AT_LEAST_ONCE,
            noLocal: false,
            retainAsPublished: false,
            retainHandling: Mqtt.RetainHandling.AtTheTimeOfTheSubscribe,
          },
        ],
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0x82, // packetType + flags
      26, // remainingLength
      // variableHeader
      0, // id MSB
      10, // id LSB
      0, // properties length (no properties)
      // payload
      0, // topic filter length MSB
      9, // topic filter length LSB
      115,
      101,
      110,
      115,
      111,
      114,
      115,
      47,
      35, // 'sensors/#'
      0x1E, // subscription options (retain handling: 1 << 4 | retain as published | no local | QoS: 2)
      0, // topic filter length MSB
      8, // topic filter length LSB
      115,
      116,
      97,
      116,
      117,
      115,
      47,
      43, // 'status/+'
      0x01, // subscription options (retain handling: 0 << 4 | QoS: 1)
    ]),
  );
});

// Test SUBSCRIBE packet encoding with subscription identifier for MQTT v5
Deno.test('encodeSubscribePacketMQTT5WithSubscriptionIdentifier', function () {
  assertEquals(
    toBytes(
      {
        type: 'subscribe',
        packetId: 42,
        subscriptions: [
          { topicFilter: 'device/temperature', qos: Mqtt.QoS.AT_MOST_ONCE },
        ],
        properties: {
          subscriptionIdentifier: 123,
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0x82, // packetType + flags
      26, // remainingLength
      // variableHeader
      0, // id MSB
      42, // id LSB
      2, // properties length
      0x0B, // Subscription Identifier
      123, // Subscription Identifier value (VBI)
      // payload
      0, // topic filter length MSB
      18, // topic filter length LSB
      100,
      101,
      118,
      105,
      99,
      101,
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
      101, // 'device/temperature'
      0x00, // subscription options (QoS: 0)
    ]),
  );
});

// Test SUBSCRIBE packet encoding with user properties for MQTT v5
Deno.test('encodeSubscribePacketMQTT5WithUserProperties', function () {
  assertEquals(
    toBytes(
      {
        type: 'subscribe',
        packetId: 99,
        subscriptions: [
          { topicFilter: 'test/topic', qos: Mqtt.QoS.AT_LEAST_ONCE },
        ],
        properties: {
          userProperties: [
            { key: 'clientId', val: 'device-001' },
          ],
        },
      },
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    new Uint8Array([
      // fixedHeader
      0x82, // packetType + flags
      39, // remainingLength
      // variableHeader
      0, // id MSB
      99, // id LSB
      23, // properties length
      0x26, // User Property Identifier
      0,
      8,
      99,
      108,
      105,
      101,
      110,
      116,
      73,
      100, // 'clientId'
      0,
      10,
      100,
      101,
      118,
      105,
      99,
      101,
      45,
      48,
      48,
      49, // 'device-001'
      // payload
      0, // topic filter length MSB
      10, // topic filter length LSB
      116,
      101,
      115,
      116,
      47,
      116,
      111,
      112,
      105,
      99, // 'test/topic'
      0x01, // subscription options (QoS: 1)
    ]),
  );
});

// Test SUBSCRIBE packet parsing for MQTT v3.1.1
Deno.test('decodeSubscribePacket', function () {
  assertEquals<SubscribePacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        1, // id LSB
        // payload
        0, // topic filter length MSB
        3, // topic filter length LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        0, // qos
        0, // topic filter length MSB
        3, // topic filter length LSB
        99, // 'c'
        47, // '/'
        100, // 'd'
        1, // qos
      ]),
      14, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1,
    ),
    {
      type: 'subscribe',
      packetId: 1,
      subscriptions: [
        { topicFilter: 'a/b', qos: Mqtt.QoS.AT_MOST_ONCE },
        { topicFilter: 'c/d', qos: Mqtt.QoS.AT_LEAST_ONCE },
      ],
    },
  );
});

// Test SUBSCRIBE packet parsing with subscription options for MQTT v5
Deno.test('decodeSubscribePacketMQTT5WithOptions', function () {
  assertEquals<SubscribePacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        10, // id LSB
        0, // properties length (no properties)
        // payload
        0, // topic filter length MSB
        9, // topic filter length LSB
        115,
        101,
        110,
        115,
        111,
        114,
        115,
        47,
        35, // 'sensors/#'
        0x1E, // subscription options (retain handling: 1 << 4 | retain as published | no local | QoS: 2)
        0, // topic filter length MSB
        8, // topic filter length LSB
        115,
        116,
        97,
        116,
        117,
        115,
        47,
        43, // 'status/+'
        0x01, // subscription options (retain handling: 0 << 4 | QoS: 1)
      ]),
      22, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    {
      type: 'subscribe',
      packetId: 10,
      properties: {},
      subscriptions: [
        {
          topicFilter: 'sensors/#',
          qos: Mqtt.QoS.EXACTRY_ONCE,
          noLocal: true,
          retainAsPublished: true,
          retainHandling: Mqtt.RetainHandling.AtSubscribeOnlyIfTheSubscriptionDoesNotCurrentlyExist,
        },
        {
          topicFilter: 'status/+',
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          noLocal: false,
          retainAsPublished: false,
          retainHandling: Mqtt.RetainHandling.AtTheTimeOfTheSubscribe,
        },
      ],
    },
  );
});

// Test SUBSCRIBE packet parsing with subscription identifier for MQTT v5
Deno.test('decodeSubscribePacketMQTT5WithSubscriptionIdentifier', function () {
  assertEquals<SubscribePacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        42, // id LSB
        2, // properties length
        0x0B, // Subscription Identifier
        123, // Subscription Identifier value (VBI)
        // payload
        0, // topic filter length MSB
        18, // topic filter length LSB
        100,
        101,
        118,
        105,
        99,
        101,
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
        101, // 'device/temperature'
        0x00, // subscription options (QoS: 0)
      ]),
      24, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    {
      type: 'subscribe',
      packetId: 42,
      subscriptions: [
        {
          topicFilter: 'device/temperature',
          qos: Mqtt.QoS.AT_MOST_ONCE,
          noLocal: false,
          retainAsPublished: false,
          retainHandling: Mqtt.RetainHandling.AtTheTimeOfTheSubscribe,
        },
      ],
      properties: {
        subscriptionIdentifier: 123,
      },
    },
  );
});

// Test SUBSCRIBE packet parsing with user properties for MQTT v5
Deno.test('decodeSubscribePacketMQTT5WithUserProperties', function () {
  assertEquals<SubscribePacket>(
    parse(
      Uint8Array.from([
        // variableHeader
        0, // id MSB
        99, // id LSB
        23, // properties length
        0x26, // User Property Identifier
        0,
        8,
        99,
        108,
        105,
        101,
        110,
        116,
        73,
        100, // 'clientId'
        0,
        10,
        100,
        101,
        118,
        105,
        99,
        101,
        45,
        48,
        48,
        49, // 'device-001'
        // payload
        0, // topic filter length MSB
        10, // topic filter length LSB
        116,
        101,
        115,
        116,
        47,
        116,
        111,
        112,
        105,
        99, // 'test/topic'
        0x01, // subscription options (QoS: 1)
      ]),
      37, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V5,
    ),
    {
      type: 'subscribe',
      packetId: 99,
      subscriptions: [
        {
          topicFilter: 'test/topic',
          qos: Mqtt.QoS.AT_LEAST_ONCE,
          noLocal: false,
          retainAsPublished: false,
          retainHandling: Mqtt.RetainHandling.AtTheTimeOfTheSubscribe,
        },
      ],
      properties: {
        userProperties: [
          { key: 'clientId', val: 'device-001' },
        ],
      },
    },
  );
});

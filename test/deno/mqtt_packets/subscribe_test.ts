import { assertEquals } from 'std/assert/mod.ts';
import type { SubscribePacket } from '../../../lib/mqtt_packets/subscribe.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/subscribe.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodeSubscribePacket', function encodeSubscribePacket() {
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
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
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

Deno.test('decodeSubscribePacket', function decodeSubscribePacket() {
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
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolLerson
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

import { assertEquals } from 'std/assert/mod.ts';
import type { UnsubscribePacket } from '../../../lib/mqtt_packets/unsubscribe.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/unsubscribe.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodeUnsubscribePacket', function encodeUnsubscribePacket() {
  assertEquals(
    toBytes(
      {
        type: 'unsubscribe',
        packetId: 1,
        topicFilters: ['a/b', 'c/d'],
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      0xa2, // packetType + flags
      12, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // payload
      0, // topic filter length MSB
      3, // topic filter length LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      0, // topic filter length MSB
      3, // topic filter length LSB
      99, // 'c'
      47, // '/'
      100, // 'd'
    ]),
  );
});

Deno.test('decodeUnsubscribePacket', function decodeUnsubscribePacket() {
  assertEquals<UnsubscribePacket>(
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
        0, // topic filter length MSB
        3, // topic filter length LSB
        99, // 'c'
        47, // '/'
        100, // 'd'
      ]),
      12, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    {
      type: 'unsubscribe',
      packetId: 1,
      topicFilters: ['a/b', 'c/d'],
    },
  );
});

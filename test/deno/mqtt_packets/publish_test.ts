import { assertEquals } from 'std/assert/mod.ts';
import type { PublishPacket } from '../../../lib/mqtt_packets/publish.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/publish.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodePublishPacket', function encodePublishPacket() {
  assertEquals(
    toBytes(
      {
        type: 'publish',
        topic: 'a/b',
        payload: new TextEncoder().encode('payload'),
        dup: false,
        retain: false,
        qos: 0,
        packetId: 0,
      },
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      48, // packetType + flags
      12, // remainingLength
      // variableHeader
      0, // topicLength MSB
      3, // topicLength LSB
      97, // 'a'
      47, // '/'
      98, // 'b'
      // payload
      112, // 'p'
      97, // 'a'
      121, // 'y'
      108, // 'l'
      111, // 'o'
      97, // 'a'
      100, // 'd'
    ]),
  );
});

Deno.test('decodePublishPacket', function decodePublishPacket() {
  assertEquals<PublishPacket>(
    parse(
      0b0000, // packetFlag
      Uint8Array.from([
        // variableHeader
        0, // topicLength MSB
        3, // topicLength LSB
        97, // 'a'
        47, // '/'
        98, // 'b'
        // payload
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
      ]),
      12, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    {
      type: 'publish',
      dup: false,
      qos: 0,
      retain: false,
      packetId: undefined,
      topic: 'a/b',
      payload: Uint8Array.from([
        112, // 'p'
        97, // 'a'
        121, // 'y'
        108, // 'l'
        111, // 'o'
        97, // 'a'
        100, // 'd'
      ]),
      properties: undefined,
    },
  );
});

Deno.test(
  'decodePublishPacketWithExtraBytes',
  function decodePublishPacketWithExtraBytes() {
    assertEquals<PublishPacket>(
      parse(
        0b0000, // packetFlag
        Uint8Array.from([
          // variableHeader
          0, // topicLength MSB
          3, // topicLength LSB
          97, // 'a'
          47, // '/'
          98, // 'b'
          // payload
          112, // 'p'
          97, // 'a'
          121, // 'y'
          108, // 'l'
          111, // 'o'
          97, // 'a'
          100, // 'd'
          101, // 'e'
          116, // 't'
          99, // 'c'
        ]),
        15,
        Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
      ),
      {
        type: 'publish',
        dup: false,
        qos: 0,
        retain: false,
        packetId: undefined,
        topic: 'a/b',
        payload: Uint8Array.from([
          112, // 'p'
          97, // 'a'
          121, // 'y'
          108, // 'l'
          111, // 'o'
          97, // 'a'
          100, // 'd'
          101, // 'e'
          116, // 't'
          99, // 'c'
        ]),
        properties: undefined,
      },
    );
  },
);

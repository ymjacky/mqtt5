import { assertEquals } from 'std/assert/mod.ts';
import type { DisconnectPacket } from '../../../lib/mqtt_packets/disconnect.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/disconnect.ts';
import * as Mqtt from '../../../lib/mqtt/mod.ts';

Deno.test('encodeDisconnectPacket', function encodeDisconnectPacket() {
  assertEquals(
    toBytes({
      type: 'disconnect',
    }, 4 // protocolVersion
    ),
    new Uint8Array([
      // fixedHeader
      224, // packetType + flags
      0, // remainingLength
    ]),
  );
});

Deno.test('decodeDisconnectPacket', function decodeDisconnectPacket() {
  assertEquals<DisconnectPacket>(
    parse(
      Uint8Array.from([
        // // fixedHeader
        // 224, // packetType + flags
        // 0, // remainingLength
      ]),
      0, // remainingLength
      Mqtt.ProtocolVersion.MQTT_V3_1_1, // ProtocolVersion
    ),
    {
      type: 'disconnect',
    },
  );
});

import { assertEquals } from 'std/assert/mod.ts';
import type { PingrespPacket } from '../../../lib/mqtt_packets/pingresp.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/pingresp.ts';

Deno.test('encodePingrespPacket', () => {
  assertEquals(
    toBytes({
      type: 'pingresp',
    }),
    new Uint8Array([
      // fixedHeader
      0xd0, // packetType + flags
      0, // remainingLength
    ]),
  );
});

Deno.test('decodePingrespPacket', () => {
  assertEquals<PingrespPacket>(
    parse(
      0,
    ),
    {
      type: 'pingresp',
    },
  );
});

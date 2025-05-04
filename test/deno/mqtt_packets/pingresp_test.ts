import { assertEquals } from 'std/assert/mod.ts';
import type { PingrespPacket } from '../../../lib/mqtt_packets/pingresp.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/pingresp.ts';

// Test PINGRESP packet encoding
Deno.test('encodePingrespPacket', function() {
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

// Test PINGRESP packet parsing
Deno.test('decodePingrespPacket', function() {
  assertEquals<PingrespPacket>(
    parse(
      0,
    ),
    {
      type: 'pingresp',
    },
  );
});

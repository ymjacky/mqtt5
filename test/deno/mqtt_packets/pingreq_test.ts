import { assertEquals } from 'std/assert/mod.ts';
import type { PingreqPacket } from '../../../lib/mqtt_packets/pingreq.ts';
import { parse, toBytes } from '../../../lib/mqtt_packets/pingreq.ts';

Deno.test('encodePingreqPacket', () => {
  assertEquals(
    toBytes({
      type: 'pingreq',
    }),
    new Uint8Array([
      // fixedHeader
      0xc0, // packetType + flags
      0, // remainingLength
    ]),
  );
});

Deno.test('decodePingreqPacket', () => {
  assertEquals<PingreqPacket>(
    parse(
      0,
    ),
    {
      type: 'pingreq',
    },
  );
});

import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import { fourByteIntegerToNum, numToFourByteInteger } from '../../../lib/mqtt_utils/mod.ts';

Deno.test('numToFourByteInteger', () => {
  assertEquals(numToFourByteInteger(0), new Uint8Array([0x00, 0x00, 0x00, 0x00]));
  assertEquals(numToFourByteInteger(1), new Uint8Array([0x00, 0x00, 0x00, 0x01]));
  assertEquals(numToFourByteInteger(65_536), new Uint8Array([0x00, 0x01, 0x00, 0x00]));
  assertEquals(numToFourByteInteger(0x01020304), new Uint8Array([0x01, 0x02, 0x03, 0x04]));
  assertEquals(numToFourByteInteger(0x80000000), new Uint8Array([0x80, 0x00, 0x00, 0x00]));
  assertEquals(numToFourByteInteger(0xFFFFFFFF), new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]));
  assertThrows(() => numToFourByteInteger(0x100000000));
});

Deno.test('fourByteIntegerToNum', () => {
  assertEquals(fourByteIntegerToNum(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 0), 0);
  assertEquals(fourByteIntegerToNum(new Uint8Array([0x00, 0x00, 0x00, 0x01]), 0), 1);
  assertEquals(fourByteIntegerToNum(new Uint8Array([0x00, 0x00, 0x01, 0x00]), 0), 256);
  assertEquals(fourByteIntegerToNum(new Uint8Array([0x00, 0x01, 0x00, 0x00]), 0), 65_536);
  assertEquals(fourByteIntegerToNum(new Uint8Array([0x01, 0x02, 0x03, 0x04]), 0), 0x01020304);
  assertEquals(fourByteIntegerToNum(new Uint8Array([0x0F, 0xFF, 0xFF, 0xFF]), 0), 268_435_455);
  assertEquals(fourByteIntegerToNum(new Uint8Array([0x80, 0x00, 0x00, 0x00]), 0), 0x80000000);
  assertEquals(fourByteIntegerToNum(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]), 0), 0xFFFFFFFF);
  // offset
  assertEquals(fourByteIntegerToNum(new Uint8Array([0xEE, 0x00, 0x00, 0x01, 0x2C]), 1), 300);
});

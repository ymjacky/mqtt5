import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import { MqttUtilsError, numToTwoByteInteger, twoByteIntegerToNum } from '../../../lib/mqtt_utils/mod.ts';

Deno.test('numToTwoByteInteger', () => {
  assertEquals(numToTwoByteInteger(0), new Uint8Array([0x00, 0x00]));
  assertEquals(numToTwoByteInteger(300), new Uint8Array([0x01, 0x2C]));
  assertEquals(numToTwoByteInteger(0xFFFF), new Uint8Array([0xFF, 0xFF]));
  assertThrows(() => numToTwoByteInteger(0x10000), MqttUtilsError.NumIsOutOfRange);
});

Deno.test('twoByteIntegerToNum', () => {
  assertEquals(twoByteIntegerToNum(new Uint8Array([0x00, 0x00]), 0), 0);
  assertEquals(twoByteIntegerToNum(new Uint8Array([0x00, 0x01]), 0), 1);
  assertEquals(twoByteIntegerToNum(new Uint8Array([0x01, 0x00]), 0), 256);
  assertEquals(twoByteIntegerToNum(new Uint8Array([0xFF, 0xFF]), 0), 0xFFFF);
  // offset
  assertEquals(twoByteIntegerToNum(new Uint8Array([0xEE, 0x01, 0x2C, 0xEE]), 1), 300);
});

Deno.test('twoByteIntegerToNum throws instead of reading past the end of the buffer', () => {
  // The second byte is missing: it was read as NaN.
  assertThrows(() => twoByteIntegerToNum(new Uint8Array([0x01]), 0), MqttUtilsError.MalformedDataError, '2 bytes are needed at byte 0, but only 1 are left');
  assertThrows(() => twoByteIntegerToNum(new Uint8Array([0x01, 0x02]), 1), MqttUtilsError.MalformedDataError, '2 bytes are needed at byte 1');
  assertThrows(() => twoByteIntegerToNum(new Uint8Array([0x01, 0x02]), 3), MqttUtilsError.MalformedDataError, 'but only 0 are left');
});

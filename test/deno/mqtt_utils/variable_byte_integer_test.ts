import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import { numToVariableByteInteger, variableByteIntegerToNum } from '../../../lib/mqtt_utils/mod.ts';

Deno.test('numToVariableByteInteger', () => {
  assertEquals(numToVariableByteInteger(0), new Uint8Array([0x00]));
  assertEquals(numToVariableByteInteger(1), new Uint8Array([0x01]));
  assertEquals(numToVariableByteInteger(127), new Uint8Array([0x7F])); // 0x7F = 0b01111111
  assertEquals(numToVariableByteInteger(128), new Uint8Array([0x80, 0x01])); // 0x80 = 0b1000, 0x01 = 0b0001
  assertEquals(numToVariableByteInteger(16_383), new Uint8Array([0xFF, 0x7F]));
  assertEquals(numToVariableByteInteger(16_384), new Uint8Array([0x80, 0x80, 0x01]));
  assertEquals(numToVariableByteInteger(2_097_151), new Uint8Array([0xFF, 0xFF, 0x7F]));
  assertEquals(numToVariableByteInteger(2_097_152), new Uint8Array([0x80, 0x80, 0x80, 0x01]));
  assertEquals(numToVariableByteInteger(268_435_455), new Uint8Array([0xFF, 0xFF, 0xFF, 0x7F])); // 268435455 is max length
  assertThrows(() => numToVariableByteInteger(268_435_456));
  assertThrows(() => numToVariableByteInteger(-1));
});

Deno.test('variableByteIntegerToNum', () => {
  assertEquals(
    variableByteIntegerToNum(
      Uint8Array.from([0x00]),
      0,
    ),
    {
      number: 0,
      size: 1,
    },
  );
  assertEquals(
    variableByteIntegerToNum(
      Uint8Array.from([0x7F]),
      0,
    ),
    {
      number: 127,
      size: 1,
    },
  );
  assertEquals(
    variableByteIntegerToNum(
      Uint8Array.from([0x80, 0x01]),
      0,
    ),
    {
      number: 128,
      size: 2,
    },
  );
  assertEquals(
    variableByteIntegerToNum(
      Uint8Array.from([0xFF, 0x7F]),
      0,
    ),
    {
      number: 16_383,
      size: 2,
    },
  );
  assertEquals(
    variableByteIntegerToNum(
      Uint8Array.from([0x80, 0x80, 0x01]),
      0,
    ),
    {
      number: 16_384,
      size: 3,
    },
  );
  assertEquals(
    variableByteIntegerToNum(
      Uint8Array.from([0xFF, 0xFF, 0x7F]),
      0,
    ),
    {
      number: 2_097_151,
      size: 3,
    },
  );
  assertEquals(
    variableByteIntegerToNum(
      Uint8Array.from([0x80, 0x80, 0x80, 0x01]),
      0,
    ),
    {
      number: 2_097_152,
      size: 4,
    },
  );
  assertEquals(
    variableByteIntegerToNum(
      Uint8Array.from([0xFF, 0xFF, 0xFF, 0x7F]),
      0,
    ),
    {
      number: 268_435_455,
      size: 4,
    },
  );
  assertThrows(() => variableByteIntegerToNum(Uint8Array.from([0xFF, 0xFF, 0xFF, 0xFF, 0x7F]), 0));
});

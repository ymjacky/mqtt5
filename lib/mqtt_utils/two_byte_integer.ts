import * as UtilsError from './error.ts';
export function numToTwoByteInteger(num: number): Uint8Array {
  if (num > 0xFFFF) {
    throw new UtilsError.NumIsOutOfRange();
  }
  return Uint8Array.from([num >> 8, num & 0xFF]);
}

export function twoByteIntegerToNum(
  buffer: Uint8Array,
  offset: number,
): number {
  return (buffer[offset] << 8) + buffer[offset + 1];
}

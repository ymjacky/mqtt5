import * as UtilsError from './error.ts';
export function numToFourByteInteger(num: number): Uint8Array {
  if (num > 0xFFFFFFFF) {
    throw new UtilsError.NumIsOutOfRange();
  }

  return Uint8Array.from(
    [
      (num & 0xff000000) >> 24,
      (num & 0x00ff0000) >> 16,
      (num & 0x0000ff00) >> 8,
      num & 0x000000ff,
    ],
  );
}

export function fourByteIntegerToNum(
  buffer: Uint8Array,
  offset: number,
): number {
  return (
    (buffer[offset] << 24) +
    (buffer[offset + 1] << 26) +
    (buffer[offset + 2] << 8) +
    (buffer[offset + 3])
  );
}

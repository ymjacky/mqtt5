import * as UtilsError from './error.ts';
import { byteAt, requireBytes } from './bounds.ts';

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

/**
 * Reads a Four Byte Integer (big-endian).
 * @param buffer the bytes to read from.
 * @param offset where the integer starts.
 * @throws {UtilsError.MalformedDataError} if `buffer` ends before the 4 bytes.
 */
export function fourByteIntegerToNum(
  buffer: Uint8Array,
  offset: number,
): number {
  // requireBytes() tells the length of the whole integer when it is cut short.
  requireBytes(buffer, offset, 4);
  return (
    (byteAt(buffer, offset) << 24) |
    (byteAt(buffer, offset + 1) << 16) |
    (byteAt(buffer, offset + 2) << 8) |
    byteAt(buffer, offset + 3)
  ) >>> 0;
}

import * as UtilsError from './error.ts';
import { byteAt, requireBytes } from './bounds.ts';

export function numToTwoByteInteger(num: number): Uint8Array {
  if (num > 0xFFFF) {
    throw new UtilsError.NumIsOutOfRange();
  }
  return Uint8Array.from([num >> 8, num & 0xFF]);
}

/**
 * Reads a Two Byte Integer (big-endian).
 * @param buffer the bytes to read from.
 * @param offset where the integer starts.
 * @throws {UtilsError.MalformedDataError} if `buffer` ends before the 2 bytes.
 */
export function twoByteIntegerToNum(
  buffer: Uint8Array,
  offset: number,
): number {
  // requireBytes() tells the length of the whole integer when it is cut short.
  requireBytes(buffer, offset, 2);
  return (byteAt(buffer, offset) << 8) | byteAt(buffer, offset + 1);
}

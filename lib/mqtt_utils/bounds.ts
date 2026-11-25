import { MalformedDataError } from './error.ts';

/**
 * Checks that `buffer` has `length` bytes from `offset`, before they are read. Reading past the end of a Uint8Array gives
 * `undefined`, which `<<` and `|` turn into 0, so a field cut short would be read as 0 without this check.
 * @throws {MalformedDataError} if `buffer` has fewer bytes: the field goes past the end of the packet, or of the part given
 * as `buffer` (e.g. the properties).
 */
export function requireBytes(buffer: Uint8Array, offset: number, length: number): void {
  const left = Math.max(buffer.length - offset, 0);
  if (length > left) {
    throw notEnoughBytes(buffer, offset, length);
  }
}

/**
 * Reads the byte at `offset`. An index past the end of a Uint8Array gives `undefined`: this checks it, as
 * {@link requireBytes} does for 1 byte.
 * @throws {MalformedDataError} if `buffer` ends before the byte.
 */
export function byteAt(buffer: Uint8Array, offset: number): number {
  const byte = buffer[offset];
  if (byte === undefined) {
    throw notEnoughBytes(buffer, offset, 1);
  }
  return byte;
}

function notEnoughBytes(buffer: Uint8Array, offset: number, length: number): MalformedDataError {
  const left = Math.max(buffer.length - offset, 0);
  return new MalformedDataError(`${length} bytes are needed at byte ${offset}, but only ${left} are left`);
}

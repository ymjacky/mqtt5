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
    throw new MalformedDataError(`${length} bytes are needed at byte ${offset}, but only ${left} are left`);
  }
}

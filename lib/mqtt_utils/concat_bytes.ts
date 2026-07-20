/**
 * Concatenates multiple byte chunks (Uint8Array or number[]) into a single Uint8Array.
 *
 * Note: Avoid `Uint8Array.from([...a, ...b])` or `array.push(...bytes)` for this purpose.
 * Spreading a large byte array as function arguments can throw
 * "RangeError: Maximum call stack size exceeded" once the array grows beyond
 * a few tens of thousands of elements (e.g. a large PUBLISH payload or Will payload).
 * This function copies each chunk with `Uint8Array#set()` instead, which has no such limit.
 *
 * The chunks are passed as a single array (not rest params) so that even the
 * number of chunks itself (e.g. many SUBSCRIBE entries) can never overflow the
 * call stack via argument spreading.
 */
export function concatBytes(chunks: (Uint8Array | number[])[]): Uint8Array {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

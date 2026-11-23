import { numToTwoByteInteger, twoByteIntegerToNum } from './two_byte_integer.ts';
import { concatBytes } from './concat_bytes.ts';
import { InvalidUtf8EncodedStringError } from './error.ts';
import { requireBytes } from './bounds.ts';

const encoder = new TextEncoder();

/**
 * Decodes UTF-8 as MQTT requires: ill-formed UTF-8, including the encodings of U+D800 to U+DFFF, throws instead of
 * becoming U+FFFD, because it is a Malformed Packet [MQTT-1.5.4-1]; and 0xEF 0xBB 0xBF is U+FEFF wherever it appears, so a
 * leading one is kept instead of being stripped as a BOM [MQTT-1.5.4-3]. MQTT 3.1.1 has the same rules ([MQTT-1.5.3-1],
 * [MQTT-1.5.3-3]).
 */
const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * Decodes Binary Data that this library handles as a string. The rules of UTF-8 Encoded Strings do not apply to it, so
 * ill-formed bytes still become U+FFFD; a leading 0xEF 0xBB 0xBF is kept as U+FEFF.
 */
const binaryDataDecoder = new TextDecoder('utf-8', { ignoreBOM: true });

export function stringToUtfEncodedString(str: string): Uint8Array {
  const bytes: Uint8Array = encoder.encode(str);
  return concatBytes([numToTwoByteInteger(bytes.length), bytes]);
}

export function stringToBytes(str: string): Uint8Array {
  return encoder.encode(str);
}

/**
 * Reads a UTF-8 Encoded String: a Two Byte Integer length followed by that many bytes of UTF-8.
 * @param buffer the bytes to read from.
 * @param offset where the length starts.
 * @returns the string, and the number of bytes read including the length.
 * @throws {MalformedDataError} if `buffer` ends before the length or the string.
 * @throws {InvalidUtf8EncodedStringError} if the bytes are ill-formed UTF-8 or contain U+0000, which makes the packet a
 * Malformed Packet ([MQTT-1.5.4-1], [MQTT-1.5.4-2]; MQTT 3.1.1: [MQTT-1.5.3-1], [MQTT-1.5.3-2]).
 */
export function utfEncodedStringToString(
  buffer: Uint8Array,
  offset: number,
): { length: number; value: string } {
  const { length, bytes } = readLengthPrefixed(buffer, offset);

  let value: string;
  try {
    value = utf8Decoder.decode(bytes);
  } catch (err) {
    throw new InvalidUtf8EncodedStringError('it is not well-formed UTF-8', { cause: err });
  }
  if (value.includes('\u0000')) {
    throw new InvalidUtf8EncodedStringError('it contains U+0000');
  }

  return { length, value };
}

/**
 * Reads Binary Data (a Two Byte Integer length followed by that many bytes) as a string, for the Password, which this
 * library handles as a string. Binary Data may be any bytes, so it is not checked like a UTF-8 Encoded String.
 * @param buffer the bytes to read from.
 * @param offset where the length starts.
 * @returns the string, and the number of bytes read including the length.
 * @throws {MalformedDataError} if `buffer` ends before the length or the data.
 */
export function binaryDataToString(
  buffer: Uint8Array,
  offset: number,
): { length: number; value: string } {
  const { length, bytes } = readLengthPrefixed(buffer, offset);
  return { length, value: binaryDataDecoder.decode(bytes) };
}

/**
 * Reads a Two Byte Integer length and the bytes after it. `length` includes the 2 bytes of the length.
 * @throws {MalformedDataError} if `buffer` ends before the length or the bytes.
 */
function readLengthPrefixed(buffer: Uint8Array, offset: number): { length: number; bytes: Uint8Array } {
  const dataLength = twoByteIntegerToNum(buffer, offset);
  const start = offset + 2; // 2 = Two Byte Integer
  requireBytes(buffer, start, dataLength);
  return { length: dataLength + 2, bytes: buffer.subarray(start, start + dataLength) };
}

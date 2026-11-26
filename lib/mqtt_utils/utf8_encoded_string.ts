import { numToTwoByteInteger, twoByteIntegerToNum } from './two_byte_integer.ts';
import { concatBytes } from './concat_bytes.ts';
import { InvalidUtf8EncodedStringError, UnencodableStringError } from './error.ts';
import { requireBytes } from './bounds.ts';

/** The maximum length in bytes of a UTF-8 Encoded String and of Binary Data: their length is a Two Byte Integer. */
const maxDataLength = 0xFFFF;

const encoder = new TextEncoder();

/**
 * Matches a lone surrogate: a code unit from U+D800 to U+DFFF that is not part of a surrogate pair. With the `u` flag, a pair
 * is one code point, so it does not match. (`String.prototype.isWellFormed()` does the same, but needs newer browsers.)
 */
const loneSurrogate = /[\uD800-\uDFFF]/u;

/**
 * Decodes UTF-8 as MQTT requires: ill-formed UTF-8, including the encodings of U+D800 to U+DFFF, throws instead of
 * becoming U+FFFD, because it is a Malformed Packet [MQTT-1.5.4-1]; and 0xEF 0xBB 0xBF is U+FEFF wherever it appears, so a
 * leading one is kept instead of being stripped as a BOM [MQTT-1.5.4-3]. MQTT 3.1.1 has the same rules ([MQTT-1.5.3-1],
 * [MQTT-1.5.3-3]).
 */
const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * Decodes Binary Data as a string. The rules of UTF-8 Encoded Strings do not apply to it, so ill-formed bytes still become
 * U+FFFD; a leading 0xEF 0xBB 0xBF is kept as U+FEFF.
 */
const binaryDataDecoder = new TextDecoder('utf-8', { ignoreBOM: true });

/**
 * Finds the first lone surrogate of a string. UTF-8 cannot encode a lone surrogate [MQTT-1.5.4-1]: TextEncoder puts U+FFFD
 * in its place, so the string that is sent would not be the one that was given.
 * @returns the index of the lone surrogate, or -1 if the string has none.
 */
export function indexOfLoneSurrogate(str: string): number {
  return str.search(loneSurrogate);
}

/**
 * Encodes a string as UTF-8, without putting U+FFFD in place of a lone surrogate.
 * @throws {UnencodableStringError} if the string has a lone surrogate.
 */
function encodeUtf8(str: string): Uint8Array {
  const index = indexOfLoneSurrogate(str);
  if (index !== -1) {
    throw new UnencodableStringError(`it has a lone surrogate at index ${index}`);
  }
  return encoder.encode(str);
}

/**
 * Encodes a UTF-8 Encoded String: a Two Byte Integer length followed by the UTF-8 bytes. The string must follow the rules of
 * MQTT, which the decoder checks too, so that a packet of any type, sent by a client or by a broker, carries the string that
 * was given. MQTT 3.1.1 has the same rules ([MQTT-1.5.3-1], [MQTT-1.5.3-2]).
 * @throws {UnencodableStringError} if the string has a lone surrogate, which UTF-8 cannot encode [MQTT-1.5.4-1].
 * @throws {InvalidUtf8EncodedStringError} if the string contains U+0000 [MQTT-1.5.4-2], or is longer than 65,535 bytes in UTF-8.
 */
export function stringToUtfEncodedString(str: string): Uint8Array {
  if (str.includes('\u0000')) {
    throw new InvalidUtf8EncodedStringError('it contains U+0000');
  }
  const bytes = encodeUtf8(str);
  if (bytes.length > maxDataLength) {
    throw new InvalidUtf8EncodedStringError(`it is ${bytes.length} bytes long in UTF-8, longer than ${maxDataLength} bytes`);
  }
  return concatBytes([numToTwoByteInteger(bytes.length), bytes]);
}

/**
 * Encodes Binary Data: a Two Byte Integer length followed by the bytes. A string is encoded as UTF-8 first. U+0000 is allowed,
 * as Binary Data may be any bytes.
 * @throws {UnencodableStringError} if a string has a lone surrogate, which UTF-8 cannot encode.
 * @throws {NumIsOutOfRange} if the data is longer than 65,535 bytes.
 */
export function toBinaryData(data: string | Uint8Array): Uint8Array {
  const bytes = typeof data === 'string' ? encodeUtf8(data) : data;
  return concatBytes([numToTwoByteInteger(bytes.length), bytes]);
}

/**
 * Encodes a string as UTF-8 with TextEncoder: a lone surrogate becomes U+FFFD. Check the string first with
 * {@link indexOfLoneSurrogate} when that must not happen.
 */
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
 * Reads Binary Data (a Two Byte Integer length followed by that many bytes) as a string, for data known to be text. Binary
 * Data may be any bytes, so it is not checked like a UTF-8 Encoded String. The packet decoders read Binary Data as bytes.
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

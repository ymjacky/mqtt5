import { MalformedDataError } from './error.ts';
import { requireBytes } from './bounds.ts';
import { twoByteIntegerToNum } from './two_byte_integer.ts';
import { fourByteIntegerToNum } from './four_byte_integer.ts';
import { variableByteIntegerToNum } from './variable_byte_integer.ts';
import { binaryDataToString, utfEncodedStringToString } from './utf8_encoded_string.ts';

/**
 * Reads the fields of a received packet in order, with the data types of MQTT (MQTT 5.0 1.5), and remembers where it is.
 * The values are read by the functions of this module (e.g. {@link twoByteIntegerToNum}): the reader moves past them.
 *
 * It reads only its own bytes: a field that goes past the end throws {@link MalformedDataError}, instead of being read as
 * `undefined`, which `<<` and `|` turn into 0. A reader of the properties ({@link ByteReader.readSub}) cannot read past
 * the Property Length either.
 */
export class ByteReader {
  readonly #bytes: Uint8Array;
  #pos = 0;

  /**
   * Reads the first `length` bytes of `bytes`.
   * @throws {MalformedDataError} if `bytes` has fewer than `length` bytes.
   */
  constructor(bytes: Uint8Array, length: number = bytes.length) {
    if (length > bytes.length) {
      throw new MalformedDataError(`${length} bytes are needed, but only ${bytes.length} are there`);
    }
    this.#bytes = bytes.subarray(0, length);
  }

  /** The number of bytes that are left to read. */
  get remaining(): number {
    return this.#bytes.length - this.#pos;
  }

  /** Reads a Byte. */
  readByte(): number {
    requireBytes(this.#bytes, this.#pos, 1);
    return this.#bytes[this.#pos++];
  }

  /** Reads a Two Byte Integer (big-endian). */
  readTwoByteInteger(): number {
    const value = twoByteIntegerToNum(this.#bytes, this.#pos);
    this.#pos += 2;
    return value;
  }

  /** Reads a Four Byte Integer (big-endian). */
  readFourByteInteger(): number {
    const value = fourByteIntegerToNum(this.#bytes, this.#pos);
    this.#pos += 4;
    return value;
  }

  /**
   * Reads a Variable Byte Integer.
   * @throws {MalformedDataError} if it is longer than 4 bytes.
   */
  readVariableByteInteger(): number {
    const { number, size } = variableByteIntegerToNum(this.#bytes, this.#pos);
    this.#pos += size;
    return number;
  }

  /** Reads `length` bytes. The returned bytes are a copy. */
  readBytes(length: number): Uint8Array {
    requireBytes(this.#bytes, this.#pos, length);
    const bytes = this.#bytes.slice(this.#pos, this.#pos + length);
    this.#pos += length;
    return bytes;
  }

  /** Reads Binary Data: a Two Byte Integer length and that many bytes. The returned bytes are a copy. */
  readBinaryData(): Uint8Array {
    return this.readBytes(this.readTwoByteInteger());
  }

  /**
   * Reads a UTF-8 Encoded String: a Two Byte Integer length and that many bytes of UTF-8.
   * @throws {InvalidUtf8EncodedStringError} if the bytes are ill-formed UTF-8 or contain U+0000.
   */
  readUtf8EncodedString(): string {
    const { length, value } = utfEncodedStringToString(this.#bytes, this.#pos);
    this.#pos += length;
    return value;
  }

  /** Reads Binary Data as a string, for the Password, which this library handles as a string. The bytes are not checked. */
  readBinaryDataAsString(): string {
    const { length, value } = binaryDataToString(this.#bytes, this.#pos);
    this.#pos += length;
    return value;
  }

  /** Reads the next `length` bytes as a reader of their own, e.g. the properties after their Property Length. */
  readSub(length: number): ByteReader {
    requireBytes(this.#bytes, this.#pos, length);
    const sub = new ByteReader(this.#bytes.subarray(this.#pos, this.#pos + length));
    this.#pos += length;
    return sub;
  }

  /** Reads all the bytes that are left, e.g. the payload of PUBLISH. The returned bytes are a copy. */
  readRest(): Uint8Array {
    return this.readBytes(this.remaining);
  }

  /**
   * Checks that every byte has been read.
   * @param what what was read, used in the error message, e.g. `PUBACK`.
   * @throws {MalformedDataError} if bytes are left.
   */
  expectEnd(what: string): void {
    if (this.remaining > 0) {
      throw new MalformedDataError(`${this.remaining} bytes are left after the last field of ${what}`);
    }
  }
}

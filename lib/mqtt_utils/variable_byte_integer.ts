import * as UtilsError from './error.ts';
import { requireBytes } from './bounds.ts';

/** The largest Variable Byte Integer. It is also the largest Remaining Length. */
export const maxVariableByteInteger = 268_435_455;

export function numToVariableByteInteger(num: number): Uint8Array {
  if (num > maxVariableByteInteger || num < 0) {
    throw new UtilsError.NumIsOutOfRange();
  }

  const array = [];

  do {
    let byte = num % 128;
    num = Math.floor(num / 128);

    if (num > 0) {
      // flag first bit
      byte = byte | 0b10000000;
    }

    array.push(byte);
  } while (num > 0);

  return new Uint8Array(array);
}

/**
 * Encodes the Remaining Length of a fixed header.
 * @throws {UtilsError.RemainingLengthError} if it is larger than 268,435,455 bytes, the largest MQTT allows.
 */
export function remainingLengthToBytes(remainingLength: number): Uint8Array {
  if (remainingLength > maxVariableByteInteger) {
    throw new UtilsError.RemainingLengthError(`${remainingLength} is larger than ${maxVariableByteInteger}, the largest MQTT allows`);
  }
  return numToVariableByteInteger(remainingLength);
}

/** The most bytes a Variable Byte Integer may have (MQTT 5.0 1.5.5). */
const maxVariableByteIntegerBytes = 4;

/**
 * Reads a Variable Byte Integer.
 * @param buffer the bytes to read from.
 * @param offset where the integer starts.
 * @returns the value (`number`), and the number of bytes it takes (`size`).
 * @throws {UtilsError.MalformedDataError} if `buffer` ends before its last byte, or it is longer than 4 bytes.
 */
export function variableByteIntegerToNum(buffer: Uint8Array, offset: number): { number: number; size: number } {
  let value = 0;
  let multiplier = 1;
  for (let i = 0; i < maxVariableByteIntegerBytes; i++) {
    requireBytes(buffer, offset + i, 1);
    const byte = buffer[offset + i];
    value += (byte & 0b01111111) * multiplier;
    if ((byte & 0b10000000) === 0) {
      return { number: value, size: i + 1 };
    }
    multiplier *= 128;
  }
  throw new UtilsError.MalformedDataError(`the Variable Byte Integer at byte ${offset} is longer than ${maxVariableByteIntegerBytes} bytes`);
}

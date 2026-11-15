import * as UtilsError from './error.ts';

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

export function variableByteIntegerToNum(buffer: Uint8Array, offset: number) {
  let i = offset;
  let byte = 0;
  let value = 0;
  let multiplier = 1;

  do {
    byte = buffer[i++];

    value += (byte & 0b01111111) * multiplier;

    if (multiplier > 128 * 128 * 128) {
      throw new UtilsError.InvalidVariableByteInteger();
    }

    multiplier *= 128;
  } while ((byte & 0b10000000) != 0);

  return { number: value, size: i - offset };
}

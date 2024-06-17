import * as UtilsError from './error.ts';

export function numToVariableByteInteger(num: number): Uint8Array {
  if (num > 268_435_455 || num < 0) {
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

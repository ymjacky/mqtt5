import { numToTwoByteInteger, twoByteIntegerToNum } from './two_byte_integer.ts';

export function stringToUtfEncodedString(str: string): Uint8Array {
  const bytes: Uint8Array = new TextEncoder().encode(str);
  return new Uint8Array([...numToTwoByteInteger(bytes.length), ...bytes]);
}

export function stringToBytes(str: string): Uint8Array {
  const bytes: Uint8Array = new TextEncoder().encode(str);
  return new Uint8Array([...bytes]);
}

export function utfEncodedStringToString(
  buffer: Uint8Array,
  offset: number,
) {
  // console.log(`utfEncodedStringToString buffer: ${buffer}, offset = ${offset}`);

  let pos = offset;
  const length = twoByteIntegerToNum(buffer, offset);
  // console.log(`utfEncodedStringToString target length: ${length}`);
  pos += 2; // 2 = two Byte Interger

  const bytes = buffer.slice(pos, pos + length);

  const value = new TextDecoder().decode(bytes);
  // console.log(`utfEncodedStringToString target value: ${value}`);

  return {
    length: length + 2, // 2 = two Byte Interger
    value,
  };
}

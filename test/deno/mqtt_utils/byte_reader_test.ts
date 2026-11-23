import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import { ByteReader, MqttUtilsError } from '../../../lib/mqtt_utils/mod.ts';

// The values are read by twoByteIntegerToNum() and the other functions of mqtt_utils, which have their own tests. These
// tests check that the reader moves past each field, and reads only its own bytes.

const { MalformedDataError } = MqttUtilsError;

function reader(bytes: number[]): ByteReader {
  return new ByteReader(new Uint8Array(bytes));
}

Deno.test('ByteReader reads the fields in order and moves past each of them', () => {
  const r = reader([
    0x7F, // Byte
    0x01,
    0x2C, // Two Byte Integer
    0x00,
    0x00,
    0x01,
    0x2C, // Four Byte Integer
    0x80,
    0x01, // Variable Byte Integer (2 bytes)
    0x00,
    0x03,
    0x61,
    0x2F,
    0x62, // UTF-8 Encoded String
    0x00,
    0x02,
    0xFF,
    0x00, // Binary Data as a string
    0x00,
    0x01,
    0x09, // Binary Data
    0x0A,
    0x0B, // the rest
  ]);
  assertEquals(r.remaining, 23);
  assertEquals(r.readByte(), 0x7F);
  assertEquals(r.readTwoByteInteger(), 300);
  assertEquals(r.readFourByteInteger(), 300);
  assertEquals(r.readVariableByteInteger(), 128);
  assertEquals(r.readUtf8EncodedString(), 'a/b');
  // Binary Data is not checked as UTF-8.
  assertEquals(r.readBinaryDataAsString(), '\u{FFFD}\u0000');
  assertEquals(r.readBinaryData(), new Uint8Array([0x09]));
  assertEquals(r.remaining, 2);
  assertEquals(r.readRest(), new Uint8Array([0x0A, 0x0B]));
  assertEquals(r.remaining, 0);
  assertEquals(r.readRest(), new Uint8Array(0));
  r.expectEnd('the test');
});

Deno.test('ByteReader throws instead of reading past its end', () => {
  const cases: [string, number[], (r: ByteReader) => unknown][] = [
    ['a Byte', [], (r) => r.readByte()],
    ['a Two Byte Integer', [0x01], (r) => r.readTwoByteInteger()],
    ['a Four Byte Integer', [0x01, 0x02, 0x03], (r) => r.readFourByteInteger()],
    ['a Variable Byte Integer with the continuation bit at the end', [0x80, 0x80], (r) => r.readVariableByteInteger()],
    ['bytes', [0x01, 0x02], (r) => r.readBytes(3)],
    ['Binary Data longer than the rest', [0x00, 0x03, 0x01, 0x02], (r) => r.readBinaryData()],
    ['a UTF-8 Encoded String longer than the rest', [0x00, 0x0A, 0x61, 0x62, 0x63], (r) => r.readUtf8EncodedString()],
    ['Binary Data as a string longer than the rest', [0x00, 0x02, 0x61], (r) => r.readBinaryDataAsString()],
    ['a sub reader longer than the rest', [0x01, 0x02], (r) => r.readSub(3)],
  ];
  for (const [name, bytes, read] of cases) {
    assertThrows(() => read(reader(bytes)), MalformedDataError, 'are needed', name);
  }
  assertThrows(() => reader([0xFF, 0xFF, 0xFF, 0xFF, 0x7F]).readVariableByteInteger(), MalformedDataError, 'longer than 4 bytes');
});

Deno.test('ByteReader reads only the given length of the bytes', () => {
  // The bytes after the length are not read.
  const r = new ByteReader(new Uint8Array([0x01, 0x02, 0x03]), 2);
  assertEquals(r.remaining, 2);
  assertEquals(r.readTwoByteInteger(), 0x0102);
  assertThrows(() => r.readByte(), MalformedDataError);
  // A length longer than the bytes is a packet cut short.
  assertThrows(() => new ByteReader(new Uint8Array([0x01, 0x02]), 3), MalformedDataError, '3 bytes are needed, but only 2 are there');
});

Deno.test('ByteReader reads a part as a sub reader that cannot read past it', () => {
  const r = reader([0x02, 0x11, 0x22, 0x33]);
  const sub = r.readSub(r.readByte());
  // The reader skips the part.
  assertEquals(r.remaining, 1);
  assertEquals(sub.remaining, 2);
  assertEquals(sub.readByte(), 0x11);
  // 0x33 is after the part: the sub reader does not read it.
  assertThrows(() => sub.readTwoByteInteger(), MalformedDataError, '2 bytes are needed at byte 1, but only 1 are left');
  assertEquals(r.readByte(), 0x33);
});

Deno.test('ByteReader returns copies of the bytes it reads', () => {
  const bytes = new Uint8Array([0x00, 0x02, 0x61, 0x62, 0x63, 0x64]);
  const r = new ByteReader(bytes);
  const data = r.readBinaryData();
  const rest = r.readRest();
  // Changing the received bytes does not change what was read.
  bytes.fill(0);
  assertEquals(data, new Uint8Array([0x61, 0x62]));
  assertEquals(rest, new Uint8Array([0x63, 0x64]));
});

Deno.test('ByteReader.expectEnd throws if bytes are left', () => {
  const r = reader([0x01, 0x02, 0x03]);
  r.readByte();
  assertThrows(() => r.expectEnd('PUBACK'), MalformedDataError, '2 bytes are left after the last field of PUBACK');
});

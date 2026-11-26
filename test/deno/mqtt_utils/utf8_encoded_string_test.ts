import { assertEquals, assertThrows } from '@std/assert';
import {
  binaryDataToString,
  indexOfLoneSurrogate,
  MqttUtilsError,
  stringToBytes,
  stringToUtfEncodedString,
  toBinaryData,
  utfEncodedStringToString,
} from '../../../lib/mqtt_utils/mod.ts';

/** The bytes of a UTF-8 Encoded String or of Binary Data: a Two Byte Integer length and the data. */
function lengthPrefixed(data: number[]): number[] {
  return [data.length >> 8, data.length & 0xFF, ...data];
}

Deno.test('utfEncodedStringToString reads the length and the string', () => {
  assertEquals(utfEncodedStringToString(new Uint8Array(lengthPrefixed([0x61, 0x2F, 0x62])), 0), { length: 5, value: 'a/b' });
  assertEquals(utfEncodedStringToString(new Uint8Array(lengthPrefixed([])), 0), { length: 2, value: '' });
  // 'あ' is 3 bytes and U+1F600 is 4 bytes in UTF-8.
  assertEquals(
    utfEncodedStringToString(new Uint8Array(lengthPrefixed([0xE3, 0x81, 0x82, 0xF0, 0x9F, 0x98, 0x80])), 0),
    { length: 9, value: 'あ\u{1F600}' },
  );
  // offset: bytes before the string and after it are not read.
  assertEquals(utfEncodedStringToString(new Uint8Array([0xEE, ...lengthPrefixed([0x61]), 0xFF]), 1), { length: 3, value: 'a' });
});

Deno.test('utfEncodedStringToString keeps 0xEF 0xBB 0xBF as U+FEFF, also at the start [MQTT-1.5.4-3]', () => {
  assertEquals(utfEncodedStringToString(new Uint8Array(lengthPrefixed([0xEF, 0xBB, 0xBF, 0x61])), 0), { length: 6, value: '\u{FEFF}a' });
  assertEquals(utfEncodedStringToString(new Uint8Array(lengthPrefixed([0x61, 0xEF, 0xBB, 0xBF])), 0), { length: 6, value: 'a\u{FEFF}' });
  assertEquals(utfEncodedStringToString(new Uint8Array(lengthPrefixed([0xEF, 0xBB, 0xBF])), 0), { length: 5, value: '\u{FEFF}' });
  // A string that starts with U+FEFF is read back as it was sent.
  assertEquals(utfEncodedStringToString(stringToUtfEncodedString('\u{FEFF}topic'), 0).value, '\u{FEFF}topic');
});

Deno.test('utfEncodedStringToString throws for ill-formed UTF-8 instead of returning U+FFFD [MQTT-1.5.4-1]', () => {
  const cases: [string, number[]][] = [
    ['an invalid byte', [0xFF, 0x61]],
    ['a continuation byte without a lead byte', [0x80]],
    ['an encoded surrogate (U+D800)', [0xED, 0xA0, 0x80]],
    ['an encoded surrogate (U+DFFF)', [0xED, 0xBF, 0xBF]],
    ['an overlong encoding of U+0000', [0xC0, 0x80]],
    ['an overlong encoding of /', [0xE0, 0x80, 0xAF]],
    ['a code point above U+10FFFF', [0xF4, 0x90, 0x80, 0x80]],
    ['a character cut at the end', [0x61, 0xE3, 0x81]],
  ];
  for (const [name, data] of cases) {
    assertThrows(
      () => utfEncodedStringToString(new Uint8Array(lengthPrefixed(data)), 0),
      MqttUtilsError.InvalidUtf8EncodedStringError,
      'not well-formed UTF-8',
      name,
    );
  }
});

Deno.test('utfEncodedStringToString throws for U+0000 [MQTT-1.5.4-2]', () => {
  for (const data of [[0x00], [0x61, 0x00], [0x00, 0x61]]) {
    assertThrows(
      () => utfEncodedStringToString(new Uint8Array(lengthPrefixed(data)), 0),
      MqttUtilsError.InvalidUtf8EncodedStringError,
      'U+0000',
      JSON.stringify(data),
    );
  }
});

Deno.test('binaryDataToString reads any bytes: the rules of UTF-8 Encoded Strings do not apply to Binary Data', () => {
  assertEquals(binaryDataToString(new Uint8Array(lengthPrefixed([0x70, 0x77])), 0), { length: 4, value: 'pw' });
  assertEquals(binaryDataToString(new Uint8Array(lengthPrefixed([0x61, 0x00])), 0), { length: 4, value: 'a\u0000' });
  // Bytes that are not UTF-8 become U+FFFD: binaryDataToString() is for data known to be text. The decoders read bytes.
  assertEquals(binaryDataToString(new Uint8Array(lengthPrefixed([0xFF, 0x61])), 0), { length: 4, value: '\u{FFFD}a' });
  // A leading 0xEF 0xBB 0xBF is kept.
  assertEquals(binaryDataToString(new Uint8Array(lengthPrefixed([0xEF, 0xBB, 0xBF, 0x61])), 0), { length: 6, value: '\u{FEFF}a' });
  // offset
  assertEquals(binaryDataToString(new Uint8Array([0xEE, 0xEE, ...lengthPrefixed([0x78])]), 2), { length: 3, value: 'x' });
});

Deno.test('utfEncodedStringToString and binaryDataToString throw instead of reading past the end of the buffer', () => {
  const cases: [string, number[]][] = [
    ['the length cut', [0x00]],
    // The length is 10, but the buffer ends after 'abc': it was read as 'abc'.
    ['the data shorter than its length', [0x00, 0x0A, 0x61, 0x62, 0x63]],
  ];
  for (const [name, bytes] of cases) {
    for (const read of [utfEncodedStringToString, binaryDataToString]) {
      assertThrows(() => read(new Uint8Array(bytes), 0), MqttUtilsError.MalformedDataError, 'are needed', `${read.name}: ${name}`);
    }
  }
});

/** Strings with a lone surrogate, and the index of the first one. */
const loneSurrogates: [string, number][] = [
  ['a\uD800', 1],
  ['\uDC00a', 0],
  ['a\uDE00\uD83Db', 1],
  ['\u{1F600}\uDBFF', 2],
  ['😀\uD800', 2],
];

Deno.test('indexOfLoneSurrogate finds the first lone surrogate, and not a surrogate pair', () => {
  for (const [str, index] of loneSurrogates) {
    assertEquals(indexOfLoneSurrogate(str), index, JSON.stringify(str));
  }
  for (const str of ['', 'abc', '\u{1F600}', 'a😀b', '\u0000', '\u{FEFF}', '\u{FFFD}']) {
    assertEquals(indexOfLoneSurrogate(str), -1, JSON.stringify(str));
  }
});

Deno.test('stringToUtfEncodedString encodes the length and the UTF-8 bytes', () => {
  assertEquals(stringToUtfEncodedString('a/b'), new Uint8Array(lengthPrefixed([0x61, 0x2F, 0x62])));
  assertEquals(stringToUtfEncodedString(''), new Uint8Array(lengthPrefixed([])));
  // A surrogate pair is one code point: U+1F600 is 4 bytes in UTF-8.
  assertEquals(stringToUtfEncodedString('あ\u{1F600}'), new Uint8Array(lengthPrefixed([0xE3, 0x81, 0x82, 0xF0, 0x9F, 0x98, 0x80])));
  // U+FEFF is encoded wherever it is, also at the start [MQTT-1.5.4-3].
  assertEquals(stringToUtfEncodedString('\u{FEFF}a'), new Uint8Array(lengthPrefixed([0xEF, 0xBB, 0xBF, 0x61])));
  // 65,535 bytes is the most: 21,845 characters of 3 bytes.
  const longest = stringToUtfEncodedString('あ'.repeat(21_845));
  assertEquals(longest.length, 2 + 65_535);
  assertEquals([...longest.subarray(0, 2)], [0xFF, 0xFF]);
});

Deno.test('stringToUtfEncodedString throws for U+0000 [MQTT-1.5.4-2]', () => {
  for (const str of ['\u0000', 'a\u0000', '\u0000a']) {
    assertThrows(() => stringToUtfEncodedString(str), MqttUtilsError.InvalidUtf8EncodedStringError, 'U+0000', JSON.stringify(str));
  }
});

Deno.test('stringToUtfEncodedString throws for a lone surrogate instead of sending U+FFFD [MQTT-1.5.4-1]', () => {
  for (const [str, index] of loneSurrogates) {
    assertThrows(
      () => stringToUtfEncodedString(str),
      MqttUtilsError.UnencodableStringError,
      `lone surrogate at index ${index}`,
      JSON.stringify(str),
    );
  }
});

Deno.test('stringToUtfEncodedString throws for a string longer than 65,535 bytes in UTF-8', () => {
  // 65,536 characters of 1 byte, and 21,846 characters of 3 bytes (65,538 bytes).
  for (const str of ['a'.repeat(65_536), 'あ'.repeat(21_846)]) {
    assertThrows(() => stringToUtfEncodedString(str), MqttUtilsError.InvalidUtf8EncodedStringError, 'longer than 65535 bytes');
  }
});

Deno.test('toBinaryData encodes the length and the bytes, a string as UTF-8 with U+0000 allowed', () => {
  assertEquals(toBinaryData(new Uint8Array([0xFF, 0x00, 0xED, 0xA0, 0x80])), new Uint8Array(lengthPrefixed([0xFF, 0x00, 0xED, 0xA0, 0x80])));
  assertEquals(toBinaryData(new Uint8Array(0)), new Uint8Array(lengthPrefixed([])));
  // The rules of UTF-8 Encoded Strings do not apply to Binary Data: U+0000 is sent as 0x00.
  assertEquals(toBinaryData('p\u0000w'), new Uint8Array(lengthPrefixed([0x70, 0x00, 0x77])));
  assertEquals(toBinaryData('\u{FEFF}\u{1F600}'), new Uint8Array(lengthPrefixed([0xEF, 0xBB, 0xBF, 0xF0, 0x9F, 0x98, 0x80])));
  assertEquals(toBinaryData(''), new Uint8Array(lengthPrefixed([])));
  assertEquals(toBinaryData(new Uint8Array(65_535)).length, 2 + 65_535);
  assertEquals(toBinaryData('a'.repeat(65_535)).length, 2 + 65_535);
});

Deno.test('toBinaryData throws for a string with a lone surrogate, and for more than 65,535 bytes', () => {
  for (const [str, index] of loneSurrogates) {
    assertThrows(() => toBinaryData(str), MqttUtilsError.UnencodableStringError, `lone surrogate at index ${index}`, JSON.stringify(str));
  }
  assertThrows(() => toBinaryData(new Uint8Array(65_536)), MqttUtilsError.NumIsOutOfRange);
  assertThrows(() => toBinaryData('a'.repeat(65_536)), MqttUtilsError.NumIsOutOfRange);
});

Deno.test('stringToBytes still puts U+FFFD in place of a lone surrogate: its callers check the string first', () => {
  assertEquals(stringToBytes('a\uD800'), new Uint8Array([0x61, 0xEF, 0xBF, 0xBD]));
  assertEquals(stringToBytes('p\u0000'), new Uint8Array([0x70, 0x00]));
});

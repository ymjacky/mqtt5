import { assertEquals, assertThrows } from 'std/assert/mod.ts';
import { binaryDataToString, MqttUtilsError, stringToUtfEncodedString, utfEncodedStringToString } from '../../../lib/mqtt_utils/mod.ts';

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
  assertEquals(utfEncodedStringToString(new Uint8Array(lengthPrefixed([0xEF, 0xBB, 0xBF, 0x61])), 0), { length: 6, value: '﻿a' });
  assertEquals(utfEncodedStringToString(new Uint8Array(lengthPrefixed([0x61, 0xEF, 0xBB, 0xBF])), 0), { length: 6, value: 'a﻿' });
  assertEquals(utfEncodedStringToString(new Uint8Array(lengthPrefixed([0xEF, 0xBB, 0xBF])), 0), { length: 5, value: '﻿' });
  // A string that starts with U+FEFF is read back as it was sent.
  assertEquals(utfEncodedStringToString(stringToUtfEncodedString('﻿topic'), 0).value, '﻿topic');
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
  // Bytes that are not UTF-8 become U+FFFD, as before: the Password is handled as a string.
  assertEquals(binaryDataToString(new Uint8Array(lengthPrefixed([0xFF, 0x61])), 0), { length: 4, value: '�a' });
  // A leading 0xEF 0xBB 0xBF is kept.
  assertEquals(binaryDataToString(new Uint8Array(lengthPrefixed([0xEF, 0xBB, 0xBF, 0x61])), 0), { length: 6, value: '﻿a' });
  // offset
  assertEquals(binaryDataToString(new Uint8Array([0xEE, 0xEE, ...lengthPrefixed([0x78])]), 2), { length: 3, value: 'x' });
});

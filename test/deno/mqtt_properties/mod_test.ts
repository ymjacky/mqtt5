import { assertEquals, assertThrows } from '@std/assert';
import { parseMqttProperties, propertiesToBytes, UnsupportedPropertyError } from '../../../lib/mqtt_properties/mod.ts';
import { testPropertyCases } from './test_helper.ts';

// Tests across property types. Each type has its own test file in this directory.

testPropertyCases([
  {
    name: 'userProperties and subscriptionIdentifiers interleaved',
    decode: {
      userProperties: [
        { key: 'a', val: '1' },
        { key: 'a', val: '2' },
      ],
      subscriptionIdentifiers: [1, 42],
    },
    bytes: [
      ...[0x26, 0x00, 0x01, 0x61, 0x00, 0x01, 0x31], // a=1
      ...[0x0B, 0x01], // 1
      ...[0x26, 0x00, 0x01, 0x61, 0x00, 0x01, 0x32], // a=2
      ...[0x0B, 0x2A], // 42
    ],
  },
]);

Deno.test('encodeProperties undefined', function () {
  assertEquals(propertiesToBytes(undefined), new Uint8Array([0x00]));
});

Deno.test('encodeProperties empty', function () {
  assertEquals(propertiesToBytes({}), new Uint8Array([0x00]));
  assertEquals(propertiesToBytes({ userProperties: [], subscriptionIdentifiers: [] }), new Uint8Array([0x00]));
});

Deno.test('decodeProperties empty', function () {
  assertEquals(parseMqttProperties(new Uint8Array([]), 0, 0), {});
});

Deno.test('decodeProperties unsupported property identifier', function () {
  // 0x04 is not a property identifier of MQTT 5.0.
  assertThrows(
    () => parseMqttProperties(new Uint8Array([0x04, 0x00]), 0, 2),
    UnsupportedPropertyError,
    'unsupported property. propertyId: 4',
  );
});

import { assertEquals, assertThrows } from '@std/assert';
import { InvalidPropertyValueError, parseMqttProperties, type Properties, propertiesToBytes } from '../../../lib/mqtt_properties/mod.ts';

// The encoder checks the value of every integer property: it must be an integer that its type can hold, and one that
// MQTT 5.0 allows. Another value would be sent as another one (-1 as the largest value, 1.5 as 1), would be left out
// (0 was not encoded for some properties), or would be a Protocol Error for the receiver (a Maximum QoS of 2).

/** The integer properties: the key, the property identifier as it appears in the message, and the range of the value. */
const integerProperties: [keyof Properties, string, number, number][] = [
  ['payloadFormatIndicator', '0x01', 0, 1],
  ['messageExpiryInterval', '0x02', 0, 0xFFFF_FFFF],
  ['subscriptionIdentifier', '0x0b', 1, 268_435_455], // 0 is a Protocol Error (MQTT 5.0 3.8.2.1.2)
  ['sessionExpiryInterval', '0x11', 0, 0xFFFF_FFFF],
  ['serverKeepAlive', '0x13', 0, 0xFFFF],
  ['willDelayInterval', '0x18', 0, 0xFFFF_FFFF],
  ['receiveMaximum', '0x21', 1, 0xFFFF], // 0 is a Protocol Error (MQTT 5.0 3.1.2.11.3, 3.2.2.3.3)
  ['topicAliasMaximum', '0x22', 0, 0xFFFF],
  ['topicAlias', '0x23', 1, 0xFFFF], // 0 is not permitted [MQTT-3.3.2-8]
  ['maximumQoS', '0x24', 0, 1], // 2 is a Protocol Error (MQTT 5.0 3.2.2.3.4)
  ['maximumPacketSize', '0x27', 1, 0xFFFF_FFFF], // 0 is a Protocol Error (MQTT 5.0 3.1.2.11.4, 3.2.2.3.6)
];

/** Decodes the bytes that propertiesToBytes() returned: the Property Length (one byte here) and the properties. */
function decodeEncoded(bytes: Uint8Array): Properties {
  return parseMqttProperties(bytes, 1, bytes.length - 1);
}

Deno.test('propertiesToBytes encodes the smallest and the largest value of every integer property', () => {
  for (const [key, , min, max] of integerProperties) {
    for (const value of [min, max]) {
      const decoded = decodeEncoded(propertiesToBytes({ [key]: value }));
      // The decoder returns the Subscription Identifier of SUBSCRIBE as the list of PUBLISH.
      const expected = key === 'subscriptionIdentifier' ? { subscriptionIdentifiers: [value] } : { [key]: value };
      assertEquals(decoded, expected, `${key}: ${value}`);
    }
  }
});

Deno.test('propertiesToBytes throws for a value of an integer property that is not an integer in its range', () => {
  for (const [key, id, min, max] of integerProperties) {
    for (const value of [min - 1, max + 1, min + 0.5, NaN, Infinity, -Infinity]) {
      assertThrows(
        () => propertiesToBytes({ [key]: value }),
        InvalidPropertyValueError,
        `invalid property value: ${key} (${id}) must be an integer from ${min} to ${max} (got ${value})`,
        `${key}: ${value}`,
      );
    }
  }
});

Deno.test('propertiesToBytes throws for an integer property that is not a number', () => {
  // JavaScript callers are not stopped by the types.
  assertThrows(() => propertiesToBytes({ receiveMaximum: '10' as unknown as number }), InvalidPropertyValueError, 'receiveMaximum (0x21)');
  assertThrows(() => propertiesToBytes({ maximumQoS: null as unknown as 0 }), InvalidPropertyValueError, 'maximumQoS (0x24)');
});

Deno.test('propertiesToBytes checks every Subscription Identifier of PUBLISH and tells which one is wrong', () => {
  assertEquals(decodeEncoded(propertiesToBytes({ subscriptionIdentifiers: [1, 268_435_455] })), { subscriptionIdentifiers: [1, 268_435_455] });
  for (const value of [0, -1, 268_435_456, 1.5, NaN]) {
    assertThrows(
      () => propertiesToBytes({ subscriptionIdentifiers: [1, value] }),
      InvalidPropertyValueError,
      `subscriptionIdentifiers[1] (0x0b) must be an integer from 1 to 268435455 (got ${value})`,
      `${value}`,
    );
  }
});

Deno.test('propertiesToBytes encodes a value that means the same as leaving the property out, as it is given', () => {
  // A Payload Format Indicator, a Will Delay Interval and a Topic Alias Maximum of 0 used to be left out.
  assertEquals(
    propertiesToBytes({ payloadFormatIndicator: 0, willDelayInterval: 0, topicAliasMaximum: 0 }),
    new Uint8Array([10, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00, 0x22, 0x00, 0x00]),
  );
});

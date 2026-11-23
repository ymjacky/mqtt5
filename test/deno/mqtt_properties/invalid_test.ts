import { assertEquals, assertThrows } from '@std/assert';
import * as Mqtt from '../../../lib/mqtt/mod.ts';
import { parseMqttProperties } from '../../../lib/mqtt_properties/mod.ts';
import { MqttUtilsError } from '../../../lib/mqtt_utils/mod.ts';

const { MalformedDataError, ProtocolViolationError } = MqttUtilsError;

/** Decodes `bytes` as properties, with a byte in front to check that the offset is used. */
function parse(bytes: number[], propertyLength: number = bytes.length) {
  return parseMqttProperties(new Uint8Array([0xEE, ...bytes]), 1, propertyLength);
}

// Malformed Packets: a property that does not fit the Property Length or the packet.

Deno.test('decodeProperties throws for a property that goes past the Property Length', () => {
  const cases: [string, number[], number][] = [
    // Message Expiry Interval needs 4 bytes, but the Property Length leaves 1: the payload after it is not read.
    ['a Four Byte Integer', [0x02, 0x00, 0x78, 0x79, 0x7A], 2],
    ['a Two Byte Integer', [0x21, 0x00, 0x0A], 2],
    ['a Byte', [0x25, 0x01], 1],
    ['a UTF-8 Encoded String', [0x1F, 0x00, 0x03, 0x61, 0x62, 0x63], 5],
    ['the length of a UTF-8 Encoded String', [0x1F, 0x00, 0x03], 2],
    ['Binary Data', [0x09, 0x00, 0x02, 0x01, 0x02], 4],
    ['the value of a User Property', [0x26, 0x00, 0x01, 0x6B, 0x00, 0x01, 0x76], 6],
    ['a Variable Byte Integer', [0x0B, 0x80, 0x01], 2],
    ['a property identifier that is a Variable Byte Integer', [0x80], 1],
  ];
  for (const [name, bytes, propertyLength] of cases) {
    assertThrows(() => parse(bytes, propertyLength), MalformedDataError, 'are needed', name);
  }
});

Deno.test('decodeProperties throws for a Property Length longer than the bytes', () => {
  assertThrows(() => parse([0x25, 0x01], 3), MalformedDataError, '3 bytes are needed, but only 2 are there');
});

Deno.test('decodeProperties reads every property that fits the Property Length', () => {
  assertEquals(parse([0x02, 0x00, 0x00, 0x00, 0x3C, 0x25, 0x01]), { messageExpiryInterval: 60, retainAvailable: true });
  // The bytes after the Property Length are not read.
  assertEquals(parse([0x25, 0x00, 0x25, 0x00], 2), { retainAvailable: false });
});

// Protocol Errors (MQTT 5.0 chapter 3): the packet can be read, but breaks a rule.

/** A property of each identifier that may be included at most once, with a valid value. */
const nonRepeatableProperties: [string, number[]][] = [
  ['Content Type', [0x03, 0x00, 0x01, 0x61]],
  ['Response Topic', [0x08, 0x00, 0x01, 0x72]],
  ['Correlation Data', [0x09, 0x00, 0x01, 0x01]],
  ['Session Expiry Interval', [0x11, 0x00, 0x00, 0x00, 0x3C]],
  ['Assigned Client Identifier', [0x12, 0x00, 0x01, 0x63]],
  ['Server Keep Alive', [0x13, 0x00, 0x3C]],
  ['Authentication Method', [0x15, 0x00, 0x01, 0x6D]],
  ['Authentication Data', [0x16, 0x00, 0x01, 0x01]],
  ['Request Problem Information', [0x17, 0x01]],
  ['Will Delay Interval', [0x18, 0x00, 0x00, 0x00, 0x3C]],
  ['Request Response Information', [0x19, 0x01]],
  ['Response Information', [0x1A, 0x00, 0x01, 0x69]],
  ['Server Reference', [0x1C, 0x00, 0x01, 0x73]],
  ['Reason String', [0x1F, 0x00, 0x01, 0x72]],
  ['Receive Maximum', [0x21, 0x00, 0x0A]],
  ['Topic Alias Maximum', [0x22, 0x00, 0x0A]],
  ['Topic Alias', [0x23, 0x00, 0x01]],
  ['Maximum QoS', [0x24, 0x01]],
  ['Retain Available', [0x25, 0x01]],
  ['Maximum Packet Size', [0x27, 0x00, 0x00, 0x04, 0x00]],
  ['Wildcard Subscription Available', [0x28, 0x01]],
  ['Subscription Identifiers Available', [0x29, 0x01]],
  ['Shared Subscription Available', [0x2A, 0x01]],
];

Deno.test('decodeProperties throws for a property that is included more than once', () => {
  for (const [name, bytes] of nonRepeatableProperties) {
    // Once is fine.
    parse(bytes);
    assertThrows(() => parse([...bytes, ...bytes]), ProtocolViolationError, 'is included more than once', name);
    // Also with another property in between.
    assertThrows(() => parse([...bytes, 0x26, 0x00, 0x01, 0x6B, 0x00, 0x00, ...bytes]), ProtocolViolationError, undefined, name);
  }
});

Deno.test('decodeProperties accepts the properties that may be included more than once', () => {
  assertEquals(parse([0x26, 0x00, 0x01, 0x6B, 0x00, 0x00, 0x26, 0x00, 0x01, 0x6B, 0x00, 0x01, 0x76]), {
    userProperties: [{ key: 'k', val: '' }, { key: 'k', val: 'v' }],
  });
  // PUBLISH has one Subscription Identifier per matching subscription.
  assertEquals(parse([0x0B, 0x01, 0x0B, 0x02]), { subscriptionIdentifiers: [1, 2] });
  // MQTT 5.0 does not say that it is a Protocol Error to include these two more than once in PUBLISH (3.3.2.3.2,
  // 3.3.2.3.3). The last one is used.
  assertEquals(parse([0x01, 0x00, 0x01, 0x01]), { payloadFormatIndicator: 1 });
  assertEquals(parse([0x02, 0x00, 0x00, 0x00, 0x01, 0x02, 0x00, 0x00, 0x00, 0x02]), { messageExpiryInterval: 2 });
});

Deno.test('decodeProperties throws for a property that must be 0 or 1 and has another value', () => {
  const ids: [string, number][] = [
    ['Request Problem Information', 0x17],
    ['Request Response Information', 0x19],
    ['Maximum QoS', 0x24],
    ['Retain Available', 0x25],
    ['Wildcard Subscription Available', 0x28],
    ['Subscription Identifiers Available', 0x29],
    ['Shared Subscription Available', 0x2A],
  ];
  for (const [name, id] of ids) {
    for (const value of [2, 0xFF]) {
      assertThrows(() => parse([id, value]), ProtocolViolationError, `${name} must be 0 or 1 (got ${value})`);
    }
  }
  assertEquals(parse([0x17, 0x00, 0x19, 0x01, 0x25, 0x00, 0x28, 0x01, 0x29, 0x00, 0x2A, 0x01]), {
    requestProblemInformation: false,
    requestResponseInformation: true,
    retainAvailable: false,
    wildcardSubscriptionAvailable: true,
    subscriptionIdentifiersAvailable: false,
    sharedSubscriptionAvailable: true,
  });
});

Deno.test('decodeProperties reads a Maximum QoS of 0 or 1 as a QoS (MQTT 5.0 3.2.2.3.4)', () => {
  assertEquals(parse([0x24, 0x00]), { maximumQoS: Mqtt.QoS.AT_MOST_ONCE });
  assertEquals(parse([0x24, 0x01]), { maximumQoS: Mqtt.QoS.AT_LEAST_ONCE });
});

Deno.test('decodeProperties throws for a Receive Maximum, Maximum Packet Size or Subscription Identifier of 0', () => {
  assertThrows(() => parse([0x21, 0x00, 0x00]), ProtocolViolationError, 'the Receive Maximum must not be 0');
  assertThrows(() => parse([0x27, 0x00, 0x00, 0x00, 0x00]), ProtocolViolationError, 'the Maximum Packet Size must not be 0');
  assertThrows(() => parse([0x0B, 0x00]), ProtocolViolationError, 'the Subscription Identifier must not be 0');
  assertEquals(parse([0x21, 0x00, 0x01, 0x27, 0x00, 0x00, 0x00, 0x01, 0x0B, 0x01]), {
    receiveMaximum: 1,
    maximumPacketSize: 1,
    subscriptionIdentifiers: [1],
  });
});

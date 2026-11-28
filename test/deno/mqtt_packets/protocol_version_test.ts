import { assertEquals, assertInstanceOf, assertThrows } from '@std/assert';
import * as Mqtt from '../../../lib/mqtt/mod.ts';
import { type AnyPacket, decode, MqttPacketsError, packetToBytes } from '../../../lib/mqtt_packets/mod.ts';

const V5 = Mqtt.ProtocolVersion.MqttV5;
const V3 = Mqtt.ProtocolVersion.MqttV3_1_1;

/** Protocol versions other than 4 (MQTT 3.1.1) and 5 (MQTT 5.0). The string and `undefined` are what JavaScript callers may pass. */
const invalidVersions = [3, 6, 0, -1, 4.5, NaN, '5', undefined] as unknown as Mqtt.ProtocolVersion[];

function message(name: string, value: unknown): string {
  return `invalid protocol version: ${name} must be 4 (MQTT 3.1.1) or 5 (MQTT 5.0) (got ${value})`;
}

/** Asserts that `fn` throws `errorClass`, whose cause is InvalidProtocolVersionError with `causeMessage`. */
function assertInvalidVersion<E extends Error>(
  fn: () => unknown,
  errorClass: new (message: string, options?: ErrorOptions) => E,
  causeMessage: string,
  msg: string,
): void {
  const error = assertThrows(fn, errorClass, undefined, msg);
  assertInstanceOf(error.cause, MqttPacketsError.InvalidProtocolVersionError, msg);
  assertEquals(error.cause.message, causeMessage, msg);
}

const connect = (protocolVersion: Mqtt.ProtocolVersion): AnyPacket => ({ type: 'connect', clientId: 'c', protocolVersion });

/** A packet of each type. Their encoding depends on the protocol version, except for PINGREQ and PINGRESP. */
const packets: AnyPacket[] = [
  connect(V5),
  { type: 'connack', sessionPresent: false },
  { type: 'publish', topic: 't', payload: new Uint8Array([0x70]), dup: false, qos: 1, retain: false, packetId: 1 },
  { type: 'puback', packetId: 1 },
  { type: 'pubrec', packetId: 1 },
  { type: 'pubrel', packetId: 1 },
  { type: 'pubcomp', packetId: 1 },
  { type: 'subscribe', packetId: 1, subscriptions: [{ topicFilter: 'f', qos: 0 }] },
  { type: 'suback', packetId: 1, reasonCodes: [0x00], returnCodes: [0x00] },
  { type: 'unsubscribe', packetId: 1, topicFilters: ['f'] },
  { type: 'unsuback', packetId: 1, reasonCodes: [0x00] },
  { type: 'pingreq' },
  { type: 'pingresp' },
  { type: 'disconnect' },
  { type: 'auth', reasonCode: 0x00 },
];

/** CONNECT with the given Protocol Level: Client Identifier "c", Clean Start, and no properties in MQTT 5.0. */
function connectBytes(protocolLevel: number): number[] {
  const properties = protocolLevel === V5 ? [0x00] : [];
  const variableHeaderAndPayload = [0x00, 0x04, 0x4D, 0x51, 0x54, 0x54, protocolLevel, 0x02, 0x00, 0x00, ...properties, 0x00, 0x01, 0x63];
  return [0x10, variableHeaderAndPayload.length, ...variableHeaderAndPayload];
}

Deno.test('packetToBytes throws for a CONNECT whose protocolVersion is not 4 or 5, instead of sending it as the Protocol Level', () => {
  for (const value of invalidVersions) {
    for (const version of [V5, V3]) {
      assertInvalidVersion(
        () => packetToBytes(connect(value), version),
        MqttPacketsError.MqttPacketSerializeError,
        message('CONNECT protocolVersion', value),
        `${value} (${version})`,
      );
    }
  }
});

Deno.test('packetToBytes throws for a protocolVersion that is not 4 or 5, whatever the packet type', () => {
  // The packets were encoded for one of the two: with 3 for MQTT 3.1.1, with 6 for MQTT 5.0.
  for (const value of invalidVersions) {
    for (const packet of packets) {
      assertInvalidVersion(
        () => packetToBytes(packet, value),
        MqttPacketsError.MqttPacketSerializeError,
        message('protocolVersion', value),
        `${packet.type} ${value}`,
      );
    }
  }
});

Deno.test('decode throws for a protocolVersion that is not 4 or 5, whatever the packet type', () => {
  const cases: [string, number[]][] = [
    ['CONNECT', connectBytes(V5)],
    ['CONNACK', [0x20, 0x03, 0x00, 0x00, 0x00]],
    ['PUBLISH', [0x30, 0x05, 0x00, 0x01, 0x74, 0x00, 0x70]],
    ['PINGRESP', [0xD0, 0x00]],
  ];
  // The packets were decoded for one of the two, not always the same one: with 3, PUBLISH for MQTT 3.1.1 and CONNACK for
  // MQTT 5.0. `undefined` is left out: it means the default, MQTT 5.0.
  for (const value of invalidVersions.filter((version) => version !== undefined)) {
    for (const [name, bytes] of cases) {
      assertInvalidVersion(
        () => decode(new Uint8Array(bytes), value),
        MqttPacketsError.MqttPacketParseError,
        message('protocolVersion', value),
        `${name} ${value}`,
      );
    }
  }
});

Deno.test('decode throws for a CONNECT whose Protocol Level is not 4 or 5', () => {
  for (const protocolLevel of [3, 6, 0]) {
    for (const version of [V5, V3]) {
      assertInvalidVersion(
        () => decode(new Uint8Array(connectBytes(protocolLevel)), version),
        MqttPacketsError.MqttPacketParseError,
        `invalid protocol version: ${protocolLevel}`,
        `${protocolLevel} (${version})`,
      );
    }
  }
});

Deno.test('packetToBytes and decode take 4 and 5, and decode takes 5 when the protocol version is left out', () => {
  for (const version of [V5, V3]) {
    const bytes = packetToBytes(connect(version), version);
    assertEquals(bytes, new Uint8Array(connectBytes(version)), `${version}`);
    const decoded = decode(bytes, version);
    assertEquals(decoded.type === 'connect' && decoded.protocolVersion, version, `${version}`);
    // MQTT 3.1.1 has no AUTH.
    for (const packet of packets.filter(({ type }) => version === V5 || type !== 'auth')) {
      packetToBytes(packet.type === 'connect' ? connect(version) : packet, version);
    }
  }
  // The Property Length of MQTT 5.0 is read.
  assertEquals(decode(new Uint8Array([0x20, 0x03, 0x00, 0x00, 0x00])), { type: 'connack', sessionPresent: false, reasonCode: 0x00 });
});

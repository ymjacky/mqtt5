import { assert, assertEquals, assertInstanceOf, assertThrows } from '@std/assert';
import * as Mqtt from '../../../lib/mqtt/mod.ts';
import { type AnyPacket, decode, MqttPacketsError, packetToBytes } from '../../../lib/mqtt_packets/mod.ts';
import { MqttUtilsError } from '../../../lib/mqtt_utils/mod.ts';

const V5 = Mqtt.ProtocolVersion.MqttV5;
const V3 = Mqtt.ProtocolVersion.MqttV3_1_1;

/** Checks that decode() throws MqttPacketParseError, and returns its cause. */
function decodeError(bytes: number[], protocolVersion: Mqtt.ProtocolVersion, name: string): unknown {
  const error = assertThrows(() => decode(new Uint8Array(bytes), protocolVersion), MqttPacketsError.MqttPacketParseError, undefined, name);
  return error.cause;
}

// Tests of decode() across packet types: each packet type has its own test file in this directory.

Deno.test('decode throws for a field that goes past the end of the packet, instead of reading it as 0', () => {
  const cases: [string, number[], Mqtt.ProtocolVersion][] = [
    // The topic length is 10, but the packet ends after 'abc'.
    ['PUBLISH: the topic', [0x30, 0x05, 0x00, 0x0A, 0x61, 0x62, 0x63], V5],
    ['PUBLISH: the Packet Identifier of QoS 1', [0x32, 0x04, 0x00, 0x01, 0x61, 0x00], V5],
    ['PUBLISH: the Property Length', [0x30, 0x03, 0x00, 0x01, 0x61], V5],
    // The Property Length is 2, but the Message Expiry Interval needs 4 bytes: the payload 'xyz' is not read as its value.
    ['PUBLISH: a property past the Property Length', [0x30, 0x09, 0x00, 0x01, 0x61, 0x02, 0x02, 0x00, 0x78, 0x79, 0x7A], V5],
    ['PUBLISH: the Property Length past the end', [0x30, 0x05, 0x00, 0x01, 0x61, 0x05, 0x02], V5],
    ['CONNACK: the Reason Code', [0x20, 0x01, 0x00], V5],
    ['CONNACK: the return code', [0x20, 0x01, 0x00], V3],
    // The Maximum Packet Size has 1 of its 4 bytes: it was read as 0.
    ['CONNACK: a property', [0x20, 0x05, 0x00, 0x00, 0x02, 0x27, 0x00], V5],
    ['PUBACK: the Packet Identifier', [0x40, 0x01, 0x00], V5],
    ['PUBACK: the Packet Identifier (MQTT 3.1.1)', [0x40, 0x01, 0x00], V3],
    ['PUBACK: the properties', [0x40, 0x06, 0x00, 0x01, 0x00, 0x05, 0x1F, 0x00], V5],
    ['PUBREC: the Packet Identifier', [0x50, 0x01, 0x00], V5],
    ['PUBREL: the Packet Identifier', [0x62, 0x01, 0x00], V5],
    ['PUBCOMP: the Packet Identifier', [0x70, 0x01, 0x00], V5],
    ['SUBACK: the Packet Identifier', [0x90, 0x01, 0x00], V5],
    ['SUBACK: the Property Length', [0x90, 0x02, 0x00, 0x01], V5],
    ['SUBACK: the properties', [0x90, 0x04, 0x00, 0x01, 0x03, 0x1F], V5],
    ['UNSUBACK: the Packet Identifier', [0xB0, 0x01, 0x00], V5],
    ['UNSUBACK: the properties', [0xB0, 0x04, 0x00, 0x01, 0x03, 0x1F], V5],
    ['DISCONNECT: the properties', [0xE0, 0x03, 0x00, 0x02, 0x11], V5],
    ['AUTH: the Property Length', [0xF0, 0x01, 0x18], V5],
    ['AUTH: the properties', [0xF0, 0x03, 0x18, 0x03, 0x15], V5],
    ['SUBSCRIBE: the topic filter', [0x82, 0x06, 0x00, 0x01, 0x00, 0x00, 0x03, 0x61], V5],
    ['SUBSCRIBE: the subscription options', [0x82, 0x06, 0x00, 0x01, 0x00, 0x00, 0x01, 0x61], V5],
    ['UNSUBSCRIBE: the topic filter', [0xA2, 0x05, 0x00, 0x01, 0x00, 0x00, 0x03], V5],
    ['CONNECT: the Client Identifier', [0x10, 0x0C, 0x00, 0x04, 0x4D, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x00, 0x00, 0x01], V3],
    // The Remaining Length is 5, but only 3 bytes follow it.
    ['the Remaining Length past the bytes', [0x30, 0x05, 0x00, 0x01, 0x61], V3],
    ['a Remaining Length cut', [0x30, 0x80], V5],
  ];
  for (const [name, bytes, protocolVersion] of cases) {
    assertInstanceOf(decodeError(bytes, protocolVersion, name), MqttUtilsError.MalformedDataError, name);
  }
});

Deno.test('decode throws for bytes after the last field of a packet', () => {
  const cases: [string, number[], Mqtt.ProtocolVersion][] = [
    ['CONNACK (MQTT 3.1.1)', [0x20, 0x03, 0x00, 0x00, 0xFF], V3],
    ['CONNACK', [0x20, 0x04, 0x00, 0x00, 0x00, 0xFF], V5],
    ['PUBACK (MQTT 3.1.1)', [0x40, 0x03, 0x00, 0x01, 0xFF], V3],
    ['PUBACK', [0x40, 0x05, 0x00, 0x01, 0x00, 0x00, 0xFF], V5],
    ['PUBREC', [0x50, 0x05, 0x00, 0x01, 0x00, 0x00, 0xFF], V5],
    ['PUBREL', [0x62, 0x05, 0x00, 0x01, 0x00, 0x00, 0xFF], V5],
    ['PUBCOMP', [0x70, 0x05, 0x00, 0x01, 0x00, 0x00, 0xFF], V5],
    ['UNSUBACK (MQTT 3.1.1)', [0xB0, 0x03, 0x00, 0x01, 0xFF], V3],
    ['DISCONNECT (MQTT 3.1.1)', [0xE0, 0x01, 0xFF], V3],
    ['DISCONNECT', [0xE0, 0x03, 0x00, 0x00, 0xFF], V5],
    ['AUTH', [0xF0, 0x03, 0x18, 0x00, 0xFF], V5],
    ['CONNECT', [0x10, 0x0D, 0x00, 0x04, 0x4D, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x00, 0x00, 0x00, 0xFF], V3],
    // decode() takes the bytes of one packet: the bytes after its Remaining Length are not ignored.
    ['bytes after the Remaining Length', [0x30, 0x03, 0x00, 0x01, 0x61, 0xFF], V5],
  ];
  for (const [name, bytes, protocolVersion] of cases) {
    const cause = decodeError(bytes, protocolVersion, name);
    assertInstanceOf(cause, MqttUtilsError.MalformedDataError, name);
    assertEquals(cause.message.includes('bytes are left'), true, `${name}: ${cause.message}`);
  }
});

Deno.test('decode reads an omitted Reason Code as 0x00 (MQTT 5.0)', () => {
  // [packet, Remaining Length 2 or 0: no Reason Code, no Property Length]
  const cases: ['puback' | 'pubrec' | 'pubrel' | 'pubcomp', number[], number][] = [
    ['puback', [0x40, 0x02, 0x00, 0x01], Mqtt.ReasonCode.Success], // 3.4.2.1
    ['pubrec', [0x50, 0x02, 0x00, 0x01], Mqtt.ReasonCode.Success], // 3.5.2.1
    ['pubrel', [0x62, 0x02, 0x00, 0x01], Mqtt.ReasonCode.Success], // 3.6.2.1
    ['pubcomp', [0x70, 0x02, 0x00, 0x01], Mqtt.ReasonCode.Success], // 3.7.2.1
  ];
  for (const [type, bytes, reasonCode] of cases) {
    assertEquals(decode(new Uint8Array(bytes), V5), { type, packetId: 1, reasonCode }, type);
  }
  // 3.14.2.1
  assertEquals(decode(new Uint8Array([0xE0, 0x00]), V5), { type: 'disconnect', reasonCode: Mqtt.ReasonCode.NormalDisconnection });
  // An AUTH without a Reason Code (3.15.2.1) has no Authentication Method either, a Protocol Error: see below.
  // MQTT 3.1.1 has no Reason Code.
  assertEquals(decode(new Uint8Array([0x40, 0x02, 0x00, 0x01]), V3), { type: 'puback', packetId: 1 });
  assertEquals(decode(new Uint8Array([0xE0, 0x00]), V3), { type: 'disconnect' });
});

Deno.test('decode reads a Reason Code without a Property Length, and with a Property Length of 0, the same way', () => {
  // PUBACK, PUBREC, PUBREL and PUBCOMP: "If the Remaining Length is less than 4 there is no Property Length" (3.4.2.2.1).
  for (const [type, first] of [['puback', 0x40], ['pubrec', 0x50], ['pubrel', 0x62], ['pubcomp', 0x70]] as const) {
    const expected = { type, packetId: 1, reasonCode: 0x92 };
    assertEquals(decode(new Uint8Array([first, 0x03, 0x00, 0x01, 0x92]), V5), expected, `${type} without a Property Length`);
    assertEquals(decode(new Uint8Array([first, 0x04, 0x00, 0x01, 0x92, 0x00]), V5), expected, `${type} with a Property Length of 0`);
  }
  // DISCONNECT: "If the Remaining Length is less than 2, a value of 0 is used" (3.14.2.2.1).
  const disconnect = { type: 'disconnect', reasonCode: Mqtt.ReasonCode.ServerShuttingDown } as const;
  assertEquals(decode(new Uint8Array([0xE0, 0x01, 0x8B]), V5), disconnect);
  assertEquals(decode(new Uint8Array([0xE0, 0x02, 0x8B, 0x00]), V5), disconnect);
  // AUTH can omit the Property Length only together with the Reason Code, and always has the Authentication Method: see
  // auth_test.ts.
});

Deno.test('decode reads a CONNACK of MQTT 3.1.1 for MQTT 5.0 without properties', () => {
  // A broker that supports only MQTT 3.1.1 answers a CONNECT of MQTT 5.0 with the return code 0x01 (unacceptable protocol
  // version) in a CONNACK without a Property Length.
  assertEquals(decode(new Uint8Array([0x20, 0x02, 0x00, 0x01]), V5), { type: 'connack', sessionPresent: false, reasonCode: 1 });
});

Deno.test('decode throws for a packet type that is Reserved', () => {
  const cases: [string, number[], Mqtt.ProtocolVersion][] = [
    ['type 0', [0x00, 0x00], V5],
    ['type 0 (MQTT 3.1.1)', [0x00, 0x00], V3],
    ['type 0 with the flags 0b1111', [0x0F, 0x00], V5],
    // AUTH is new in MQTT 5.0. Its flags do not matter: the packet type is Reserved.
    ['type 15 (MQTT 3.1.1)', [0xF0, 0x00], V3],
    ['type 15 with the flags 0b0001 (MQTT 3.1.1)', [0xF1, 0x00], V3],
  ];
  for (const [name, bytes, protocolVersion] of cases) {
    assertInstanceOf(decodeError(bytes, protocolVersion, name), MqttPacketsError.UnsupportedPacketError, name);
  }
});

/** `flags` as 4 bits, e.g. 0b0010. */
function toBits(flags: number): string {
  return `0b${flags.toString(2).padStart(4, '0')}`;
}

/**
 * A packet of each type but PUBLISH, and the flags that its fixed header must have: 0b0010 for PUBREL, SUBSCRIBE and
 * UNSUBSCRIBE, 0b0000 for the others (MQTT 5.0 2.1.3 Table 2-2, and the same in MQTT 3.1.1 2.2.2 Table 2.2). MQTT 3.1.1 has
 * no AUTH.
 */
function packetsWithReservedFlags(protocolVersion: Mqtt.ProtocolVersion): [AnyPacket, number][] {
  const packets: [AnyPacket, number][] = [
    [{ type: 'connect', clientId: 'c', protocolVersion }, 0b0000],
    [{ type: 'connack', sessionPresent: false }, 0b0000],
    [{ type: 'puback', packetId: 1 }, 0b0000],
    [{ type: 'pubrec', packetId: 1 }, 0b0000],
    [{ type: 'pubrel', packetId: 1 }, 0b0010],
    [{ type: 'pubcomp', packetId: 1 }, 0b0000],
    [{ type: 'subscribe', packetId: 1, subscriptions: [{ topicFilter: 'f', qos: 0 }] }, 0b0010],
    [{ type: 'suback', packetId: 1, reasonCodes: [0x00], returnCodes: [0x00] }, 0b0000],
    [{ type: 'unsubscribe', packetId: 1, topicFilters: ['f'] }, 0b0010],
    [{ type: 'unsuback', packetId: 1, reasonCodes: [0x00] }, 0b0000],
    [{ type: 'pingreq' }, 0b0000],
    [{ type: 'pingresp' }, 0b0000],
    [{ type: 'disconnect' }, 0b0000],
  ];
  if (protocolVersion === V5) {
    packets.push([{ type: 'auth', reasonCode: 0x00, properties: { authenticationMethod: 'M' } }, 0b0000]);
  }
  return packets;
}

Deno.test('decode throws for fixed header flags that the packet type cannot have, instead of ignoring them', () => {
  // The flags are reserved in every packet type but PUBLISH [MQTT-2.1.3-1] (MQTT 3.1.1 [MQTT-2.2.2-1]): other flags make a
  // Malformed Packet (MQTT 5.0 2.1.3), and the receiver closes the connection (MQTT 3.1.1 [MQTT-2.2.2-2]).
  for (const protocolVersion of [V5, V3]) {
    for (const [packet, expected] of packetsWithReservedFlags(protocolVersion)) {
      const [first = 0, ...rest] = packetToBytes(packet, protocolVersion);
      assertEquals(first & 0x0F, expected, `${packet.type} is encoded with ${toBits(expected)} (${protocolVersion})`);
      for (let flags = 0b0000; flags <= 0b1111; flags++) {
        const name = `${packet.type} with ${toBits(flags)} (${protocolVersion})`;
        const bytes = [(first & 0xF0) | flags, ...rest];
        if (flags === expected) {
          assertEquals(decode(new Uint8Array(bytes), protocolVersion).type, packet.type, name);
          continue;
        }
        const cause = decodeError(bytes, protocolVersion, name);
        assertInstanceOf(cause, MqttUtilsError.MalformedDataError, name);
        assertEquals(
          cause.message,
          `malformed data: the flags of the fixed header of ${packet.type.toUpperCase()} must be ${toBits(expected)} (got ${toBits(flags)})`,
          name,
        );
      }
    }
  }
});

Deno.test('decode checks the flags of the fixed header before the fields of the packet', () => {
  const cases: [string, number[]][] = [
    // With the flags 0b0000, a Protocol Error: an AUTH with a Remaining Length of 0 has no Authentication Method.
    ['an AUTH with a Remaining Length of 0', [0xF1, 0x00]],
    // With the flags 0b0000, a Malformed Packet for the Packet Identifier, which goes past the end.
    ['a PUBACK whose Packet Identifier goes past the end', [0x41, 0x01, 0x00]],
  ];
  for (const [name, bytes] of cases) {
    const cause = decodeError(bytes, V5, name);
    assertInstanceOf(cause, MqttUtilsError.MalformedDataError, name);
    assertEquals(cause.message.includes('the flags of the fixed header'), true, `${name}: ${cause.message}`);
  }
});

Deno.test('decode reads the flags of PUBLISH as DUP, QoS and RETAIN, which are not reserved', () => {
  for (let flags = 0b0000; flags <= 0b1111; flags++) {
    const qos = (flags & 0b0110) >> 1;
    if (qos === 3) {
      continue; // a Malformed Packet [MQTT-3.3.1-4]
    }
    // Topic Name 'a', the Packet Identifier 1 with QoS 1 and QoS 2, no properties and no payload.
    const variableHeader = [0x00, 0x01, 0x61, ...(qos === 0 ? [] : [0x00, 0x01]), 0x00];
    const packet = decode(new Uint8Array([0x30 | flags, variableHeader.length, ...variableHeader]), V5);
    assert(packet.type === 'publish', toBits(flags));
    const expected = { dup: (flags & 0b1000) !== 0, qos, retain: (flags & 0b0001) !== 0 };
    assertEquals({ dup: packet.dup, qos: packet.qos, retain: packet.retain }, expected, toBits(flags));
  }
});

Deno.test('decode throws a MqttPacketParseError caused by ProtocolViolationError for a Protocol Error', () => {
  const cases: [string, number[]][] = [
    // Response Topic twice
    ['PUBLISH', [0x30, 0x0C, 0x00, 0x01, 0x61, 0x08, 0x08, 0x00, 0x01, 0x72, 0x08, 0x00, 0x01, 0x72]],
    // Retain Available: 2
    ['CONNACK', [0x20, 0x05, 0x00, 0x00, 0x02, 0x25, 0x02]],
    // Reason String twice
    ['SUBACK', [0x90, 0x0C, 0x00, 0x01, 0x08, 0x1F, 0x00, 0x01, 0x72, 0x1F, 0x00, 0x01, 0x72, 0x00]],
    // No Authentication Method (3.15.2.2.2): with a Remaining Length of 0, and with a Property Length of 0
    ['AUTH', [0xF0, 0x00]],
    ['AUTH', [0xF0, 0x02, 0x18, 0x00]],
  ];
  for (const [name, bytes] of cases) {
    assertInstanceOf(decodeError(bytes, V5, name), MqttUtilsError.ProtocolViolationError, name);
  }
});

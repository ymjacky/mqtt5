import { assertEquals, assertInstanceOf, assertStringIncludes, assertThrows } from '@std/assert';
import * as Mqtt from '../../../lib/mqtt/mod.ts';
import { type AnyPacket, decode, MqttPacketsError, packetToBytes } from '../../../lib/mqtt_packets/mod.ts';

// The encoder checks the fields of every packet other than the properties, also of the packets that only a broker sends
// (CONNACK, SUBACK, UNSUBACK). The checks of the client (validation.ts) come first for what it sends, but the encoder does
// not depend on them.

const V5 = Mqtt.ProtocolVersion.MqttV5;
const V3 = Mqtt.ProtocolVersion.MqttV3_1_1;

/**
 * The Reason Codes (MQTT 5.0) and return codes (MQTT 3.1.1) that each packet type may carry, copied from the tables of the
 * specifications, not from the encoder.
 */
const specCodes: Record<string, number[]> = {
  // MQTT 5.0 3.2.2.2 [MQTT-3.2.2-8]
  'CONNACK': [0x00, 0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x8C, 0x90, 0x95, 0x97, 0x99, 0x9A, 0x9B, 0x9C, 0x9D, 0x9F],
  // MQTT 5.0 3.4.2.1 [MQTT-3.4.2-1] and 3.5.2.1 [MQTT-3.5.2-1]
  'PUBACK': [0x00, 0x10, 0x80, 0x83, 0x87, 0x90, 0x91, 0x97, 0x99],
  'PUBREC': [0x00, 0x10, 0x80, 0x83, 0x87, 0x90, 0x91, 0x97, 0x99],
  // MQTT 5.0 3.6.2.1 [MQTT-3.6.2-1] and 3.7.2.1 [MQTT-3.7.2-1]
  'PUBREL': [0x00, 0x92],
  'PUBCOMP': [0x00, 0x92],
  // MQTT 5.0 3.9.3 [MQTT-3.9.3-2]
  'SUBACK': [0x00, 0x01, 0x02, 0x80, 0x83, 0x87, 0x8F, 0x91, 0x97, 0x9E, 0xA1, 0xA2],
  // MQTT 5.0 3.11.3 [MQTT-3.11.3-2]
  'UNSUBACK': [0x00, 0x11, 0x80, 0x83, 0x87, 0x8F, 0x91],
  // MQTT 5.0 3.14.2.1 [MQTT-3.14.2-1], and 0x8C (Bad authentication method), which the table of all Reason Codes (2.4) gives
  // for DISCONNECT although 3.14.2.1 does not list it.
  'DISCONNECT': [
    0x00,
    0x04,
    0x80,
    0x81,
    0x82,
    0x83,
    0x87,
    0x89,
    0x8B,
    0x8C,
    0x8D,
    0x8E,
    0x8F,
    0x90,
    0x93,
    0x94,
    0x95,
    0x96,
    0x97,
    0x98,
    0x99,
    0x9A,
    0x9B,
    0x9C,
    0x9D,
    0x9E,
    0x9F,
    0xA0,
    0xA1,
    0xA2,
  ],
  // MQTT 5.0 3.15.2.1 [MQTT-3.15.2-1]
  'AUTH': [0x00, 0x18, 0x19],
  // MQTT 3.1.1 3.2.2.3: 6 to 255 are reserved.
  'CONNACK (MQTT 3.1.1)': [0x00, 0x01, 0x02, 0x03, 0x04, 0x05],
  // MQTT 3.1.1 3.9.3 [MQTT-3.9.3-2]
  'SUBACK (MQTT 3.1.1)': [0x00, 0x01, 0x02, 0x80],
};

/** For each packet type with a code: how to make one with the code, the protocol version, the name of the field, and how to read the code back. */
const withCode: Record<string, { packet: (code: number) => AnyPacket; version: Mqtt.ProtocolVersion; field: string; read: (packet: AnyPacket) => unknown }> = {
  'CONNACK': {
    packet: (code) => ({ type: 'connack', sessionPresent: false, reasonCode: code as Mqtt.ReasonCode }),
    version: V5,
    field: 'CONNACK reasonCode',
    read: (packet) => packet.type === 'connack' && packet.reasonCode,
  },
  'PUBACK': {
    packet: (code) => ({ type: 'puback', packetId: 1, reasonCode: code }),
    version: V5,
    field: 'PUBACK reasonCode',
    read: (packet) => packet.type === 'puback' && packet.reasonCode,
  },
  'PUBREC': {
    packet: (code) => ({ type: 'pubrec', packetId: 1, reasonCode: code }),
    version: V5,
    field: 'PUBREC reasonCode',
    read: (packet) => packet.type === 'pubrec' && packet.reasonCode,
  },
  'PUBREL': {
    packet: (code) => ({ type: 'pubrel', packetId: 1, reasonCode: code }),
    version: V5,
    field: 'PUBREL reasonCode',
    read: (packet) => packet.type === 'pubrel' && packet.reasonCode,
  },
  'PUBCOMP': {
    packet: (code) => ({ type: 'pubcomp', packetId: 1, reasonCode: code }),
    version: V5,
    field: 'PUBCOMP reasonCode',
    read: (packet) => packet.type === 'pubcomp' && packet.reasonCode,
  },
  'SUBACK': {
    // The second code is checked too: the first one is valid.
    packet: (code) => ({ type: 'suback', packetId: 1, reasonCodes: [0x00, code] }),
    version: V5,
    field: 'SUBACK reasonCodes[1]',
    read: (packet) => packet.type === 'suback' && packet.reasonCodes?.[1],
  },
  'UNSUBACK': {
    packet: (code) => ({ type: 'unsuback', packetId: 1, reasonCodes: [0x00, code] }),
    version: V5,
    field: 'UNSUBACK reasonCodes[1]',
    read: (packet) => packet.type === 'unsuback' && packet.reasonCodes?.[1],
  },
  'DISCONNECT': {
    packet: (code) => ({ type: 'disconnect', reasonCode: code }),
    version: V5,
    field: 'DISCONNECT reasonCode',
    read: (packet) => packet.type === 'disconnect' && packet.reasonCode,
  },
  'AUTH': {
    // An AUTH carries the Authentication Method (MQTT 5.0 3.15.2.2.2).
    packet: (code) => ({ type: 'auth', reasonCode: code, properties: { authenticationMethod: 'M' } }),
    version: V5,
    field: 'AUTH reasonCode',
    read: (packet) => packet.type === 'auth' && packet.reasonCode,
  },
  'CONNACK (MQTT 3.1.1)': {
    packet: (code) => ({ type: 'connack', sessionPresent: false, returnCode: code as Mqtt.V3_1_1_ConnectReturnCode }),
    version: V3,
    field: 'CONNACK returnCode',
    read: (packet) => packet.type === 'connack' && packet.returnCode,
  },
  'SUBACK (MQTT 3.1.1)': {
    packet: (code) => ({ type: 'suback', packetId: 1, returnCodes: [0x00, code] }),
    version: V3,
    field: 'SUBACK returnCodes[1]',
    read: (packet) => packet.type === 'suback' && packet.returnCodes?.[1],
  },
};

/** Asserts that encoding the packet throws MqttPacketSerializeError, whose cause is InvalidFieldValueError naming `field`. */
function assertInvalidField(packet: AnyPacket, version: Mqtt.ProtocolVersion, field: string, message: string): void {
  const error = assertThrows(() => packetToBytes(packet, version), MqttPacketsError.MqttPacketSerializeError, undefined, message);
  assertInstanceOf(error.cause, MqttPacketsError.InvalidFieldValueError, message);
  assertStringIncludes(error.cause.message, `${field} must be `, message);
}

Deno.test('the tables of this test cover every packet type with a Reason Code or a return code', () => {
  assertEquals(Object.keys(withCode).sort(), Object.keys(specCodes).sort());
});

Deno.test('packetToBytes writes every code that the packet type may carry, and the receiver reads it as it is', () => {
  for (const [name, { packet, version, read }] of Object.entries(withCode)) {
    for (const code of specCodes[name] ?? []) {
      assertEquals(read(decode(packetToBytes(packet(code), version), version)), code, `${name} 0x${code.toString(16)}`);
    }
  }
});

Deno.test('packetToBytes throws for any other code from 0 to 255, which fits the byte but is not one of the packet type', () => {
  for (const [name, { packet, version, field }] of Object.entries(withCode)) {
    for (let code = 0; code <= 0xFF; code++) {
      if (!specCodes[name]?.includes(code)) {
        assertInvalidField(packet(code), version, field, `${name} 0x${code.toString(16)}`);
      }
    }
  }
});

Deno.test('packetToBytes throws for a code that does not fit the byte, instead of sending the lowest 8 bits or 0x00', () => {
  // 256 was sent as 0x00 (Success), 0x110 as 0x10, -1 as 0xFF, 1.5 as 0x01, and NaN as 0x00 (Success).
  for (const [name, { packet, version, field }] of Object.entries(withCode)) {
    for (const code of [0x100, 0x110, -1, 1.5, NaN, Infinity]) {
      assertInvalidField(packet(code), version, field, `${name} ${code}`);
    }
  }
});

Deno.test('packetToBytes names the codes that the packet type may carry in the message', () => {
  const error = assertThrows(() => packetToBytes({ type: 'auth', reasonCode: Mqtt.ReasonCode.NotAuthorized }, V5), MqttPacketsError.MqttPacketSerializeError);
  assertInstanceOf(error.cause, MqttPacketsError.InvalidFieldValueError);
  assertEquals(error.cause.message, 'invalid field value: AUTH reasonCode must be one of 0x00, 0x18, 0x19 (got 135)');
});

const publish = { type: 'publish', topic: 't', payload: new Uint8Array([0x70]), dup: false, retain: false } as const;
const subscribe = (subscriptions: { qos: number; retainHandling?: number }[]): AnyPacket => ({
  type: 'subscribe',
  packetId: 1,
  subscriptions: subscriptions.map(({ qos, retainHandling }, i) => ({
    topicFilter: `f${i}`,
    qos: qos as Mqtt.QoS,
    ...(retainHandling !== undefined && { retainHandling: retainHandling as Mqtt.RetainHandling }),
  })),
});
const connect = (fields: { keepAlive?: number; willQoS?: number }): AnyPacket => ({
  type: 'connect',
  clientId: 'c',
  protocolVersion: V5,
  ...(fields.keepAlive !== undefined && { keepAlive: fields.keepAlive }),
  ...(fields.willQoS !== undefined && { will: { topic: 'w', qos: fields.willQoS as Mqtt.QoS } }),
});
/** The packets that answer a packet ID that the peer sent, with the given packet ID. */
const answers = (packetId: number): AnyPacket[] => [
  { type: 'puback', packetId },
  { type: 'pubrec', packetId },
  { type: 'pubrel', packetId },
  { type: 'pubcomp', packetId },
  { type: 'suback', packetId, reasonCodes: [0x00], returnCodes: [0x00] },
  { type: 'unsuback', packetId, reasonCodes: [0x00] },
];

Deno.test('packetToBytes throws for a packet ID, a QoS, a Retain Handling or a Keep Alive that cannot be encoded, with the field in the message', () => {
  const invalidFields: [string, AnyPacket, Mqtt.ProtocolVersion, string][] = [
    // A packet ID of 0, which a packet that is given a new packet ID must not have [MQTT-2.2.1-3], [MQTT-2.2.1-4].
    ['PUBLISH QoS 1 with a packet ID of 0', { ...publish, qos: 1, packetId: 0 }, V5, 'PUBLISH packetId'],
    ['PUBLISH QoS 2 with a packet ID of 0', { ...publish, qos: 2, packetId: 0 }, V5, 'PUBLISH packetId'],
    ['SUBSCRIBE with a packet ID of 0', { ...subscribe([{ qos: 0 }]), packetId: 0 } as AnyPacket, V5, 'SUBSCRIBE packetId'],
    ['UNSUBSCRIBE with a packet ID of 0', { type: 'unsubscribe', packetId: 0, topicFilters: ['f'] }, V5, 'UNSUBSCRIBE packetId'],
    ['PUBLISH with a packet ID of 0 (MQTT 3.1.1)', { ...publish, qos: 1, packetId: 0 }, V3, 'PUBLISH packetId'],
    // A packet ID that does not fit the Two Byte Integer, which was sent as another value: -1 as 65,535, 1.5 as 1.
    ['PUBLISH with a packet ID of -1', { ...publish, qos: 1, packetId: -1 }, V5, 'PUBLISH packetId'],
    ['PUBLISH with a packet ID of 1.5', { ...publish, qos: 1, packetId: 1.5 }, V5, 'PUBLISH packetId'],
    ['PUBLISH with a packet ID of 65,536', { ...publish, qos: 1, packetId: 65_536 }, V5, 'PUBLISH packetId'],
    ['PUBACK with a packet ID of -1', { type: 'puback', packetId: -1 }, V5, 'PUBACK packetId'],
    ['PUBREC with a packet ID of 1.5', { type: 'pubrec', packetId: 1.5 }, V5, 'PUBREC packetId'],
    ['PUBREL with a packet ID of 65,536', { type: 'pubrel', packetId: 65_536 }, V5, 'PUBREL packetId'],
    ['PUBCOMP with a packet ID of NaN', { type: 'pubcomp', packetId: NaN }, V5, 'PUBCOMP packetId'],
    ['SUBACK with a packet ID of -1', { type: 'suback', packetId: -1, reasonCodes: [0x00] }, V5, 'SUBACK packetId'],
    ['UNSUBACK with a packet ID of 70,000', { type: 'unsuback', packetId: 70_000, reasonCodes: [0x00] }, V5, 'UNSUBACK packetId'],
    ['PUBACK with a packet ID of -1 (MQTT 3.1.1)', { type: 'puback', packetId: -1 }, V3, 'PUBACK packetId'],
    // A QoS of 3, which was sent as it is in PUBLISH and in the Will (a Malformed Packet [MQTT-3.3.1-4], [MQTT-3.1.2-12]),
    // and as QoS 0 in SUBSCRIBE (MQTT 5.0), or as it is (MQTT 3.1.1).
    ['PUBLISH with a QoS of 3', { ...publish, qos: 3 as Mqtt.QoS, packetId: 1 } as AnyPacket, V5, 'PUBLISH qos'],
    ['PUBLISH with a QoS of -1', { ...publish, qos: -1 as Mqtt.QoS, packetId: 1 } as AnyPacket, V5, 'PUBLISH qos'],
    ['CONNECT with a Will QoS of 3', connect({ willQoS: 3 }), V5, 'CONNECT will.qos'],
    ['SUBSCRIBE with a QoS of 3', subscribe([{ qos: 0 }, { qos: 3 }]), V5, 'SUBSCRIBE subscriptions[1].qos'],
    ['SUBSCRIBE with a QoS of 3 (MQTT 3.1.1)', subscribe([{ qos: 0 }, { qos: 3 }]), V3, 'SUBSCRIBE subscriptions[1].qos'],
    // A Retain Handling of 3 (a Protocol Error, MQTT 5.0 3.8.3.1), which was sent as 0.
    ['SUBSCRIBE with a Retain Handling of 3', subscribe([{ qos: 0 }, { qos: 0, retainHandling: 3 }]), V5, 'SUBSCRIBE subscriptions[1].retainHandling'],
    ['SUBSCRIBE with a Retain Handling of 1.5', subscribe([{ qos: 0, retainHandling: 1.5 }]), V5, 'SUBSCRIBE subscriptions[0].retainHandling'],
    // A Keep Alive that does not fit the Two Byte Integer, which was sent as another value: 70,000 as 4,464, -1 as 65,535.
    ['CONNECT with a Keep Alive of 70,000', connect({ keepAlive: 70_000 }), V5, 'CONNECT keepAlive'],
    ['CONNECT with a Keep Alive of -1', connect({ keepAlive: -1 }), V5, 'CONNECT keepAlive'],
    ['CONNECT with a Keep Alive of 1.5', connect({ keepAlive: 1.5 }), V5, 'CONNECT keepAlive'],
    ['CONNECT with a Keep Alive of NaN', connect({ keepAlive: NaN }), V5, 'CONNECT keepAlive'],
  ];
  for (const [name, packet, version, field] of invalidFields) {
    assertInvalidField(packet, version, field, name);
  }
});

Deno.test('packetToBytes writes the valid values closest to the invalid ones, and the receiver reads them as they are', () => {
  for (const version of [V5, V3]) {
    for (const packetId of [1, 65_535]) {
      for (const qos of [1, 2] as const) {
        const decoded = decode(packetToBytes({ ...publish, qos, packetId }, version), version);
        assertEquals(decoded.type === 'publish' && [decoded.qos, decoded.packetId], [qos, packetId], `PUBLISH ${qos} ${packetId} (${version})`);
      }
      const unsubscribe = decode(packetToBytes({ type: 'unsubscribe', packetId, topicFilters: ['f'] }, version), version);
      assertEquals(unsubscribe.type === 'unsubscribe' && unsubscribe.packetId, packetId, `UNSUBSCRIBE ${packetId} (${version})`);
    }
    for (const keepAlive of [0, 65_535]) {
      const decoded = decode(packetToBytes({ ...connect({ keepAlive, willQoS: 2 }), protocolVersion: version } as AnyPacket, version), version);
      assertEquals(decoded.type === 'connect' && [decoded.keepAlive, decoded.will?.qos], [keepAlive, 2], `CONNECT ${keepAlive} (${version})`);
    }
  }
  const decoded = decode(packetToBytes({ ...subscribe([{ qos: 2, retainHandling: 2 }, { qos: 0 }]), packetId: 65_535 } as AnyPacket, V5), V5);
  assertEquals(decoded.type === 'subscribe' && decoded.packetId, 65_535);
  assertEquals(decoded.type === 'subscribe' && decoded.subscriptions.map(({ qos, retainHandling }) => [qos, retainHandling]), [[2, 2], [0, 0]]);
});

Deno.test(
  'packetToBytes writes a packet ID of 0 in PUBACK, PUBREC, PUBREL, PUBCOMP, SUBACK and UNSUBACK: they answer the packet ID that the peer sent [MQTT-2.2.1-5], [MQTT-2.2.1-6]',
  () => {
    for (const version of [V5, V3]) {
      for (const packetId of [0, 65_535]) {
        for (const packet of answers(packetId)) {
          const decoded = decode(packetToBytes(packet, version), version);
          assertEquals(decoded.type, packet.type);
          assertEquals('packetId' in decoded && decoded.packetId, packetId, `${packet.type} ${packetId} (${version})`);
        }
      }
    }
  },
);

Deno.test('packetToBytes does not check the fields that it does not write', () => {
  // MQTT 3.1.1 has no Reason Code in PUBACK and the other acknowledgments, and no Retain Handling.
  assertEquals(packetToBytes({ type: 'puback', packetId: 1, reasonCode: 0x100 }, V3), new Uint8Array([0x40, 0x02, 0x00, 0x01]));
  assertEquals(packetToBytes({ type: 'disconnect', reasonCode: 0x100 }, V3), new Uint8Array([0xE0, 0x00]));
  assertEquals(
    packetToBytes(subscribe([{ qos: 1, retainHandling: 3 }]), V3),
    new Uint8Array([0x82, 0x07, 0x00, 0x01, 0x00, 0x02, 0x66, 0x30, 0x01]),
  );
  // CONNACK has a Reason Code in MQTT 5.0, and a return code in MQTT 3.1.1.
  assertEquals(
    packetToBytes({ type: 'connack', sessionPresent: false, returnCode: 0x100 as Mqtt.V3_1_1_ConnectReturnCode }, V5),
    new Uint8Array([0x20, 0x03, 0x00, 0x00, 0x00]),
  );
  assertEquals(packetToBytes({ type: 'connack', sessionPresent: false, reasonCode: 0x100 as Mqtt.ReasonCode }, V3), new Uint8Array([0x20, 0x02, 0x00, 0x00]));
  // A QoS 0 PUBLISH has no packet ID [MQTT-2.2.1-2].
  assertEquals(
    packetToBytes({ ...publish, qos: 0, packetId: -1 } as unknown as AnyPacket, V5),
    new Uint8Array([0x30, 0x05, 0x00, 0x01, 0x74, 0x00, 0x70]),
  );
});

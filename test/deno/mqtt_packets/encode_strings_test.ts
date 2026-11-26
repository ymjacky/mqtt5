import { assertInstanceOf, assertStringIncludes, assertThrows } from '@std/assert';
import * as Mqtt from '../../../lib/mqtt/mod.ts';
import { type AnyPacket, decode, MqttPacketsError, packetToBytes } from '../../../lib/mqtt_packets/mod.ts';
import { MqttUtilsError } from '../../../lib/mqtt_utils/mod.ts';

// The encoder checks every UTF-8 Encoded String with the rules of MQTT, whatever the packet and the field: the same rules
// apply to the packets that a client sends and to the ones that a broker sends. The checks of the client (validation.ts)
// come first and name the value, but the encoder does not depend on them.

const V5 = Mqtt.ProtocolVersion.MqttV5;
const V3 = Mqtt.ProtocolVersion.MqttV3_1_1;

/** Packets, each with one UTF-8 Encoded String set to `str`: a name, the packet and the protocol version to encode it for. */
function packetsWith(str: string): [string, AnyPacket, Mqtt.ProtocolVersion][] {
  const userProperties = [{ key: 'k', val: str }];
  const publish = { type: 'publish', topic: 't', payload: new Uint8Array([0x70]), dup: false, retain: false, qos: 0 } as const;
  const connack = { type: 'connack', sessionPresent: false, reasonCode: Mqtt.ReasonCode.Success } as const;
  return [
    // The packets that a client sends.
    ['CONNECT Client Identifier', { type: 'connect', clientId: str, protocolVersion: V5 }, V5],
    ['CONNECT Client Identifier (MQTT 3.1.1)', { type: 'connect', clientId: str, protocolVersion: V3 }, V3],
    ['CONNECT User Name', { type: 'connect', clientId: 'c', protocolVersion: V5, username: str }, V5],
    ['CONNECT Will Topic', { type: 'connect', clientId: 'c', protocolVersion: V5, will: { topic: str } }, V5],
    ['CONNECT Will Properties', { type: 'connect', clientId: 'c', protocolVersion: V5, will: { topic: 'w', properties: { contentType: str } } }, V5],
    ['CONNECT Authentication Method', { type: 'connect', clientId: 'c', protocolVersion: V5, properties: { authenticationMethod: str } }, V5],
    ['SUBSCRIBE Topic Filter', { type: 'subscribe', packetId: 1, subscriptions: [{ topicFilter: str, qos: Mqtt.QoS.AtMostOnce }] }, V5],
    ['SUBSCRIBE Topic Filter (MQTT 3.1.1)', { type: 'subscribe', packetId: 1, subscriptions: [{ topicFilter: str, qos: Mqtt.QoS.AtMostOnce }] }, V3],
    ['SUBSCRIBE User Property', { type: 'subscribe', packetId: 1, subscriptions: [{ topicFilter: 'f', qos: 0 }], properties: { userProperties } }, V5],
    ['UNSUBSCRIBE Topic Filter', { type: 'unsubscribe', packetId: 1, topicFilters: [str] }, V5],
    // The packets that both send.
    ['PUBLISH Topic Name', { ...publish, topic: str }, V5],
    ['PUBLISH Topic Name (MQTT 3.1.1)', { ...publish, topic: str }, V3],
    ['PUBLISH Response Topic', { ...publish, properties: { responseTopic: str } }, V5],
    ['PUBLISH Content Type', { ...publish, properties: { contentType: str } }, V5],
    ['PUBLISH User Property', { ...publish, properties: { userProperties } }, V5],
    ['PUBACK Reason String', { type: 'puback', packetId: 1, reasonCode: 0x80, properties: { reasonString: str } }, V5],
    ['PUBREC Reason String', { type: 'pubrec', packetId: 1, reasonCode: 0x80, properties: { reasonString: str } }, V5],
    ['PUBREL User Property', { type: 'pubrel', packetId: 1, properties: { userProperties } }, V5],
    ['PUBCOMP Reason String', { type: 'pubcomp', packetId: 1, reasonCode: 0x92, properties: { reasonString: str } }, V5],
    ['DISCONNECT Reason String', { type: 'disconnect', reasonCode: 0x80, properties: { reasonString: str } }, V5],
    ['AUTH Authentication Method', { type: 'auth', reasonCode: 0x18, properties: { authenticationMethod: str } }, V5],
    ['AUTH Reason String', { type: 'auth', reasonCode: 0x18, properties: { authenticationMethod: 'm', reasonString: str } }, V5],
    // The packets and the properties that only a broker sends.
    ['CONNACK Assigned Client Identifier', { ...connack, properties: { assignedClientIdentifier: str } }, V5],
    ['CONNACK Response Information', { ...connack, properties: { responseInformation: str } }, V5],
    ['CONNACK Server Reference', { ...connack, reasonCode: 0x9C, properties: { serverReference: str } }, V5],
    ['CONNACK Reason String', { ...connack, reasonCode: 0x80, properties: { reasonString: str } }, V5],
    ['CONNACK Authentication Method', { ...connack, properties: { authenticationMethod: str } }, V5],
    ['CONNACK User Property', { ...connack, properties: { userProperties } }, V5],
    ['SUBACK Reason String', { type: 'suback', packetId: 1, reasonCodes: [0x80], properties: { reasonString: str } }, V5],
    ['SUBACK User Property', { type: 'suback', packetId: 1, reasonCodes: [0x00], properties: { userProperties } }, V5],
    ['UNSUBACK Reason String', { type: 'unsuback', packetId: 1, reasonCodes: [0x80], properties: { reasonString: str } }, V5],
    ['DISCONNECT Server Reference', { type: 'disconnect', reasonCode: 0x9C, properties: { serverReference: str } }, V5],
  ];
}

/** Whether `bytes` contain `part`. */
function includesBytes(bytes: Uint8Array, part: Uint8Array): boolean {
  for (let i = 0; i + part.length <= bytes.length; i++) {
    if (part.every((byte, j) => bytes[i + j] === byte)) {
      return true;
    }
  }
  return false;
}

function assertCannotEncode(str: string, causeClass: new (...args: never[]) => Error, causeMessage: string): void {
  for (const [name, packet, protocolVersion] of packetsWith(str)) {
    const error = assertThrows(() => packetToBytes(packet, protocolVersion), MqttPacketsError.MqttPacketSerializeError, undefined, name);
    assertInstanceOf(error.cause, causeClass, name);
    assertStringIncludes(error.cause.message, causeMessage, name);
  }
}

Deno.test('a valid string is encoded as its UTF-8 bytes in every packet, and the packet can be decoded', () => {
  // U+FEFF at the start, a 3-byte character and a surrogate pair (4 bytes).
  const str = '\u{FEFF}あ\u{1F600}';
  const utf8 = new TextEncoder().encode(str);
  for (const [name, packet, protocolVersion] of packetsWith(str)) {
    const bytes = packetToBytes(packet, protocolVersion);
    if (!includesBytes(bytes, new Uint8Array([0x00, utf8.length, ...utf8]))) {
      throw new Error(`${name}: the length and the UTF-8 bytes of the string are not in the packet`);
    }
    decode(bytes, protocolVersion);
  }
});

Deno.test('a UTF-8 Encoded String with U+0000 cannot be encoded in any packet [MQTT-1.5.4-2]', () => {
  assertCannotEncode('a\u0000', MqttUtilsError.InvalidUtf8EncodedStringError, 'U+0000');
});

Deno.test('a UTF-8 Encoded String with a lone surrogate cannot be encoded in any packet, instead of being sent as U+FFFD [MQTT-1.5.4-1]', () => {
  assertCannotEncode('a\uD800', MqttUtilsError.UnencodableStringError, 'lone surrogate at index 1');
  assertCannotEncode('\uDC00', MqttUtilsError.UnencodableStringError, 'lone surrogate at index 0');
});

Deno.test('a UTF-8 Encoded String longer than 65,535 bytes cannot be encoded in any packet', () => {
  assertCannotEncode('a'.repeat(65_536), MqttUtilsError.InvalidUtf8EncodedStringError, 'longer than 65535 bytes');
});

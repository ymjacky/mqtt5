import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { ByteReader, concatBytes, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import { ProtocolViolationError } from '../mqtt_utils/error.ts';
import { MissingPropertyError, UnsupportedPacketError } from './error.ts';
import { authReasonCodes, reasonCodeValue } from './field_values.ts';
import type { AuthPacket } from './packet_types.ts';

/**
 * AUTH is new in MQTT 5.0. In MQTT 3.1.1, its packet type 15 is Reserved (MQTT 3.1.1 2.2.1), like type 0: AUTH cannot be
 * sent, and a received packet of type 15 is not a valid packet, which the receiver must close the connection on
 * [MQTT-4.8.0-1].
 * @throws {UnsupportedPacketError} if the protocol version is not MQTT 5.0.
 */
function expectAuthInProtocolVersion(protocolVersion: Mqtt.ProtocolVersion): void {
  if (protocolVersion < Mqtt.ProtocolVersion.MqttV5) {
    throw new UnsupportedPacketError('AUTH (packet type 15 is Reserved in MQTT 3.1.1)');
  }
}

export function toBytes(
  packet: AuthPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  expectAuthInProtocolVersion(protocolVersion);
  const variableHeaderChunks: (Uint8Array | number[])[] = [];

  const reasonCode = reasonCodeValue('AUTH', 'reasonCode', packet.reasonCode ?? 0x00, authReasonCodes); // 0x00 success
  if (packet.properties?.authenticationMethod === undefined) {
    throw new MissingPropertyError('AUTH must carry an authenticationMethod (MQTT 5.0 3.15.2.2.2)');
  }
  // AUTH always has a property, the Authentication Method, so the Reason Code and the Property Length are always written:
  // they can be omitted only when the Reason Code is 0x00 (Success) and there are no properties (MQTT 5.0 3.15.2.1).
  variableHeaderChunks.push([reasonCode]);
  variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));

  const variableHeader = concatBytes(variableHeaderChunks);

  const fixedHeader = [
    (Mqtt.PacketType.Auth << 4) + Mqtt.FixedHeaderFlag.Auth,
    ...remainingLengthToBytes(variableHeader.length),
  ];

  return concatBytes([fixedHeader, variableHeader]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): AuthPacket {
  expectAuthInProtocolVersion(protocolVersion);
  const reader = new ByteReader(buffer, remainingLength);

  // Every AUTH carries the Authentication Method: it is a Protocol Error to omit it (MQTT 5.0 3.15.2.2.2), for the client and
  // for the server alike [MQTT-4.12.0-5]. So is an AUTH with a Remaining Length of 0, which 3.15.2.1 allows for the Reason Code
  // 0x00 (Success) without properties: it has no Authentication Method.
  if (reader.remaining === 0) {
    throw new ProtocolViolationError('AUTH must carry the Authentication Method (it has a Remaining Length of 0)');
  }

  // Unlike DISCONNECT, the Property Length cannot be omitted alone: a Reason Code without it is a Malformed Packet.
  const reasonCode = reader.readByte();
  const properties = readProperties(reader);
  reader.expectEnd('AUTH');
  if (properties?.authenticationMethod === undefined) {
    throw new ProtocolViolationError('AUTH must carry the Authentication Method');
  }
  return {
    type: 'auth',
    reasonCode,
    properties,
  };
}

import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { ByteReader, concatBytes, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import { UnsupportedPacketError } from './error.ts';
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

  const reasonCode = packet.reasonCode || 0x00; // 0x00 success
  if (packet.properties) {
    variableHeaderChunks.push([reasonCode & 0xFF]);
    variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
  } else {
    if (reasonCode !== 0x00) {
      variableHeaderChunks.push([reasonCode & 0xFF]);
    }
  }

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

  // The Reason Code and the Property Length can be omitted when the Reason Code is 0x00 (Success) and there are no
  // properties: the Remaining Length is 0 then (MQTT 5.0 3.15.2.1). Unlike DISCONNECT, the Property Length cannot be
  // omitted alone.
  if (reader.remaining === 0) {
    return {
      type: 'auth',
      reasonCode: Mqtt.ReasonCode.Success,
    };
  }

  const reasonCode = reader.readByte();
  const properties = readProperties(reader);
  reader.expectEnd('AUTH');
  return {
    type: 'auth',
    reasonCode,
    ...(properties && { properties }),
  };
}

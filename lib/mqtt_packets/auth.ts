import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { ByteReader, concatBytes, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import type { AuthPacket } from './packet_types.ts';

export function toBytes(
  packet: AuthPacket,
  _protocolVersion: Mqtt.ProtocolVersion,
) {
  const variableHeaderChunks: (Uint8Array | number[])[] = [];

  const reasonCode = packet.reasonCode || 0x00; // 0x00 success
  if (packet.properties) {
    variableHeaderChunks.push([reasonCode & 0xFF]);
    variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
  } else {
    if (reasonCode != 0x00) {
      variableHeaderChunks.push([reasonCode & 0xFF]);
    }
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  const fixedHeader = [
    (Mqtt.PacketType.AUTH << 4) + Mqtt.fixedHeaderFlag.AUTH,
    ...remainingLengthToBytes(variableHeader.length),
  ];

  return concatBytes([fixedHeader, variableHeader]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  _protocolVersion: Mqtt.ProtocolVersion,
): AuthPacket {
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

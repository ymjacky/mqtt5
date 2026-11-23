import * as Mqtt from '../mqtt/mod.ts';
import { ByteReader, concatBytes, numToTwoByteInteger, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import type { UnsubackPacket } from './packet_types.ts';

export function toBytes(
  packet: UnsubackPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const variableHeaderChunks: (Uint8Array | number[])[] = [numToTwoByteInteger(packet.packetId)]; //packetId
  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    // MQTT V5.0
    variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    const payload = packet.reasonCodes!;

    const fixedHeader = [
      (Mqtt.PacketType.UNSUBACK << 4) + Mqtt.fixedHeaderFlag.UNSUBACK,
      ...remainingLengthToBytes(variableHeader.length + payload.length),
    ];

    return concatBytes([fixedHeader, variableHeader, payload]);
  } else {
    const fixedHeader = [
      (Mqtt.PacketType.UNSUBACK << 4) + Mqtt.fixedHeaderFlag.UNSUBACK,
      ...remainingLengthToBytes(variableHeader.length),
    ];

    return concatBytes([fixedHeader, variableHeader]);
  }
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): UnsubackPacket {
  const reader = new ByteReader(buffer, remainingLength);
  const packetId = reader.readTwoByteInteger();

  if (protocolVersion === Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    // MQTT 3.1.1 UNSUBACK has only the Packet Identifier.
    reader.expectEnd('UNSUBACK');
    return {
      type: 'unsuback',
      packetId,
    };
  }

  const properties = readProperties(reader);
  return {
    type: 'unsuback',
    packetId,
    reasonCodes: Array.from(reader.readRest()),
    ...(properties && { properties }),
  };
}

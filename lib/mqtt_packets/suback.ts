import * as Mqtt from '../mqtt/mod.ts';
import { ByteReader, concatBytes, numToTwoByteInteger, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import type { SubackPacket } from './packet_types.ts';

export function toBytes(
  packet: SubackPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const variableHeaderChunks: (Uint8Array | number[])[] = [numToTwoByteInteger(packet.packetId)]; //packetId
  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    // MQTT V5.0
    variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  // MQTT 5.0 SUBACK has Reason Codes, MQTT 3.1.1 SUBACK has Return Codes.
  const payload = (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) ? packet.reasonCodes : packet.returnCodes;
  if (payload === undefined) {
    throw new Error(`SUBACK has no ${protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1 ? 'reasonCodes' : 'returnCodes'}`);
  }

  const fixedHeader = [
    (Mqtt.PacketType.SUBACK << 4) + Mqtt.fixedHeaderFlag.SUBACK,
    ...remainingLengthToBytes(variableHeader.length + payload.length),
  ];

  return concatBytes([fixedHeader, variableHeader, payload]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): SubackPacket {
  const reader = new ByteReader(buffer, remainingLength);
  const packetId = reader.readTwoByteInteger();

  if (protocolVersion === Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    return {
      type: 'suback',
      packetId,
      returnCodes: Array.from(reader.readRest()),
    };
  }

  const properties = readProperties(reader);
  return {
    type: 'suback',
    packetId,
    reasonCodes: Array.from(reader.readRest()),
    ...(properties && { properties }),
  };
}

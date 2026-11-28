import * as Mqtt from '../mqtt/mod.ts';
import { ByteReader, concatBytes, numToTwoByteInteger, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { answerPacketIdValue, reasonCodeValue, unsubackReasonCodes } from './field_values.ts';
import type { UnsubackPacket } from './packet_types.ts';

export function toBytes(
  packet: UnsubackPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const variableHeaderChunks: (Uint8Array | number[])[] = [numToTwoByteInteger(answerPacketIdValue('UNSUBACK', packet.packetId))]; //packetId
  if (protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1) {
    // MQTT V5.0
    variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  if (protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1) {
    if (packet.reasonCodes === undefined) {
      throw new Error('UNSUBACK has no reasonCodes');
    }
    const payload = packet.reasonCodes.map((code, i) => reasonCodeValue('UNSUBACK', `reasonCodes[${i}]`, code, unsubackReasonCodes));

    const fixedHeader = [
      (Mqtt.PacketType.Unsuback << 4) + Mqtt.FixedHeaderFlag.Unsuback,
      ...remainingLengthToBytes(variableHeader.length + payload.length),
    ];

    return concatBytes([fixedHeader, variableHeader, payload]);
  } else {
    const fixedHeader = [
      (Mqtt.PacketType.Unsuback << 4) + Mqtt.FixedHeaderFlag.Unsuback,
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

  if (protocolVersion === Mqtt.ProtocolVersion.MqttV3_1_1) {
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

import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { concatBytes, numToTwoByteInteger, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import type { PubrecPacket } from './packet_types.ts';
import { answerPacketIdValue, pubackReasonCodes, reasonCodeValue } from './field_values.ts';
import { parsePublishAck } from './publish_ack.ts';

export function toBytes(
  packet: PubrecPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const variableHeaderChunks: (Uint8Array | number[])[] = [numToTwoByteInteger(answerPacketIdValue('PUBREC', packet.packetId))]; //packetId

  if (protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1) {
    const reasonCode = reasonCodeValue('PUBREC', 'reasonCode', packet.reasonCode ?? 0x00, pubackReasonCodes); // 0x00 success
    if (packet.properties) {
      variableHeaderChunks.push([reasonCode]);
      variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
    } else {
      if (reasonCode !== 0x00) {
        variableHeaderChunks.push([reasonCode]);
      }
    }
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  const fixedHeader = [
    (Mqtt.PacketType.Pubrec << 4) + Mqtt.FixedHeaderFlag.Pubrec,
    ...remainingLengthToBytes(variableHeader.length),
  ];

  return concatBytes([fixedHeader, variableHeader]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): PubrecPacket {
  return { type: 'pubrec', ...parsePublishAck(buffer, remainingLength, protocolVersion, 'PUBREC') };
}

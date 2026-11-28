import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { concatBytes, numToTwoByteInteger, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import type { PubcompPacket } from './packet_types.ts';
import { answerPacketIdValue, pubrelReasonCodes, reasonCodeValue } from './field_values.ts';
import { parsePublishAck } from './publish_ack.ts';

export function toBytes(
  packet: PubcompPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const variableHeaderChunks: (Uint8Array | number[])[] = [numToTwoByteInteger(answerPacketIdValue('PUBCOMP', packet.packetId))]; //packetId

  if (protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1) {
    const reasonCode = reasonCodeValue('PUBCOMP', 'reasonCode', packet.reasonCode ?? 0x00, pubrelReasonCodes); // 0x00 success
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
    (Mqtt.PacketType.Pubcomp << 4) + Mqtt.FixedHeaderFlag.Pubcomp,
    ...remainingLengthToBytes(variableHeader.length),
  ];

  return concatBytes([fixedHeader, variableHeader]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): PubcompPacket {
  return { type: 'pubcomp', ...parsePublishAck(buffer, remainingLength, protocolVersion, 'PUBCOMP') };
}

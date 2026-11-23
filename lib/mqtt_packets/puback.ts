import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { concatBytes, numToTwoByteInteger, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import type { PubackPacket } from './packet_types.ts';
import { parsePublishAck } from './publish_ack.ts';

export function toBytes(
  packet: PubackPacket,
  protocolVersion: Mqtt.ProtocolVersion,
) {
  const variableHeaderChunks: (Uint8Array | number[])[] = [numToTwoByteInteger(packet.packetId)]; //packetId

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    const reasonCode = packet.reasonCode || 0x00; // 0x00 success
    if (packet.properties) {
      variableHeaderChunks.push([reasonCode & 0xFF]);
      variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
    } else {
      if (reasonCode != 0x00) {
        variableHeaderChunks.push([reasonCode & 0xFF]);
      }
    }
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  const fixedHeader = [
    (Mqtt.PacketType.PUBACK << 4) + Mqtt.fixedHeaderFlag.PUBACK,
    ...remainingLengthToBytes(variableHeader.length),
  ];

  return concatBytes([fixedHeader, variableHeader]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): PubackPacket {
  return { type: 'puback', ...parsePublishAck(buffer, remainingLength, protocolVersion, 'PUBACK') };
}

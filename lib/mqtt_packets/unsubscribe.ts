import * as Mqtt from '../mqtt/mod.ts';
import { ByteReader, concatBytes, numToTwoByteInteger, remainingLengthToBytes, stringToUtfEncodedString } from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import type { UnsubscribePacket } from './packet_types.ts';

export function toBytes(
  packet: UnsubscribePacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const variableHeaderChunks: (Uint8Array | number[])[] = [numToTwoByteInteger(packet.packetId)];
  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    if (packet.properties) {
      variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
    } else {
      variableHeaderChunks.push([0x00]);
    }
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  const payloadChunks: (Uint8Array | number[])[] = [];
  for (const topic of packet.topicFilters) {
    payloadChunks.push(stringToUtfEncodedString(topic));
  }

  const payload = concatBytes(payloadChunks);

  const fixedHeader = [
    (Mqtt.PacketType.UNSUBSCRIBE << 4) + Mqtt.fixedHeaderFlag.UNSUBSCRIBE,
    ...remainingLengthToBytes(variableHeader.length + payload.length),
  ];

  return concatBytes([fixedHeader, variableHeader, payload]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): UnsubscribePacket {
  const reader = new ByteReader(buffer, remainingLength);
  const packetId = reader.readTwoByteInteger();
  const properties = protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1 ? readProperties(reader) : undefined;

  const topicFilters: string[] = [];
  while (reader.remaining > 0) {
    topicFilters.push(reader.readUtf8EncodedString());
  }

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    if (properties) {
      return {
        type: 'unsubscribe',
        packetId,
        topicFilters,
        properties: properties,
      };
    } else {
      return {
        type: 'unsubscribe',
        packetId,
        topicFilters,
      };
    }
  } else {
    return {
      type: 'unsubscribe',
      packetId,
      topicFilters,
    };
  }
}

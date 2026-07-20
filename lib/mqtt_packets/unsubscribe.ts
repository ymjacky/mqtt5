import * as Mqtt from '../mqtt/mod.ts';
import {
  concatBytes,
  numToTwoByteInteger,
  numToVariableByteInteger,
  stringToUtfEncodedString,
  utfEncodedStringToString,
  variableByteIntegerToNum,
} from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';

export type UnsubscribePacket = {
  type: 'unsubscribe';
  packetId: number;
  topicFilters: string[];
  properties?: MqttProperties.UnsubackProperties;
};

export function toBytes(
  packet: UnsubscribePacket,
  protocolVersion: Mqtt.ProtocolVersion,
) {
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
    (Mqtt.PacketType.UNSUBSCRIBE << 4) + Mqtt.fixexHeaderFlag.UNSUBSCRIBE,
    ...numToVariableByteInteger(variableHeader.length + payload.length),
  ];

  return concatBytes([fixedHeader, variableHeader, payload]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): UnsubscribePacket {
  let pos = 0;
  const packetId = (buffer[pos++] << 8) + buffer[pos++];

  const properties = (() => {
    if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
      const { number: length, size: consumedBytesSize } = variableByteIntegerToNum(buffer, pos);
      pos += consumedBytesSize;
      if (length > 0) {
        const prop = MqttProperties.parseMqttProperties(buffer, pos, length);
        pos += length;
        return prop;
      }
      return undefined;
    } else {
      return undefined;
    }
  })();

  const topicFilters: string[] = [];

  while (pos < remainingLength) {
    const topicFilter = utfEncodedStringToString(buffer, pos);
    pos += topicFilter.length;

    topicFilters.push(topicFilter.value);
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

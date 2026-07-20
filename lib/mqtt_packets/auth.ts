import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { concatBytes, numToVariableByteInteger, variableByteIntegerToNum } from '../mqtt_utils/mod.ts';

export type AuthPacket = {
  type: 'auth';
  reasonCode?: number;
  properties?: MqttProperties.AuthProperties;
};

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
    (Mqtt.PacketType.AUTH << 4) + Mqtt.fixexHeaderFlag.AUTH,
    ...numToVariableByteInteger(variableHeader.length),
  ];

  return concatBytes([fixedHeader, variableHeader]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  _protocolVersion: Mqtt.ProtocolVersion,
): AuthPacket {
  let pos = 0;

  if (remainingLength == 0) {
    return {
      type: 'auth',
      reasonCode: Mqtt.ReasonCode.Success,
    };
  }

  const reasonCode = buffer[pos++] & 0xFF;
  if (remainingLength > pos) {
    const properties = (() => {
      const { number: length, size: consumedBytesSize } = variableByteIntegerToNum(buffer, pos);
      pos += consumedBytesSize;

      if (length > 0) {
        const prop = MqttProperties.parseMqttProperties(buffer, pos, length);
        pos += length;
        return prop;
      } else {
        return undefined;
      }
    })();

    if (properties) {
      return {
        type: 'auth',
        reasonCode,
        properties,
      };
    }
  }

  return {
    type: 'auth',
    reasonCode,
  };
}

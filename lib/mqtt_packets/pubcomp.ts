import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { MqttUtilsError } from '../mqtt_utils/mod.ts';
import { numToTwoByteInteger, numToVariableByteInteger, twoByteIntegerToNum, variableByteIntegerToNum } from '../mqtt_utils/mod.ts';

export type PubcompPacket = {
  type: 'pubcomp';
  packetId: number;
  reasonCode?: number;
  properties?: MqttProperties.PubcompProperties;
};

export function toBytes(
  packet: PubcompPacket,
  protocolVersion: Mqtt.ProtocolVersion,
) {
  const variableHeader = [...numToTwoByteInteger(packet.packetId)]; //packetId

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    const reasonCode = packet.reasonCode || 0x00; // 0x00 success
    if (packet.properties) {
      variableHeader.push(reasonCode & 0xFF);
      variableHeader.push(...MqttProperties.propertiesToBytes(packet.properties));
    } else {
      if (reasonCode != 0x00) {
        variableHeader.push(reasonCode & 0xFF);
      }
    }
  }

  const fixedHeader = [
    (Mqtt.PacketType.PUBCOMP << 4) + Mqtt.fixexHeaderFlag.PUBCOMP,
    ...numToVariableByteInteger(variableHeader.length),
  ];

  return Uint8Array.from([...fixedHeader, ...variableHeader]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): PubcompPacket {
  let pos = 0;

  if (remainingLength < 2) {
    throw new MqttUtilsError.RemainingLengthError('pubcomp packet');
  }
  const packetId = twoByteIntegerToNum(buffer, pos);
  pos += 2;

  if ((protocolVersion === Mqtt.ProtocolVersion.MQTT_V3_1_1) || (remainingLength == pos)) {
    return {
      type: 'pubcomp',
      packetId: packetId,
    };
  }

  const reasonCode = buffer[pos++];
  if (remainingLength == pos) {
    return {
      type: 'pubcomp',
      packetId: packetId,
      reasonCode: reasonCode,
    };
  }

  const properties = (() => {
    const { number: length, size: consumedBytesSize } = variableByteIntegerToNum(buffer, pos);
    pos += consumedBytesSize;
    const prop = MqttProperties.parseMqttProperties(buffer, pos, length);
    pos += length;
    return prop;
  })();

  return {
    type: 'pubcomp',
    packetId: packetId,
    reasonCode: reasonCode,
    properties: properties,
  };
}

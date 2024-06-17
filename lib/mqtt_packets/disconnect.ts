import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { numToVariableByteInteger, variableByteIntegerToNum } from '../mqtt_utils/mod.ts';

export type DisconnectPacket = {
  type: 'disconnect';
  reasonCode?: number;
  properties?: MqttProperties.DisconnectProperties;
};

export function toBytes(
  packet: DisconnectPacket,
  protocolVersion: Mqtt.ProtocolVersion,
) {
  const variableHeader = [];

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
    (Mqtt.PacketType.DISCONNECT << 4) + Mqtt.fixexHeaderFlag.DISCONNECT,
    ...numToVariableByteInteger(variableHeader.length),
  ];

  return Uint8Array.from([...fixedHeader, ...variableHeader]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): DisconnectPacket {
  if (protocolVersion === Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    return {
      type: 'disconnect',
    };
  }

  let pos = 0;
  const reasonCode = buffer[pos++];
  if (remainingLength == pos) {
    return {
      type: 'disconnect',
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
    type: 'disconnect',
    reasonCode: reasonCode,
    properties: properties,
  };
}

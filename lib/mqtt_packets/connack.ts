import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { numToVariableByteInteger, variableByteIntegerToNum } from '../mqtt_utils/mod.ts';

export type ConnackPacket = {
  type: 'connack';
  sessionPresent: boolean;
  returnCode?: Mqtt.V3_1_1_ConnectReturnCode;
  reasonCode?: Mqtt.ReasonCode;
  properties?: MqttProperties.ConnackProperties;
};

export function toBytes(
  packet: ConnackPacket,
  protocolVersion: Mqtt.ProtocolVersion,
) {
  const variableHeader = [];
  variableHeader.push(packet.sessionPresent ? 1 : 0);
  if (protocolVersion > 4) {
    const reasonCode = packet.reasonCode || 0x00; // 0x00 success
    variableHeader.push(reasonCode & 0xFF);
    variableHeader.push(...MqttProperties.propertiesToBytes(packet.properties));
  } else {
    const returnCode = packet.returnCode || 0x00; // 0x00 success
    variableHeader.push(returnCode & 0xFF);
  }

  const fixedHeader = [
    (Mqtt.PacketType.CONNACK << 4) + Mqtt.fixexHeaderFlag.CONNACK,
    ...numToVariableByteInteger(variableHeader.length),
  ];

  return Uint8Array.from([...fixedHeader, ...variableHeader]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): ConnackPacket {
  let pos = 0;

  if (remainingLength < 2) {
    throw Error('malformed length');
  }

  const sessionPresent = (buffer[pos++] & 0b00000001) === 0 ? false : true;

  const rc = buffer[pos++];

  if (protocolVersion === Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    const returnCode = rc as Mqtt.V3_1_1_ConnectReturnCode;
    return {
      type: 'connack',
      sessionPresent,
      returnCode,
    };
  }

  const reasonCode = rc as Mqtt.ReasonCode;
  const properties = (() => {
    const { number: length, size: consumedBytesSize } = variableByteIntegerToNum(buffer, pos);
    pos += consumedBytesSize;

    if (length > 0) {
      const prop = MqttProperties.parseMqttProperties(buffer, pos, length);
      pos += length;
      return prop;
    }
    return undefined;
  })();

  if (properties) {
    return {
      type: 'connack',
      sessionPresent: sessionPresent,
      reasonCode: reasonCode,
      properties: properties,
    };
  } else {
    return {
      type: 'connack',
      sessionPresent: sessionPresent,
      reasonCode: reasonCode,
    };
  }
}

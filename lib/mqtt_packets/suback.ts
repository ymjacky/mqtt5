import * as Mqtt from '../mqtt/mod.ts';
import { numToTwoByteInteger, numToVariableByteInteger, twoByteIntegerToNum, variableByteIntegerToNum } from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';

export type SubackPacket = {
  type: 'suback';
  packetId: number;
  returnCodes?: number[];
  reasonCodes?: number[];
  properties?: MqttProperties.SubackProperties;
};

export function toBytes(
  packet: SubackPacket,
  protocolVersion: Mqtt.ProtocolVersion,
) {
  const variableHeader = [...numToTwoByteInteger(packet.packetId)]; //packetId
  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    // MQTT V5.0
    variableHeader.push(...MqttProperties.propertiesToBytes(packet.properties));
  }

  const payload: number[] = (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) ? packet.reasonCodes! : packet.returnCodes!;

  const fixedHeader = [
    (Mqtt.PacketType.SUBACK << 4) + Mqtt.fixexHeaderFlag.SUBACK,
    ...numToVariableByteInteger(variableHeader.length + payload.length),
  ];

  return Uint8Array.from([...fixedHeader, ...variableHeader, ...payload]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): SubackPacket {
  let pos = 0;

  const packetId = twoByteIntegerToNum(buffer, pos);
  pos += 2;

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

  const rc = [];
  const payloadEnd = remainingLength;
  for (let i = pos; i < payloadEnd; i++) {
    rc.push(buffer[i]);
  }

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    if (properties) {
      return {
        type: 'suback',
        packetId: packetId,
        reasonCodes: rc,
        properties: properties,
      };
    } else {
      return {
        type: 'suback',
        packetId: packetId,
        reasonCodes: rc,
      };
    }
  } else {
    return {
      type: 'suback',
      packetId: packetId,
      returnCodes: rc,
    };
  }
}

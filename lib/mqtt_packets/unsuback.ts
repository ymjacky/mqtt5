import * as Mqtt from '../mqtt/mod.ts';
import { numToTwoByteInteger, numToVariableByteInteger, twoByteIntegerToNum, variableByteIntegerToNum } from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';

export type UnsubackPacket = {
  type: 'unsuback';
  packetId: number;
  reasonCodes?: number[];
  properties?: MqttProperties.UnsubackProperties;
};

export function toBytes(
  packet: UnsubackPacket,
  protocolVersion: Mqtt.ProtocolVersion,
) {
  const variableHeader = [...numToTwoByteInteger(packet.packetId)]; //packetId
  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    // MQTT V5.0
    variableHeader.push(...MqttProperties.propertiesToBytes(packet.properties));
  }

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    const payload = packet.reasonCodes!;

    const fixedHeader = [
      (Mqtt.PacketType.UNSUBACK << 4) + Mqtt.fixexHeaderFlag.UNSUBACK,
      ...numToVariableByteInteger(variableHeader.length + payload.length),
    ];

    return Uint8Array.from([...fixedHeader, ...variableHeader, ...payload]);
  } else {
    const fixedHeader = [
      (Mqtt.PacketType.UNSUBACK << 4) + Mqtt.fixexHeaderFlag.UNSUBACK,
      ...numToVariableByteInteger(variableHeader.length),
    ];

    return Uint8Array.from([...fixedHeader, ...variableHeader]);
  }
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): UnsubackPacket {
  let pos = 0;

  const packetId = twoByteIntegerToNum(buffer, pos);
  pos += 2;

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    const properties = (() => {
      const { number: length, size: consumedBytesSize } = variableByteIntegerToNum(buffer, pos);
      pos += consumedBytesSize;
      const prop = MqttProperties.parseMqttProperties(buffer, pos, length);
      pos += length;
      return prop;
    })();

    const reasonCodes = [];
    while (pos < remainingLength) {
      reasonCodes.push(buffer[pos++]);
    }

    return {
      type: 'unsuback',
      packetId: packetId,
      reasonCodes: reasonCodes,
      properties: properties,
    };
  } else {
    return {
      type: 'unsuback',
      packetId: packetId,
    };
  }
}

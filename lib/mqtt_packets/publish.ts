import * as Mqtt from '../mqtt/mod.ts';
import {
  numToQoS,
  numToTwoByteInteger,
  numToVariableByteInteger,
  stringToBytes,
  stringToUtfEncodedString,
  twoByteIntegerToNum,
  utfEncodedStringToString,
  variableByteIntegerToNum,
} from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';

export type PublishPacket = {
  type: 'publish';
  topic: string;
  payload: Uint8Array;
  dup: boolean;
  retain: boolean;
  qos: Mqtt.QoS;
  packetId?: number;
  properties?: MqttProperties.PublishProperties;
};

export function toBytes(
  packet: PublishPacket,
  protocolVersion: Mqtt.ProtocolVersion,
) {
  const qos = packet.qos || Mqtt.QoS.AT_MOST_ONCE;

  const flags = // fixedHeader Flags
    (packet.dup ? 0b1000 : 0) + // dup
    (qos << 1) + // qos
    (packet.retain ? 1 : 0); // retain

  const variableHeader = [...stringToUtfEncodedString(packet.topic)]; // topic

  if (qos === Mqtt.QoS.AT_LEAST_ONCE || qos === Mqtt.QoS.EXACTRY_ONCE) {
    variableHeader.push(...numToTwoByteInteger(packet.packetId!));
  }

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    variableHeader.push(...MqttProperties.propertiesToBytes(packet.properties));
  }

  let payload = packet.payload;

  if (typeof payload === 'string') {
    payload = stringToBytes(payload);
  }

  const fixedHeader = [
    (Mqtt.PacketType.PUBLISH << 4) + flags,
    ...numToVariableByteInteger(variableHeader.length + payload.length),
  ];

  return Uint8Array.from([...fixedHeader, ...variableHeader, ...payload]);
}

export function parse(
  packetFlags: number,
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): PublishPacket {
  // fixed header
  const flags = packetFlags & 0x0f;
  const dup = (flags & 0b1000) == 0b1000 ? true : false;
  const qos = numToQoS((flags & 0b0110) >> 1);
  const retain = (flags & 0b0001) == 0b0001 ? true : false;

  let pos = 0;
  // Variable Header
  const topicInfo = utfEncodedStringToString(buffer, pos);
  const topic = topicInfo.value;

  pos += topicInfo.length;

  const packetId = (() => {
    if (qos === Mqtt.QoS.AT_LEAST_ONCE || qos == Mqtt.QoS.EXACTRY_ONCE) {
      const id = twoByteIntegerToNum(buffer, pos);
      pos += 2; // 2 = two byte Integer
      return id;
    } else {
      return undefined;
    }
  })();

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
    }
  })();

  const payload = buffer.slice(pos, remainingLength);

  return {
    type: 'publish',
    topic,
    payload,
    dup,
    retain,
    qos,
    packetId,
    properties: properties,
  };
}

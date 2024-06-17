import * as Mqtt from '../mqtt/mod.ts';
import {
  numToQoS,
  numToTwoByteInteger,
  numToVariableByteInteger,
  stringToUtfEncodedString,
  utfEncodedStringToString,
  variableByteIntegerToNum,
} from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';

export type SubscribePacket = {
  type: 'subscribe';
  packetId: number;
  subscriptions: Subscription[];
  properties?: MqttProperties.SubscribeProperties;
};

export type Subscription = {
  topicFilter: string;
  qos: Mqtt.QoS;
  retainHandling?: Mqtt.RetainHandling;
  retainAsPublished?: boolean;
  noLocal?: boolean;
};

export function toBytes(
  packet: SubscribePacket,
  protocolVersion: Mqtt.ProtocolVersion,
) {
  const variableHeader = [...numToTwoByteInteger(packet.packetId)];
  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    if (packet.properties) {
      variableHeader.push(...MqttProperties.propertiesToBytes(packet.properties));
    } else {
      variableHeader.push(0x00);
    }
  }

  const payload = [];
  for (const sub of packet.subscriptions) {
    if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
      const subscriptionOptions = // 7-6bit = reserve, 5-4bit = retainHandling, 3bit = retainAsPublished, 2-1bit = qos
        (sub.retainHandling ? (sub.retainHandling << 4) : 0) |
        (sub.retainAsPublished ? 0b00001000 : 0) |
        (sub.noLocal ? 0b00000100 : 0) |
        (sub.qos === Mqtt.QoS.EXACTRY_ONCE ? 0b00000010 : 0) |
        (sub.qos === Mqtt.QoS.AT_LEAST_ONCE ? 0b00000001 : 0);

      payload.push(...stringToUtfEncodedString(sub.topicFilter), subscriptionOptions);
    } else {
      payload.push(...stringToUtfEncodedString(sub.topicFilter), sub.qos);
    }
  }

  const fixedHeader = [
    (Mqtt.PacketType.SUBSCRIBE << 4) + Mqtt.fixexHeaderFlag.SUBSCRIBE,
    ...numToVariableByteInteger(variableHeader.length + payload.length),
  ];

  return Uint8Array.from([...fixedHeader, ...variableHeader, ...payload]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): SubscribePacket {
  let pos = 0;
  const packetId = (buffer[pos++] << 8) + buffer[pos++];

  const properties = (() => {
    if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
      const { number: length, size: consumedBytesSize } = variableByteIntegerToNum(buffer, pos);
      pos += consumedBytesSize;
      const prop = MqttProperties.parseMqttProperties(buffer, pos, length);
      pos += length;
      return prop;
    } else {
      return undefined;
    }
  })();

  // const subscriptionsStart = pos;
  const subscriptions: Subscription[] = [];

  do {
    const topicFilterInfo = utfEncodedStringToString(buffer, pos);
    pos += topicFilterInfo.length;
    if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
      const subscribeOptions = buffer[pos++];

      const retainHandling = (() => {
        const retainHandlingVal = (subscribeOptions & 0b00110000) >> 4;
        return retainHandlingVal as Mqtt.RetainHandling;
      })();

      subscriptions.push({
        topicFilter: topicFilterInfo.value,
        qos: numToQoS(subscribeOptions & 0b00000011),
        retainHandling: retainHandling,
        retainAsPublished: (subscribeOptions & 0b00001000) === 0b00000000 ? false : true,
        noLocal: (subscribeOptions & 0b00000100) === 0b00000000 ? false : true,
      });
    } else {
      subscriptions.push({
        topicFilter: topicFilterInfo.value,
        qos: numToQoS(buffer[pos++]),
      });
    }
  } while (pos < remainingLength);

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    return {
      type: 'subscribe',
      packetId,
      subscriptions,
      properties: properties,
    };
  } else {
    return {
      type: 'subscribe',
      packetId,
      subscriptions,
    };
  }
}

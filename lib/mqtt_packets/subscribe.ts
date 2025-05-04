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
      const propBytes = MqttProperties.propertiesToBytes(packet.properties);
      variableHeader.push(...propBytes);
    } else {
      variableHeader.push(0x00); // Property length 0
    }
  }

  const payload = [];
  for (const sub of packet.subscriptions) {
    if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
      const subscriptionOptions = (0b0) | // 7bit reserved
        (0b0) | // 6bit reserved
        (sub.retainHandling === Mqtt.RetainHandling.DoNotSend ? 0b00100000 : 0) | // 5bit for retainHandling
        (sub.retainHandling === Mqtt.RetainHandling.AtSubscribeOnlyIfTheSubscriptionDoesNotCurrentlyExist ? 0b00010000 : 0) | // 4bit for retainHandling
        (sub.retainAsPublished ? 0b00001000 : 0) | // 3bit for retainAsPublished
        (sub.noLocal ? 0b00000100 : 0) | // 2bit for noLocal
        (sub.qos === Mqtt.QoS.EXACTRY_ONCE ? 0b00000010 : 0) | // 1bit for qos
        (sub.qos === Mqtt.QoS.AT_LEAST_ONCE ? 0b00000001 : 0); // 0bit for qos

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
      if (length > 0) {
        const props = MqttProperties.parseMqttProperties(buffer, pos, length);
        pos += length;
        return props;
      } else {
        return {}; // Return empty object if no properties
      }
    } else {
      return undefined;
    }
  })();

  const subscriptions: Subscription[] = [];

  while (pos < remainingLength) {
    const topicFilterInfo = utfEncodedStringToString(buffer, pos);
    pos += topicFilterInfo.length;

    if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
      const subscribeOptions = buffer[pos++];

      // Get RetainHandling from 5-4bit (0b00110000 = 0x30)
      const retainHandling = (subscribeOptions & 0b00110000) >> 4;

      subscriptions.push({
        topicFilter: topicFilterInfo.value,
        qos: numToQoS(subscribeOptions & 0b00000011), // QoS in lower 2 bits
        retainHandling: retainHandling as Mqtt.RetainHandling,
        retainAsPublished: !!(subscribeOptions & 0b00001000), // 3rd bit: retainAsPublished
        noLocal: !!(subscribeOptions & 0b00000100), // 2nd bit: noLocal
      });
    } else {
      subscriptions.push({
        topicFilter: topicFilterInfo.value,
        qos: numToQoS(buffer[pos++]),
      });
    }
  }

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

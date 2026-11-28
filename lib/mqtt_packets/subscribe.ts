import * as Mqtt from '../mqtt/mod.ts';
import { ByteReader, concatBytes, numToQoS, numToTwoByteInteger, remainingLengthToBytes, stringToUtfEncodedString } from '../mqtt_utils/mod.ts';
import { ProtocolViolationError } from '../mqtt_utils/error.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { packetIdValue, zeroToTwoValue } from './field_values.ts';
import type { SubscribePacket, Subscription } from './packet_types.ts';

export function toBytes(
  packet: SubscribePacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const variableHeaderChunks: (Uint8Array | number[])[] = [numToTwoByteInteger(packetIdValue('SUBSCRIBE', packet.packetId))];
  if (protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1) {
    if (packet.properties) {
      variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
    } else {
      variableHeaderChunks.push([0x00]); // Property length 0
    }
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  const payloadChunks: (Uint8Array | number[])[] = [];
  for (const [i, sub] of packet.subscriptions.entries()) {
    const qos = zeroToTwoValue('SUBSCRIBE', `subscriptions[${i}].qos`, sub.qos);
    if (protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1) {
      // MQTT 3.1.1 has no Retain Handling.
      const retainHandling = zeroToTwoValue(
        'SUBSCRIBE',
        `subscriptions[${i}].retainHandling`,
        sub.retainHandling ?? Mqtt.RetainHandling.AtTheTimeOfTheSubscribe,
      );
      const subscriptionOptions = (0b0) | // 7bit reserved
        (0b0) | // 6bit reserved
        (retainHandling === Mqtt.RetainHandling.DoNotSend ? 0b00100000 : 0) | // 5bit for retainHandling
        (retainHandling === Mqtt.RetainHandling.AtSubscribeOnlyIfTheSubscriptionDoesNotCurrentlyExist ? 0b00010000 : 0) | // 4bit for retainHandling
        (sub.retainAsPublished ? 0b00001000 : 0) | // 3bit for retainAsPublished
        (sub.noLocal ? 0b00000100 : 0) | // 2bit for noLocal
        (qos === Mqtt.QoS.ExactlyOnce ? 0b00000010 : 0) | // 1bit for qos
        (qos === Mqtt.QoS.AtLeastOnce ? 0b00000001 : 0); // 0bit for qos

      payloadChunks.push(stringToUtfEncodedString(sub.topicFilter), [subscriptionOptions]);
    } else {
      payloadChunks.push(stringToUtfEncodedString(sub.topicFilter), [qos]);
    }
  }

  const payload = concatBytes(payloadChunks);

  const fixedHeader = [
    (Mqtt.PacketType.Subscribe << 4) + Mqtt.FixedHeaderFlag.Subscribe,
    ...remainingLengthToBytes(variableHeader.length + payload.length),
  ];

  return concatBytes([fixedHeader, variableHeader, payload]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): SubscribePacket {
  const reader = new ByteReader(buffer, remainingLength);
  const packetId = reader.readTwoByteInteger();

  const properties = (() => {
    if (protocolVersion === Mqtt.ProtocolVersion.MqttV3_1_1) {
      return undefined;
    }
    const { subscriptionIdentifiers, ...props } = readProperties(reader) ?? {};
    if (typeof subscriptionIdentifiers === 'undefined') {
      return props;
    }
    // Unlike PUBLISH, SUBSCRIBE must not carry more than one Subscription Identifier (MQTT 5.0 section 3.8.2.1.2).
    if (subscriptionIdentifiers.length > 1) {
      throw new ProtocolViolationError('SUBSCRIBE must not include the Subscription Identifier more than once');
    }
    return { ...props, subscriptionIdentifier: subscriptionIdentifiers[0] };
  })();

  const subscriptions: Subscription[] = [];
  while (reader.remaining > 0) {
    const topicFilter = reader.readUtf8EncodedString();

    if (protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1) {
      const subscribeOptions = reader.readByte();

      // Get RetainHandling from 5-4bit (0b00110000 = 0x30)
      const retainHandling = (subscribeOptions & 0b00110000) >> 4;

      subscriptions.push({
        topicFilter,
        qos: numToQoS(subscribeOptions & 0b00000011), // QoS in lower 2 bits
        retainHandling: retainHandling as Mqtt.RetainHandling,
        retainAsPublished: !!(subscribeOptions & 0b00001000), // 3rd bit: retainAsPublished
        noLocal: !!(subscribeOptions & 0b00000100), // 2nd bit: noLocal
      });
    } else {
      subscriptions.push({
        topicFilter,
        qos: numToQoS(reader.readByte()),
      });
    }
  }

  if (protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1) {
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

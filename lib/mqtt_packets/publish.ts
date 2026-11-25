import * as Mqtt from '../mqtt/mod.ts';
import { ByteReader, concatBytes, numToQoS, numToTwoByteInteger, remainingLengthToBytes, stringToBytes, stringToUtfEncodedString } from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import type { PublishPacket } from './packet_types.ts';

export function toBytes(
  packet: PublishPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const qos = packet.qos || Mqtt.QoS.AT_MOST_ONCE;

  const flags = // fixedHeader Flags
    (packet.dup ? 0b1000 : 0) + // dup
    (qos << 1) + // qos
    (packet.retain ? 1 : 0); // retain

  const variableHeaderChunks: (Uint8Array | number[])[] = [stringToUtfEncodedString(packet.topic)]; // topic

  if (packet.qos === Mqtt.QoS.AT_LEAST_ONCE || packet.qos === Mqtt.QoS.EXACTLY_ONCE) {
    variableHeaderChunks.push(numToTwoByteInteger(packet.packetId));
  }

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  let payload = packet.payload;

  if (typeof payload === 'string') {
    payload = stringToBytes(payload);
  }

  const fixedHeader = [
    (Mqtt.PacketType.PUBLISH << 4) + flags,
    ...remainingLengthToBytes(variableHeader.length + payload.length),
  ];

  return concatBytes([fixedHeader, variableHeader, payload]);
}

export function parse(
  packetFlags: number,
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): PublishPacket {
  // fixed header
  const flags = packetFlags & 0x0f;
  const dup = (flags & 0b1000) === 0b1000 ? true : false;
  const qos = numToQoS((flags & 0b0110) >> 1);
  const retain = (flags & 0b0001) === 0b0001 ? true : false;

  // variable header
  const reader = new ByteReader(buffer, remainingLength);
  const topic = reader.readUtf8EncodedString();
  // Only QoS 1 and QoS 2 have a packet ID.
  const qosAndPacketId = qos === Mqtt.QoS.AT_MOST_ONCE ? { qos } : { qos, packetId: reader.readTwoByteInteger() };
  const properties = protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1 ? readProperties(reader) : undefined;

  // payload: the rest of the packet
  const payload = reader.readRest();

  return {
    type: 'publish',
    topic,
    payload,
    dup,
    retain,
    ...qosAndPacketId,
    properties: properties,
  };
}

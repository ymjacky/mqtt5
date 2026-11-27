import * as Mqtt from '../mqtt/mod.ts';
import { ByteReader, concatBytes, numToQoS, numToTwoByteInteger, remainingLengthToBytes, stringToUtfEncodedString } from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { ProtocolViolationError } from '../mqtt_utils/error.ts';
import { packetIdValue, zeroToTwoValue } from './field_values.ts';
import type { PublishPacket } from './packet_types.ts';

export function toBytes(
  packet: PublishPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const qos = zeroToTwoValue('PUBLISH', 'qos', packet.qos ?? Mqtt.QoS.AtMostOnce);

  const flags = // fixedHeader Flags
    (packet.dup ? 0b1000 : 0) + // dup
    (qos << 1) + // qos
    (packet.retain ? 1 : 0); // retain

  const variableHeaderChunks: (Uint8Array | number[])[] = [stringToUtfEncodedString(packet.topic)]; // topic

  // Only QoS 1 and QoS 2 have a packet ID [MQTT-2.2.1-2].
  if (packet.qos === Mqtt.QoS.AtLeastOnce || packet.qos === Mqtt.QoS.ExactlyOnce) {
    variableHeaderChunks.push(numToTwoByteInteger(packetIdValue('PUBLISH', packet.packetId)));
  }

  if (protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1) {
    variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  const payload = packet.payload;

  const fixedHeader = [
    (Mqtt.PacketType.Publish << 4) + flags,
    ...remainingLengthToBytes(variableHeader.length + payload.length),
  ];

  return concatBytes([fixedHeader, variableHeader, payload]);
}

/**
 * Reads the packet ID of a PUBLISH with QoS 1 or QoS 2. The sender must give it a packet ID other than 0 ([MQTT-2.2.1-3],
 * [MQTT-2.2.1-4]; MQTT 3.1.1 [MQTT-2.3.1-1]): a PUBLISH with 0 can be read, but has data that the protocol does not allow,
 * which is a Protocol Error (MQTT 5.0 4.13).
 * @throws {ProtocolViolationError} if the packet ID is 0.
 */
function readPacketId(reader: ByteReader): number {
  const packetId = reader.readTwoByteInteger();
  if (packetId === 0) {
    throw new ProtocolViolationError('the packet ID of a PUBLISH with QoS 1 or QoS 2 must not be 0');
  }
  return packetId;
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
  const qosAndPacketId = qos === Mqtt.QoS.AtMostOnce ? { qos } : { qos, packetId: readPacketId(reader) };
  const properties = protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1 ? readProperties(reader) : undefined;

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

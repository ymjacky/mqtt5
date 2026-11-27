import * as Mqtt from '../mqtt/mod.ts';
import { ByteReader, concatBytes, numToTwoByteInteger, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { answerPacketIdValue, reasonCodeValue, subackReasonCodes, v3_1_1SubackReturnCodes } from './field_values.ts';
import type { SubackPacket } from './packet_types.ts';

export function toBytes(
  packet: SubackPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const variableHeaderChunks: (Uint8Array | number[])[] = [numToTwoByteInteger(answerPacketIdValue('SUBACK', packet.packetId))]; //packetId
  if (protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1) {
    // MQTT V5.0
    variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  // MQTT 5.0 SUBACK has Reason Codes, MQTT 3.1.1 SUBACK has Return Codes.
  const mqtt5 = protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1;
  const name = mqtt5 ? 'reasonCodes' : 'returnCodes';
  const codes = mqtt5 ? packet.reasonCodes : packet.returnCodes;
  if (codes === undefined) {
    throw new Error(`SUBACK has no ${name}`);
  }
  const allowed = mqtt5 ? subackReasonCodes : v3_1_1SubackReturnCodes;
  const payload = codes.map((code, i) => reasonCodeValue('SUBACK', `${name}[${i}]`, code, allowed));

  const fixedHeader = [
    (Mqtt.PacketType.Suback << 4) + Mqtt.FixedHeaderFlag.Suback,
    ...remainingLengthToBytes(variableHeader.length + payload.length),
  ];

  return concatBytes([fixedHeader, variableHeader, payload]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): SubackPacket {
  const reader = new ByteReader(buffer, remainingLength);
  const packetId = reader.readTwoByteInteger();

  if (protocolVersion === Mqtt.ProtocolVersion.MqttV3_1_1) {
    return {
      type: 'suback',
      packetId,
      returnCodes: Array.from(reader.readRest()),
    };
  }

  const properties = readProperties(reader);
  return {
    type: 'suback',
    packetId,
    reasonCodes: Array.from(reader.readRest()),
    ...(properties && { properties }),
  };
}

import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { ByteReader, concatBytes, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import { connackReasonCodes, reasonCodeValue, v3_1_1ConnackReturnCodes } from './field_values.ts';
import type { ConnackPacket } from './packet_types.ts';

export function toBytes(
  packet: ConnackPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const variableHeaderChunks: (Uint8Array | number[])[] = [[packet.sessionPresent ? 1 : 0]];
  if (protocolVersion > 4) {
    const reasonCode = reasonCodeValue('CONNACK', 'reasonCode', packet.reasonCode ?? 0x00, connackReasonCodes); // 0x00 success
    variableHeaderChunks.push([reasonCode]);
    variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
  } else {
    const returnCode = reasonCodeValue('CONNACK', 'returnCode', packet.returnCode ?? 0x00, v3_1_1ConnackReturnCodes); // 0x00 accepted
    variableHeaderChunks.push([returnCode]);
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  const fixedHeader = [
    (Mqtt.PacketType.Connack << 4) + Mqtt.FixedHeaderFlag.Connack,
    ...remainingLengthToBytes(variableHeader.length),
  ];

  return concatBytes([fixedHeader, variableHeader]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): ConnackPacket {
  const reader = new ByteReader(buffer, remainingLength);
  const sessionPresent = (reader.readByte() & 0b00000001) !== 0;
  const rc = reader.readByte();

  if (protocolVersion === Mqtt.ProtocolVersion.MqttV3_1_1) {
    reader.expectEnd('CONNACK');
    return {
      type: 'connack',
      sessionPresent,
      returnCode: rc as Mqtt.V3_1_1_ConnectReturnCode,
    };
  }

  // A broker that supports only MQTT 3.1.1 answers a CONNECT of MQTT 5.0 with a CONNACK of MQTT 3.1.1, which has no
  // Property Length (e.g. the return code 0x01, unacceptable protocol version). It is read without properties, so that
  // connect() gets the code.
  const properties = reader.remaining === 0 ? undefined : readProperties(reader);
  reader.expectEnd('CONNACK');
  return {
    type: 'connack',
    sessionPresent,
    reasonCode: rc as Mqtt.ReasonCode,
    ...(properties && { properties }),
  };
}

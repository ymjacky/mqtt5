import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { ByteReader, concatBytes, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import type { ConnackPacket } from './packet_types.ts';

export function toBytes(
  packet: ConnackPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  const variableHeaderChunks: (Uint8Array | number[])[] = [[packet.sessionPresent ? 1 : 0]];
  if (protocolVersion > 4) {
    const reasonCode = packet.reasonCode || 0x00; // 0x00 success
    variableHeaderChunks.push([reasonCode & 0xFF]);
    variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
  } else {
    const returnCode = packet.returnCode || 0x00; // 0x00 success
    variableHeaderChunks.push([returnCode & 0xFF]);
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  const fixedHeader = [
    (Mqtt.PacketType.CONNACK << 4) + Mqtt.fixedHeaderFlag.CONNACK,
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

  if (protocolVersion === Mqtt.ProtocolVersion.MQTT_V3_1_1) {
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

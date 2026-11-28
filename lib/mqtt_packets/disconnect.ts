import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { ByteReader, concatBytes, remainingLengthToBytes } from '../mqtt_utils/mod.ts';
import { disconnectReasonCodes, reasonCodeValue } from './field_values.ts';
import type { DisconnectPacket } from './packet_types.ts';

export function toBytes(
  packet: DisconnectPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  // Collect variable header chunks and concatenate them at the end instead of
  // spreading byte arrays into push()/Uint8Array.from(), which can overflow
  // the call stack once the byte array grows large (e.g. many properties).
  const variableHeaderChunks: (Uint8Array | number[])[] = [];

  if (protocolVersion > Mqtt.ProtocolVersion.MqttV3_1_1) {
    const reasonCode = reasonCodeValue('DISCONNECT', 'reasonCode', packet.reasonCode ?? 0x00, disconnectReasonCodes); // 0x00 success
    if (packet.properties) {
      variableHeaderChunks.push([reasonCode]);
      variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
    } else {
      if (reasonCode !== 0x00) {
        variableHeaderChunks.push([reasonCode]);
      }
    }
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  const fixedHeader = [
    (Mqtt.PacketType.Disconnect << 4) + Mqtt.FixedHeaderFlag.Disconnect,
    ...remainingLengthToBytes(variableHeader.length),
  ];

  return concatBytes([fixedHeader, variableHeader]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
): DisconnectPacket {
  const reader = new ByteReader(buffer, remainingLength);
  if (protocolVersion === Mqtt.ProtocolVersion.MqttV3_1_1) {
    // MQTT 3.1.1 DISCONNECT has no variable header.
    reader.expectEnd('DISCONNECT');
    return {
      type: 'disconnect',
    };
  }

  // MQTT 5.0 lets the sender omit the Reason Code and the Property Length when the Reason Code is 0x00 (Normal
  // disconnection) and there are no properties: with a Remaining Length of 0, the Reason Code is 0x00; with a Remaining
  // Length of 1, there are no properties (3.14.2.1, 3.14.2.2.1).
  if (reader.remaining === 0) {
    return {
      type: 'disconnect',
      reasonCode: Mqtt.ReasonCode.NormalDisconnection,
    };
  }

  const reasonCode = reader.readByte();
  const properties = reader.remaining === 0 ? undefined : readProperties(reader);
  reader.expectEnd('DISCONNECT');
  return {
    type: 'disconnect',
    reasonCode,
    ...(properties && { properties }),
  };
}

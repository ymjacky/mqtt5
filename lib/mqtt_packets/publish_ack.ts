import * as Mqtt from '../mqtt/mod.ts';
import type * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { ByteReader } from '../mqtt_utils/mod.ts';

/** The fields of PUBACK, PUBREC, PUBREL and PUBCOMP, which have the same variable header and no payload. */
export type PublishAckFields = {
  packetId: number;
  reasonCode?: number;
  properties?: MqttProperties.Properties;
};

/**
 * Reads the variable header of PUBACK, PUBREC, PUBREL or PUBCOMP.
 *
 * MQTT 5.0 lets the sender omit the Reason Code and the Property Length when the Reason Code is 0x00 (Success) and there are
 * no properties: with a Remaining Length of 2, the Reason Code is 0x00; with a Remaining Length of 3, there are no properties
 * (3.4.2.1 and 3.4.2.2.1, and the same for PUBREC, PUBREL and PUBCOMP). MQTT 3.1.1 has only the Packet Identifier.
 * @param name the packet type, used in the error message, e.g. `PUBACK`.
 * @throws {MqttUtilsError.MalformedDataError} if the bytes do not fit the variable header.
 */
export function parsePublishAck(
  buffer: Uint8Array,
  remainingLength: number,
  protocolVersion: Mqtt.ProtocolVersion,
  name: string,
): PublishAckFields {
  const reader = new ByteReader(buffer, remainingLength);
  const packetId = reader.readTwoByteInteger();
  if (protocolVersion === Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    reader.expectEnd(name);
    return { packetId };
  }
  if (reader.remaining === 0) {
    return { packetId, reasonCode: Mqtt.ReasonCode.Success };
  }

  const reasonCode = reader.readByte();
  const properties = reader.remaining === 0 ? undefined : readProperties(reader);
  reader.expectEnd(name);
  return { packetId, reasonCode, ...(properties && { properties }) };
}

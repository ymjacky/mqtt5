import { ByteReader, concatBytes, numToQoS, numToTwoByteInteger, remainingLengthToBytes, stringToUtfEncodedString } from '../mqtt_utils/mod.ts';
import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { readProperties } from '../mqtt_properties/read_properties.ts';
import { InvalidProtocolVersionError } from './error.ts';
import type { ConnectPacket } from './packet_types.ts';

export function toBytes(packet: ConnectPacket) {
  const protocolName = stringToUtfEncodedString('MQTT');
  const protocolVersion = packet.protocolVersion;

  const usernameFlag = typeof packet.username !== 'undefined';
  const passwordFlag = typeof packet.password !== 'undefined';
  const cleanSession = packet.clean || typeof packet.clean === 'undefined';

  const willFlag = packet.will ? true : false;
  const willRetain = (packet.will?.retain) ? true : false;
  const willQoS = (packet.will?.qos) || 0;

  const connectFlags = (usernameFlag ? 0b10000000 : 0) |
    (passwordFlag ? 0b01000000 : 0) |
    (willRetain ? 0b00100000 : 0) |
    (willQoS & 2 ? 0b00010000 : 0) |
    (willQoS & 1 ? 0b00001000 : 0) |
    (willFlag ? 0b00000100 : 0) |
    (cleanSession ? 0b00000010 : 0);

  const keepAlive = packet.keepAlive || 0; // 0 = Not send KeepAlive

  // Collect variable header / payload chunks and concatenate them at the end
  // instead of spreading byte arrays into push()/Uint8Array.from(), which can
  // overflow the call stack once a chunk (e.g. Will payload) grows large.
  const variableHeaderChunks: (Uint8Array | number[])[] = [
    protocolName,
    [protocolVersion, connectFlags, keepAlive >> 8, keepAlive & 0xFF],
  ];

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    variableHeaderChunks.push(MqttProperties.propertiesToBytes(packet.properties));
  }

  const variableHeader = concatBytes(variableHeaderChunks);

  const payloadChunks: (Uint8Array | number[])[] = [stringToUtfEncodedString(packet.clientId)];

  // Will
  if (packet.will) {
    // Will Properties
    if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
      payloadChunks.push(MqttProperties.propertiesToBytes(packet.will.properties));
    }
    // Will Topic
    payloadChunks.push(stringToUtfEncodedString(packet.will.topic)); // topic
    // Will Payload
    if (packet.will.payload) {
      payloadChunks.push(numToTwoByteInteger(packet.will.payload.length));
      payloadChunks.push(packet.will.payload);
    } else {
      payloadChunks.push([0x00, 0x00]);
    }
  }

  if (typeof packet.username !== 'undefined') {
    payloadChunks.push(stringToUtfEncodedString(packet.username));
  }

  if (typeof packet.password !== 'undefined') {
    payloadChunks.push(stringToUtfEncodedString(packet.password));
  }

  const payload = concatBytes(payloadChunks);

  const fixedHeader = [
    (Mqtt.PacketType.CONNECT << 4) + Mqtt.fixedHeaderFlag.CONNECT,
    ...remainingLengthToBytes(variableHeader.length + payload.length),
  ];

  return concatBytes([fixedHeader, variableHeader, payload]);
}

export function parse(
  buffer: Uint8Array,
  remainingLength: number,
): ConnectPacket {
  const reader = new ByteReader(buffer, remainingLength);

  const protocolName = reader.readUtf8EncodedString();
  const protocolVersion = reader.readByte();

  const connectFlags = reader.readByte();
  const usernameFlag = !!(connectFlags & 128);
  const passwordFlag = !!(connectFlags & 64);
  const willRetain = !!(connectFlags & 32);
  const willQoS = numToQoS((connectFlags & (16 + 8)) >> 3);
  const willFlag = !!(connectFlags & 4);
  const cleanSession = !!(connectFlags & 2);

  if (
    protocolVersion != Mqtt.ProtocolVersion.MQTT_V3_1_1 &&
    protocolVersion != Mqtt.ProtocolVersion.MQTT_V5
  ) {
    throw new InvalidProtocolVersionError(`${protocolVersion}`);
  }
  const pV = protocolVersion as Mqtt.ProtocolVersion;
  const mqtt5 = pV > Mqtt.ProtocolVersion.MQTT_V3_1_1;

  const keepAlive = reader.readTwoByteInteger();
  const properties = mqtt5 ? readProperties(reader) : undefined;

  // payload
  const clientId = reader.readUtf8EncodedString();

  // will
  let willProperties;
  let willTopic = '';
  let willPayload;
  if (willFlag) {
    willProperties = mqtt5 ? readProperties(reader) : undefined;
    willTopic = reader.readUtf8EncodedString();
    willPayload = reader.readBinaryData();
  }

  const username = usernameFlag ? reader.readUtf8EncodedString() : undefined;
  // The Password is Binary Data, not a UTF-8 Encoded String (MQTT 5.0 3.1.3.6, MQTT 3.1.1 3.1.3.5).
  const password = passwordFlag ? reader.readBinaryDataAsString() : undefined;
  reader.expectEnd('CONNECT');

  if (mqtt5) {
    return {
      type: 'connect',
      protocolName,
      protocolVersion: pV,
      clientId,
      username,
      password,
      will: willFlag
        ? {
          retain: willRetain,
          qos: willQoS,
          topic: willTopic,
          payload: willPayload,
          properties: willProperties,
        }
        : undefined,
      clean: cleanSession,
      keepAlive,
      properties,
    };
  } else {
    return {
      type: 'connect',
      protocolName,
      protocolVersion: pV,
      clientId,
      username,
      password,
      will: willFlag
        ? {
          retain: willRetain,
          qos: willQoS,
          topic: willTopic,
          payload: willPayload,
        }
        : undefined,
      clean: cleanSession,
      keepAlive,
    };
  }
}

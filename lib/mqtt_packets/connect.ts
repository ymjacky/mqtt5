import {
  numToQoS,
  numToTwoByteInteger,
  numToVariableByteInteger,
  stringToUtfEncodedString,
  twoByteIntegerToNum,
  utfEncodedStringToString,
  variableByteIntegerToNum,
} from '../mqtt_utils/mod.ts';
import * as Mqtt from '../mqtt/mod.ts';
import * as MqttProperties from '../mqtt_properties/mod.ts';
import { InvalidProtocolVersionError } from './error.ts';

export type ConnectPacket = {
  type: 'connect';
  clientId: string;
  protocolVersion: Mqtt.ProtocolVersion;
  protocolName?: string;
  username?: string;
  password?: string;
  clean?: boolean;
  keepAlive?: number;
  properties?: MqttProperties.ConnectProperties;
  will?: {
    retain?: boolean;
    qos?: Mqtt.QoS;
    topic: string;
    payload?: Uint8Array;
    properties?: MqttProperties.WillProperties;
  };
};

export function toBytes(packet: ConnectPacket) {
  const protocolName = stringToUtfEncodedString('MQTT');
  const protocolVersion = packet.protocolVersion;

  const usernameFlag = packet.username ? true : false;
  const passwordFlag = packet.password ? true : false;
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

  const variableHeader = [
    ...protocolName,
    protocolVersion,
    connectFlags,
    keepAlive >> 8,
    keepAlive & 0xFF,
  ];

  if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    variableHeader.push(...MqttProperties.propertiesToBytes(packet.properties));
  }

  const payload = [...stringToUtfEncodedString(packet.clientId)];

  // Will
  if (packet.will) {
    // Will Properties
    if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
      payload.push(...MqttProperties.propertiesToBytes(packet.will.properties));
    }
    // Will Topic
    payload.push(...stringToUtfEncodedString(packet.will.topic)); // topic
    // Will Payload
    if (packet.will.payload) {
      payload.push(...numToTwoByteInteger(packet.will.payload.length));
      payload.push(...packet.will.payload);
    } else {
      payload.push(0x00, 0x00);
    }
  }

  if (packet.username) {
    payload.push(...stringToUtfEncodedString(packet.username));
  }

  if (packet.password) {
    payload.push(...stringToUtfEncodedString(packet.password));
  }

  const fixedHeader = [
    (Mqtt.PacketType.CONNECT << 4) + Mqtt.fixexHeaderFlag.CONNECT,
    ...numToVariableByteInteger(variableHeader.length + payload.length),
  ];

  return Uint8Array.from([...fixedHeader, ...variableHeader, ...payload]);
}

export function parse(
  buffer: Uint8Array,
  _remainingLength: number,
): ConnectPacket {
  let pos = 0;

  const protocolName = utfEncodedStringToString(buffer, pos);
  pos += protocolName.length;

  const protocolVersion = buffer[pos++];

  const connectFlags = buffer[pos++];
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

  const keepAlive = twoByteIntegerToNum(buffer, pos);
  pos += 2; // keepAlive is 2 bytes

  const pV = protocolVersion as Mqtt.ProtocolVersion;

  const properties = (() => {
    if (pV > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
      const { number: length, size: consumedBytesSize } = variableByteIntegerToNum(buffer, pos);
      pos += consumedBytesSize;

      if (length > 0) {
        const prop = MqttProperties.parseMqttProperties(buffer, pos, length);
        pos += length;
        return prop;
      }
    }
    return undefined;
  })();

  // parse payload
  const clientId = utfEncodedStringToString(buffer, pos);
  pos += clientId.length;

  // will
  let willProperties;
  let willTopic = '';
  let willPayload;
  if (willFlag) {
    willProperties = (() => {
      if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        const { number: length, size: consumedBytesSize } = variableByteIntegerToNum(buffer, pos);
        pos += consumedBytesSize;
        if (length > 0) {
          const prop = MqttProperties.parseMqttProperties(buffer, pos, length);
          pos += length;
          return prop;
        }
      }
      return undefined;
    })();
    const willTopicInfo = utfEncodedStringToString(buffer, pos);
    willTopic = willTopicInfo.value;
    pos += willTopicInfo.length;

    const payloadLength = twoByteIntegerToNum(buffer, pos);
    pos += 2;
    willPayload = buffer.slice(pos, pos + payloadLength);
    pos += payloadLength;
  }

  let username;
  let password;

  // const usernameStart = clientIdStart + clientId.length;

  if (usernameFlag) {
    username = utfEncodedStringToString(buffer, pos);
    pos += username.length;
  }

  if (passwordFlag) {
    // const passwordStart = usernameStart + (username ? username.length : 0);
    password = utfEncodedStringToString(buffer, pos);
    pos += password.length;
  }

  if (pV > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
    return {
      type: 'connect',
      protocolName: protocolName.value,
      protocolVersion: pV,
      clientId: clientId.value,
      username: username ? username.value : undefined,
      password: password ? password.value : undefined,
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
      protocolName: protocolName.value,
      protocolVersion: pV,
      clientId: clientId.value,
      username: username ? username.value : undefined,
      password: password ? password.value : undefined,
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

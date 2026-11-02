/**
 * This module contains definitions and functions for MQTT packets and functions for MQTT packets
 * @module
 */

import * as MqttUtils from '../mqtt_utils/mod.ts';
import type {
  AuthPacket,
  ConnackPacket,
  ConnectPacket,
  DisconnectPacket,
  PingreqPacket,
  PingrespPacket,
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket,
  SubackPacket,
  SubscribePacket,
  UnsubackPacket,
  UnsubscribePacket,
} from './packet_types.ts';
import { parse as connectParse, toBytes as connectToBytes } from './connect.ts';
import { parse as connackParse, toBytes as connackToBytes } from './connack.ts';
import { parse as publishParse, toBytes as publishToBytes } from './publish.ts';
import { parse as pubackParse, toBytes as pubackToBytes } from './puback.ts';
import { parse as pubrecParse, toBytes as pubrecToBytes } from './pubrec.ts';
import { parse as pubrelParse, toBytes as pubrelToBytes } from './pubrel.ts';
import { parse as pubcompParse, toBytes as pubcompToBytes } from './pubcomp.ts';

import { parse as subscribeParse, toBytes as subscribeToBytes } from './subscribe.ts';
import { parse as subackParse, toBytes as subackToBytes } from './suback.ts';
import { parse as unsubscribeParse, toBytes as unsubscribeToBytes } from './unsubscribe.ts';
import { parse as unsubackParse, toBytes as unsubackToBytes } from './unsuback.ts';
import { parse as pingreqParse, toBytes as pingreqToBytes } from './pingreq.ts';
import { parse as pingrespParse, toBytes as pingrespToBytes } from './pingresp.ts';
import { parse as disconnectParse, toBytes as disconnectToBytes } from './disconnect.ts';
import { parse as authParse, toBytes as authToBytes } from './auth.ts';

import * as Mqtt from '../mqtt/mod.ts';
import * as MqttPacketsError from './error.ts';
/** Errors thrown when encoding or decoding packets. */
export * as MqttPacketsError from './error.ts';

// `export *` keeps the packet types visible in the docs of the MqttPackets namespace.
export * from './packet_types.ts';

/** Any MQTT packet. Narrow it by its `type`. */
export type AnyPacket =
  | ConnectPacket
  | ConnackPacket
  | PublishPacket
  | PubackPacket
  | PubrecPacket
  | PubrelPacket
  | PubcompPacket
  | SubscribePacket
  | SubackPacket
  | UnsubscribePacket
  | UnsubackPacket
  | PingreqPacket
  | PingrespPacket
  | DisconnectPacket
  | AuthPacket;

/**
 * Encodes a packet to bytes.
 * @param packet the packet to encode.
 * @param protocolVersion the protocol version to encode the packet for.
 * @returns the encoded bytes.
 * @throws {MqttPacketsError.MqttPacketSerializeError} if the packet cannot be encoded.
 */
export function packetToBytes(
  packet: AnyPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  try {
    let bytes: Uint8Array;
    switch (packet.type) {
      case 'connect':
        bytes = connectToBytes(packet);
        break;
      case 'connack':
        bytes = connackToBytes(packet, protocolVersion);
        break;
      case 'publish':
        bytes = publishToBytes(packet, protocolVersion);
        break;
      case 'puback':
        bytes = pubackToBytes(packet, protocolVersion);
        break;
      case 'pubrec':
        bytes = pubrecToBytes(packet, protocolVersion);
        break;
      case 'pubrel':
        bytes = pubrelToBytes(packet, protocolVersion);
        break;
      case 'pubcomp':
        bytes = pubcompToBytes(packet, protocolVersion);
        break;
      case 'subscribe':
        bytes = subscribeToBytes(packet, protocolVersion);
        break;
      case 'suback':
        bytes = subackToBytes(packet, protocolVersion);
        break;
      case 'unsubscribe':
        bytes = unsubscribeToBytes(packet, protocolVersion);
        break;
      case 'unsuback':
        bytes = unsubackToBytes(packet, protocolVersion);
        break;
      case 'pingreq':
        bytes = pingreqToBytes(packet);
        break;
      case 'pingresp':
        bytes = pingrespToBytes(packet);
        break;
      case 'disconnect':
        bytes = disconnectToBytes(packet, protocolVersion);
        break;
      case 'auth':
        bytes = authToBytes(packet, protocolVersion);
        break;
      default:
        throw new MqttPacketsError.UnsupportedPacketError('unknown');
    }

    return bytes;
  } catch (err) {
    throw new MqttPacketsError.MqttPacketSerializeError('mqtt packet serialize error.', { cause: err });
  }
}

/**
 * Decodes the bytes of a single complete packet.
 * @param buffer the bytes of the packet.
 * @param protocolVersion the protocol version to decode the packet for.
 * @returns the decoded packet.
 * @throws {MqttPacketsError.MqttPacketParseError} if the bytes cannot be decoded.
 */
export function decode(
  buffer: Uint8Array,
  protocolVersion: Mqtt.ProtocolVersion = Mqtt.ProtocolVersion.MQTT_V5,
): AnyPacket {
  let pos = 0;

  try {
    // parse packetType
    const packetType = buffer[pos] >> 4;
    const packetFlags = buffer[pos++] & 0b00001111;

    // parse remainingLength
    const remainingLengthBytes = [];
    let readLength = 0;
    do {
      const readValue = buffer[pos++];
      readLength++;

      remainingLengthBytes.push(readValue);

      if ((readValue >> 7) == 0) {
        break;
      } else if (readLength == 4) {
        throw new Error('malformed packet');
      }
    } while (readLength < 4);

    const remainingLength = MqttUtils.variableByteIntegerToNum(
      new Uint8Array([...remainingLengthBytes]),
      0,
    );

    let variableHeaderAndPayload = new Uint8Array(0);
    if (remainingLength.number > 0) {
      variableHeaderAndPayload = new Uint8Array(buffer.slice(pos));
    }

    const packet = parsePacket(
      packetType,
      packetFlags,
      remainingLength.number,
      variableHeaderAndPayload,
      protocolVersion,
    );
    return packet;
  } catch (err) {
    throw new MqttPacketsError.MqttPacketParseError('mqtt packet parse error.', { cause: err });
  }
}

function parsePacket(
  packetTypeId: number,
  packetFlags: number,
  remainingLength: number,
  variableHeaderAndPayload: Uint8Array,
  protocolVersion: Mqtt.ProtocolVersion,
): AnyPacket {
  let packet;

  switch (packetTypeId) {
    case Mqtt.PacketType.CONNECT:
      packet = connectParse(variableHeaderAndPayload, remainingLength);
      break;
    case Mqtt.PacketType.CONNACK:
      packet = connackParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.PUBLISH:
      packet = publishParse(
        packetFlags,
        variableHeaderAndPayload,
        remainingLength,
        protocolVersion,
      );
      break;
    case Mqtt.PacketType.PUBACK:
      packet = pubackParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.PUBREC:
      packet = pubrecParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.PUBREL:
      packet = pubrelParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.PUBCOMP:
      packet = pubcompParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.SUBSCRIBE:
      packet = subscribeParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.SUBACK:
      packet = subackParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.UNSUBSCRIBE:
      packet = unsubscribeParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.UNSUBACK:
      packet = unsubackParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.PINGREQ:
      packet = pingreqParse(remainingLength);
      break;
    case Mqtt.PacketType.PINGRESP:
      packet = pingrespParse(remainingLength);
      break;
    case Mqtt.PacketType.DISCONNECT:
      packet = disconnectParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.AUTH:
      packet = authParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    default:
      throw new MqttPacketsError.UnsupportedPacketError('unknown');
  }

  return packet as AnyPacket;
}

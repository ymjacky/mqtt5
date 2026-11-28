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
import { protocolVersionValue } from './field_values.ts';
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
 * @throws {MqttPacketsError.MqttPacketSerializeError} if the packet cannot be encoded, e.g. a UTF-8 Encoded String (a topic,
 * the Client Identifier, a string property, ...) contains U+0000 or a lone surrogate or is longer than 65,535 bytes in UTF-8,
 * a string Password has a lone surrogate, an integer property has a value that it cannot have (e.g. a Receive Maximum of 0 or
 * a Maximum QoS of 2: see `MqttProperties.propertiesToBytes()`), another field has a value that it cannot have (see
 * `MqttPacketsError.InvalidFieldValueError`: e.g. a packet ID of 0 in PUBLISH, a QoS of 3, or a Reason Code that the packet type cannot
 * carry, such as 0x87 in AUTH), a value does not fit its field, the packet is an AUTH with MQTT 3.1.1, which has no AUTH, or
 * an AUTH without an Authentication Method (`MqttPacketsError.MissingPropertyError`), or
 * `protocolVersion` or the `protocolVersion` of a CONNECT is not 4 (MQTT 3.1.1) or 5 (MQTT 5.0)
 * (`MqttPacketsError.InvalidProtocolVersionError`). Its `cause` tells why.
 */
export function packetToBytes(
  packet: AnyPacket,
  protocolVersion: Mqtt.ProtocolVersion,
): Uint8Array {
  try {
    protocolVersionValue('protocolVersion', protocolVersion);
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
 * @param buffer the bytes of the packet: the fixed header, and exactly as many bytes after it as its Remaining Length says.
 * @param protocolVersion the protocol version to decode the packet for.
 * @returns the decoded packet.
 * @throws {MqttPacketsError.MqttPacketParseError} if the bytes cannot be decoded: they are not exactly one packet, or the
 * packet is a Malformed Packet or a Protocol Error, e.g. a field goes past the end of the packet, a property is included
 * more than once (MQTT 5.0 4.13), a PUBLISH with QoS 1 or QoS 2 has a packet ID of 0 or an AUTH has no Authentication
 * Method, or its packet type is Reserved: 0, or
 * 15 (AUTH) with MQTT 3.1.1. It is also thrown, with `MqttPacketsError.InvalidProtocolVersionError` as its cause, when
 * `protocolVersion` or the Protocol Level of a CONNECT is not 4 (MQTT 3.1.1) or 5 (MQTT 5.0). `cause` is the error that was
 * found.
 */
export function decode(
  buffer: Uint8Array,
  protocolVersion: Mqtt.ProtocolVersion = Mqtt.ProtocolVersion.MqttV5,
): AnyPacket {
  try {
    protocolVersionValue('protocolVersion', protocolVersion);
    // fixed header
    const header = new MqttUtils.ByteReader(buffer);
    const firstByte = header.readByte();
    const packetType = firstByte >> 4;
    const packetFlags = firstByte & 0b00001111;
    const remainingLength = header.readVariableByteInteger();
    if (header.remaining > remainingLength) {
      throw new MqttUtils.MqttUtilsError.MalformedDataError(
        `${header.remaining - remainingLength} bytes are left after the Remaining Length of ${remainingLength} bytes`,
      );
    }
    // The parser of the packet throws if fewer than `remainingLength` bytes are left.
    const variableHeaderAndPayload = buffer.subarray(buffer.length - header.remaining);

    return parsePacket(
      packetType,
      packetFlags,
      remainingLength,
      variableHeaderAndPayload,
      protocolVersion,
    );
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
    case Mqtt.PacketType.Connect:
      packet = connectParse(variableHeaderAndPayload, remainingLength);
      break;
    case Mqtt.PacketType.Connack:
      packet = connackParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.Publish:
      packet = publishParse(
        packetFlags,
        variableHeaderAndPayload,
        remainingLength,
        protocolVersion,
      );
      break;
    case Mqtt.PacketType.Puback:
      packet = pubackParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.Pubrec:
      packet = pubrecParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.Pubrel:
      packet = pubrelParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.Pubcomp:
      packet = pubcompParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.Subscribe:
      packet = subscribeParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.Suback:
      packet = subackParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.Unsubscribe:
      packet = unsubscribeParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.Unsuback:
      packet = unsubackParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.Pingreq:
      packet = pingreqParse(remainingLength);
      break;
    case Mqtt.PacketType.Pingresp:
      packet = pingrespParse(remainingLength);
      break;
    case Mqtt.PacketType.Disconnect:
      packet = disconnectParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    case Mqtt.PacketType.Auth:
      packet = authParse(variableHeaderAndPayload, remainingLength, protocolVersion);
      break;
    default:
      throw new MqttPacketsError.UnsupportedPacketError('unknown');
  }

  return packet as AnyPacket;
}

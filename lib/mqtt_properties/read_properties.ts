/**
 * Reading of received properties, for the packet parsers and for `parseMqttProperties()` of `mod.ts`. This module is not
 * exported by `mod.ts`: its functions take a ByteReader, which is internal.
 * @module
 */

import * as Mqtt from '../mqtt/mod.ts';
import { ByteReader } from '../mqtt_utils/mod.ts';
import { ProtocolViolationError } from '../mqtt_utils/error.ts';
import { UnsupportedPropertyError } from './error.ts';
import type { Properties } from './mod.ts';

/**
 * The properties that may be included more than once. MQTT 5.0 says, for each other property of each packet, that it is a
 * Protocol Error to include it more than once, except for the Payload Format Indicator and the Message Expiry Interval of
 * PUBLISH (3.3.2.3.2, 3.3.2.3.3). The Will Properties of CONNECT have the rule for these two (3.1.3.2.3, 3.1.3.2.4), but the
 * properties are read without knowing their packet, and a client does not receive CONNECT.
 */
const repeatableProperties: ReadonlySet<number> = new Set([
  0x01, // Payload Format Indicator (PUBLISH)
  0x02, // Message Expiry Interval (PUBLISH)
  0x0B, // Subscription Identifier: PUBLISH has one per matching subscription. SUBSCRIBE has at most one: see subscribe.ts.
  0x26, // User Property
]);

/** Reads a Byte that must be 0 or 1, e.g. Retain Available. Another value is a Protocol Error. */
function readBoolean(reader: ByteReader, name: string): boolean {
  const value = reader.readByte();
  if (value !== 0 && value !== 1) {
    throw new ProtocolViolationError(`${name} must be 0 or 1 (got ${value})`);
  }
  return value === 1;
}

/** Reads a number that must not be 0, e.g. Receive Maximum. 0 is a Protocol Error. */
function nonZero(value: number, name: string): number {
  if (value === 0) {
    throw new ProtocolViolationError(`${name} must not be 0`);
  }
  return value;
}

/**
 * Reads the properties of a packet: the Property Length and the properties after it.
 * @param reader the reader of the packet, at the Property Length. It skips the properties.
 * @returns the properties, or `undefined` if the Property Length is 0.
 * @throws {MalformedDataError} if a property goes past the Property Length, or past the end of the packet.
 * @throws {ProtocolViolationError} if the properties are a Protocol Error (see `parseMqttProperties()` of `mod.ts`).
 * @throws {UnsupportedPropertyError} if a property identifier is not supported.
 */
export function readProperties(reader: ByteReader): Properties | undefined {
  const length = reader.readVariableByteInteger();
  if (length === 0) {
    return undefined;
  }
  return readPropertyList(reader.readSub(length));
}

/**
 * Reads properties until the end of `reader`: used by {@link readProperties} and by `parseMqttProperties()` of `mod.ts`.
 * @throws see `parseMqttProperties()` of `mod.ts`.
 */
export function readPropertyList(reader: ByteReader): Properties {
  const properties: Properties = {};
  const seen = new Set<number>();

  while (reader.remaining > 0) {
    const propertyId = reader.readVariableByteInteger();
    if (seen.has(propertyId) && !repeatableProperties.has(propertyId)) {
      throw new ProtocolViolationError(`the property 0x${propertyId.toString(16).padStart(2, '0')} is included more than once`);
    }
    seen.add(propertyId);

    switch (propertyId) {
      case 0x01: // (1) Payload Format Indicator, type: Byte
        properties.payloadFormatIndicator = reader.readByte();
        break;
      case 0x02: // (2) Message Expiry Interval , type: Four Byte Integer
        properties.messageExpiryInterval = reader.readFourByteInteger();
        break;
      case 0x03: // (3) ContentType, type: UTF-8 Encoded String
        properties.contentType = reader.readUtf8EncodedString();
        break;
      case 0x08: // (8) Response Topic, UTF-8 Encoded String
        properties.responseTopic = reader.readUtf8EncodedString();
        break;
      case 0x09: // (9) Correlation Data, type: Binary Data
        properties.correlationData = reader.readBinaryData();
        break;
      case 0x0B: // (11) Subscription Identifier, type: Variable Byte Integer
        {
          const subscriptionIdentifier = nonZero(reader.readVariableByteInteger(), 'the Subscription Identifier');
          // PUBLISH carries one Subscription Identifier per matching subscription, so keep them all.
          // SUBSCRIBE carries at most one; subscribe.ts converts the list to its single value.
          if (properties.subscriptionIdentifiers) {
            properties.subscriptionIdentifiers.push(subscriptionIdentifier);
          } else {
            properties.subscriptionIdentifiers = [subscriptionIdentifier];
          }
        }
        break;
      case 0x11: // (17) Session Expiry Interval, type: Four Byte Integer
        properties.sessionExpiryInterval = reader.readFourByteInteger();
        break;
      case 0x12: // (18) Assigned Client Identifier, type: UTF-8 Encoded String
        properties.assignedClientIdentifier = reader.readUtf8EncodedString();
        break;
      case 0x13: // (19) Server Keep Alive, type: Two Byte Integer
        properties.serverKeepAlive = reader.readTwoByteInteger();
        break;
      case 0x15: // (21) Authentication Method, type: UTF-8 Encoded String
        properties.authenticationMethod = reader.readUtf8EncodedString();
        break;
      case 0x16: // (22) Authentication Data, type: Binary Data
        properties.authenticationData = reader.readBinaryData();
        break;
      case 0x17: // (23) Request Problem Information, type: Byte
        properties.requestProblemInformation = readBoolean(reader, 'Request Problem Information');
        break;
      case 0x18: // (24) Will Delay Interval, type: Four Byte Integer
        properties.willDelayInterval = reader.readFourByteInteger();
        break;
      case 0x19: // (25) Request Response Information, type: Byte
        properties.requestResponseInformation = readBoolean(reader, 'Request Response Information');
        break;
      case 0x1A: // (26) Response Information, type: UTF-8 Encoded String
        properties.responseInformation = reader.readUtf8EncodedString();
        break;
      case 0x1C: // (28) Server Reference, type: UTF-8 Encoded String
        properties.serverReference = reader.readUtf8EncodedString();
        break;
      case 0x1F: // (31) ReasonString, type: UTF-8 Encoded String
        properties.reasonString = reader.readUtf8EncodedString();
        break;
      case 0x21: // (33) ReceiveMaximum, type: Two Byte Integer
        properties.receiveMaximum = nonZero(reader.readTwoByteInteger(), 'the Receive Maximum');
        break;
      case 0x22: // (34) TopicAliasMaximum,  type: Two Byte Integer
        properties.topicAliasMaximum = reader.readTwoByteInteger();
        break;
      case 0x23: // (35) TopicAlias , type: Two Byte Integer
        properties.topicAlias = reader.readTwoByteInteger();
        break;
      case 0x24: // (36) Maximum QoS , type: Byte, 0 or 1 (MQTT 5.0 3.2.2.3.4)
        properties.maximumQoS = readBoolean(reader, 'Maximum QoS') ? Mqtt.QoS.AT_LEAST_ONCE : Mqtt.QoS.AT_MOST_ONCE;
        break;
      case 0x25: // (37) Retain Available , type: Byte
        properties.retainAvailable = readBoolean(reader, 'Retain Available');
        break;
      case 0x26: // (38) UserPropertis , type: UserProperties
        {
          const key = reader.readUtf8EncodedString();
          const val = reader.readUtf8EncodedString();
          if (properties.userProperties) {
            properties.userProperties.push({ key, val });
          } else {
            properties.userProperties = [{ key, val }];
          }
        }
        break;
      case 0x27: // (39) Maximum Packet Size , type: Four Byte Integer
        properties.maximumPacketSize = nonZero(reader.readFourByteInteger(), 'the Maximum Packet Size');
        break;
      case 0x28: // (40) Wildcard Subscription Available , type: Byte
        properties.wildcardSubscriptionAvailable = readBoolean(reader, 'Wildcard Subscription Available');
        break;
      case 0x29: // (41) Subscription Identifiers Available , type: Byte
        properties.subscriptionIdentifiersAvailable = readBoolean(reader, 'Subscription Identifiers Available');
        break;
      case 0x2A: // (42) Shared Subscription Available , type: Byte
        properties.sharedSubscriptionAvailable = readBoolean(reader, 'Shared Subscription Available');
        break;
      default:
        throw new UnsupportedPropertyError(propertyId);
    }
  }

  return properties;
}

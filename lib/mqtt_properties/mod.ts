/**
 * This module contains definitions and functions for the properties of the MQTT protocol version 5.0
 * @module
 */

import * as Mqtt from '../mqtt/mod.ts';

import {
  concatBytes,
  fourByteIntegerToNum,
  numToFourByteInteger,
  numToQoS,
  numToTwoByteInteger,
  numToVariableByteInteger,
  stringToUtfEncodedString,
  twoByteIntegerToNum,
  utfEncodedStringToString,
  variableByteIntegerToNum,
} from '../mqtt_utils/mod.ts';

/** The property identifier is not supported. */
export class UnsuportedPropertyError extends Error {
  /** Creates the error for the given property identifier. */
  constructor(propertyId: number) {
    super(`unsuported property. propertyId: ${propertyId}`);
  }
}

/** A key-value pair of a user property. */
export type StringPair = { key: string; val: string };
/** User properties (id: 0x26). The same key can appear more than once. */
export type UserProperties = StringPair[];

/** Properties of CONNECT. */
export type ConnectProperties = {
  /**
   * Seconds to keep the session after the connection is closed. (id: 0x11)
   *
   * 0 or omitted: the session ends when the connection closes. 0xFFFFFFFF: the session never expires.
   */
  sessionExpiryInterval?: number;
  /** Name of the authentication method for enhanced authentication. (id: 0x15) */
  authenticationMethod?: string;
  /** Authentication data. Its contents are defined by the authentication method. (id: 0x16) */
  authenticationData?: Uint8Array;
  /** Whether the broker may send a reason string or user properties when a failure occurs. (id: 0x17) */
  requestProblemInformation?: boolean;
  /** Whether the broker should return response information in CONNACK. (id: 0x19) */
  requestResponseInformation?: boolean;
  /** Maximum number of QoS 1 and 2 PUBLISH packets the client is willing to process at once. (id: 0x21) */
  receiveMaximum?: number;
  /** Highest topic alias value the client accepts. 0 or omitted: topic aliases are not accepted. (id: 0x22) */
  topicAliasMaximum?: number;
  /** Application-defined key-value pairs. (id: 0x26) */
  userProperties?: UserProperties;
  /** Maximum packet size in bytes the client accepts. (id: 0x27) */
  maximumPacketSize?: number;
};

/** Properties of CONNACK. */
export type ConnackProperties = {
  /** Session expiry interval in seconds set by the broker, used instead of the one the client sent. (id: 0x11) */
  sessionExpiryInterval?: number;
  /** Client identifier assigned by the broker when the client connected with an empty client identifier. (id: 0x12) */
  assignedClientIdentifier?: string;
  /** Keep alive in seconds the client must use instead of the one it sent. (id: 0x13) */
  serverKeepAlive?: number;
  /** Name of the authentication method for enhanced authentication. (id: 0x15) */
  authenticationMethod?: string;
  /** Authentication data. Its contents are defined by the authentication method. (id: 0x16) */
  authenticationData?: Uint8Array;
  /** Basis for creating a response topic. (id: 0x1A) */
  responseInformation?: string;
  /** Another server the client can use. (id: 0x1C) */
  serverReference?: string;
  /** Human readable reason for diagnostics. (id: 0x1F) */
  reasonString?: string;
  /** Maximum number of QoS 1 and 2 PUBLISH packets the broker is willing to process at once. (id: 0x21) */
  receiveMaximum?: number;
  /** Highest topic alias value the broker accepts. 0 or omitted: topic aliases are not accepted. (id: 0x22) */
  topicAliasMaximum?: number;
  /** Maximum QoS the broker supports. All QoS levels are supported if omitted. (id: 0x24) */
  maximumQoS?: Mqtt.QoS;
  /** Whether the broker supports retained messages. Supported if omitted. (id: 0x25) */
  retainAvailable?: boolean;
  /** Application-defined key-value pairs. (id: 0x26) */
  userProperties?: UserProperties;
  /** Maximum packet size in bytes the broker accepts. (id: 0x27) */
  maximumPacketSize?: number;
  /** Whether the broker supports wildcard subscriptions. Supported if omitted. (id: 0x28) */
  wildcardSubscriptionAvailable?: boolean;
  /** Whether the broker supports subscription identifiers. Supported if omitted. (id: 0x29) */
  subscriptionIdentifiersAvailable?: boolean;
  /** Whether the broker supports shared subscriptions. Supported if omitted. (id: 0x2A) */
  sharedSubscriptionAvailable?: boolean;
};

/** Properties of PUBLISH. */
export type PublishProperties = {
  /** 0: unspecified bytes, 1: UTF-8 encoded character data. (id: 0x01) */
  payloadFormatIndicator?: number;
  /** Lifetime of the message in seconds. The message never expires if omitted. (id: 0x02) */
  messageExpiryInterval?: number;
  /** Content type of the payload, e.g. a MIME type. (id: 0x03) */
  contentType?: string;
  /** Topic name for a response message (request / response). (id: 0x08) */
  responseTopic?: string;
  /** Data that relates a response message to its request. (id: 0x09) */
  correlationData?: Uint8Array;
  /** Identifier of the subscription that matched, set by the broker. (id: 0x0B) */
  subscriptionIdentifier?: number;
  /** A number used in place of the topic name to reduce the packet size. (id: 0x23) */
  topicAlias?: number;
  /** Application-defined key-value pairs. (id: 0x26) */
  userProperties?: UserProperties;
};

/** Properties of PUBLISH that users can set with `publish()`. Topic aliases are managed by the client. */
export type UserPublishProperties = {
  /** 0: unspecified bytes, 1: UTF-8 encoded character data. (id: 0x01) */
  payloadFormatIndicator?: number;
  /** Lifetime of the message in seconds. The message never expires if omitted. (id: 0x02) */
  messageExpiryInterval?: number;
  /** Content type of the payload, e.g. a MIME type. (id: 0x03) */
  contentType?: string;
  /** Topic name for a response message (request / response). (id: 0x08) */
  responseTopic?: string;
  /** Data that relates a response message to its request. (id: 0x09) */
  correlationData?: Uint8Array;
  /** Identifier of the subscription, from 1 to 268,435,455. (id: 0x0B) */
  subscriptionIdentifier?: number;
  // // id: 0x23
  // topicAlias?: number;
  /** Application-defined key-value pairs. (id: 0x26) */
  userProperties?: UserProperties;
};

/** Properties of SUBSCRIBE. */
export type SubscribeProperties = {
  /** Identifier of the subscription, from 1 to 268,435,455. (id: 0x0B) */
  subscriptionIdentifier?: number;
  /** Application-defined key-value pairs. (id: 0x26) */
  userProperties?: UserProperties;
};

/** Properties of UNSUBSCRIBE. */
export type UnsubscribeProperties = {
  /** Application-defined key-value pairs. (id: 0x26) */
  userProperties?: UserProperties;
};

/** Properties of DISCONNECT. */
export type DisconnectProperties = {
  /** New session expiry interval in seconds. Cannot be set when it was 0 in CONNECT. (id: 0x11) */
  sessionExpiryInterval?: number;
  /** Another server the client can use. (id: 0x1C) */
  serverReference?: string;
  /** Human readable reason for diagnostics. (id: 0x1F) */
  reasonString?: string;
  /** Application-defined key-value pairs. (id: 0x26) */
  userProperties?: UserProperties;
};

/** Properties of AUTH. */
export type AuthProperties = {
  /** Name of the authentication method for enhanced authentication. (id: 0x15) */
  authenticationMethod?: string;
  /** Authentication data. Its contents are defined by the authentication method. (id: 0x16) */
  authenticationData?: Uint8Array;
  /** Human readable reason for diagnostics. (id: 0x1F) */
  reasonString?: string;
  /** Application-defined key-value pairs. (id: 0x26) */
  userProperties?: UserProperties;
};
/** Properties of the will message in CONNECT. */
export type WillProperties = {
  /** 0: unspecified bytes, 1: UTF-8 encoded character data. (id: 0x01) */
  payloadFormatIndicator?: number;
  /** Lifetime of the will message in seconds. The message never expires if omitted. (id: 0x02) */
  messageExpiryInterval?: number;
  /** Content type of the payload, e.g. a MIME type. (id: 0x03) */
  contentType?: string;
  /** Topic name for a response message (request / response). (id: 0x08) */
  responseTopic?: string;
  /** Data that relates a response message to its request. (id: 0x09) */
  correlationData?: Uint8Array;
  /** Seconds to wait before publishing the will message after the connection is lost. (id: 0x18) */
  willDelayInterval?: number;
  /** Application-defined key-value pairs. (id: 0x26) */
  userProperties?: UserProperties;
};

type AcknolagePacketProperties = {
  /** Human readable reason for diagnostics. (id: 0x1F) */
  reasonString?: string;
  /** Application-defined key-value pairs. (id: 0x26) */
  userProperties?: UserProperties;
};

/** Properties of PUBACK. */
export type PubackProperties = AcknolagePacketProperties;
/** Properties of PUBREC. */
export type PubrecProperties = AcknolagePacketProperties;
/** Properties of PUBREL. */
export type PubrelProperties = AcknolagePacketProperties;
/** Properties of PUBCOMP. */
export type PubcompProperties = AcknolagePacketProperties;
/** Properties of SUBACK. */
export type SubackProperties = AcknolagePacketProperties;
/** Properties of UNSUBACK. */
export type UnsubackProperties = AcknolagePacketProperties;

/** All MQTT 5.0 properties: the properties of every packet combined into one type. */
export type Properties =
  & ConnectProperties
  & ConnackProperties
  & PublishProperties
  & SubscribeProperties
  & UnsubscribeProperties
  & DisconnectProperties
  & AuthProperties
  & WillProperties
  & PubackProperties
  & PubrecProperties
  & PubrelProperties
  & PubcompProperties
  & SubackProperties
  & SubackProperties
  & AuthProperties;

/**
 * Encodes properties to bytes, prefixed with the property length.
 * @param properties the properties to encode. Encoded as an empty property list if omitted.
 * @returns the encoded bytes.
 */
export function propertiesToBytes(properties?: Properties): Uint8Array {
  if (typeof properties === 'undefined') {
    return new Uint8Array([0x00]);
  }

  // Collect property chunks and concatenate them at the end instead of
  // spreading byte arrays into push(), which can overflow the call stack
  // once a chunk (e.g. correlationData, authenticationData) grows large.
  const chunks: (Uint8Array | number[])[] = [];
  // id: 0x01 , type: Byte
  if (properties.payloadFormatIndicator) {
    chunks.push([0x01, properties.payloadFormatIndicator & 0xFF]);
  }
  // id: 0x02 , type: Four Byte Integer
  if (properties.messageExpiryInterval) { // number ,
    chunks.push([0x02], numToFourByteInteger(properties.messageExpiryInterval));
  }
  // id: 0x03
  if (properties.contentType) { // string,
    chunks.push([0x03], stringToUtfEncodedString(properties.contentType));
  }
  // id: 0x08
  if (properties.responseTopic) { // string ,
    chunks.push([0x08], stringToUtfEncodedString(properties.responseTopic));
  }
  // id: 0x09
  if (properties.correlationData) { // Uint8Array,
    const correlationDataLength = properties.correlationData.length;
    chunks.push([0x09], numToTwoByteInteger(correlationDataLength), properties.correlationData);
  }
  // id: 0x0B, type: Variable Byte Integer
  if (properties.subscriptionIdentifier) { // number,
    chunks.push([0x0B], numToVariableByteInteger(properties.subscriptionIdentifier));
  }
  // id: 0x11, type: Four Byte Integer
  if (properties.sessionExpiryInterval) { // number ,
    chunks.push([0x11], numToFourByteInteger(properties.sessionExpiryInterval));
  }
  // id: 0x12
  if (properties.assignedClientIdentifier) { // string,
    chunks.push([0x12], stringToUtfEncodedString(properties.assignedClientIdentifier));
  }
  // id: 0x13, type: Two Byte Integer
  if (properties.serverKeepAlive) { // number ,
    chunks.push([0x13], numToTwoByteInteger(properties.serverKeepAlive));
  }
  // id: 0x15
  if (properties.authenticationMethod) { // string ,
    chunks.push([0x15], stringToUtfEncodedString(properties.authenticationMethod));
  }
  // id: 0x16
  if (properties.authenticationData) { // Uint8Array,
    const authenticationDataLength = properties.authenticationData.length;
    chunks.push([0x16], numToTwoByteInteger(authenticationDataLength), properties.authenticationData);
  }
  // id: 0x17
  if (typeof properties.requestProblemInformation !== 'undefined') { // boolean ,
    chunks.push([0x17, properties.requestProblemInformation ? 1 : 0]);
  }
  // id: 0x18
  if (properties.willDelayInterval) { // number ,
    chunks.push([0x18], numToFourByteInteger(properties.willDelayInterval));
  }
  // id: 0x19
  if (typeof properties.requestResponseInformation !== 'undefined') { // boolean,
    chunks.push([0x19, properties.requestResponseInformation ? 1 : 0]);
  }
  // id: 0x1A
  if (properties.responseInformation) { // string,
    chunks.push([0x1A], stringToUtfEncodedString(properties.responseInformation));
  }
  // id: 0x1C
  if (properties.serverReference) { // string,
    chunks.push([0x1C], stringToUtfEncodedString(properties.serverReference));
  }
  // id: 0x1F
  if (properties.reasonString) { // string,
    chunks.push([0x1F], stringToUtfEncodedString(properties.reasonString));
  }
  // id: 0x21 type: Two Byte Integer
  if (properties.receiveMaximum) { // number,
    chunks.push([0x21], numToTwoByteInteger(properties.receiveMaximum));
  }
  // id: 0x22 type: Two Byte Integer
  if (properties.topicAliasMaximum) { // number,
    chunks.push([0x22], numToTwoByteInteger(properties.topicAliasMaximum));
  }
  // id: 0x23, type: Two Byte Integer
  if (properties.topicAlias) { // number,
    chunks.push([0x23], numToTwoByteInteger(properties.topicAlias));
  }
  // id: 0x24, type: Byte
  if (properties.maximumQoS) { // Mqtt.QoS,
    chunks.push([0x24, properties.maximumQoS & 0xFF]);
  }
  // id: 0x25, type: Byte
  if (typeof properties.retainAvailable !== 'undefined') { // boolean,
    chunks.push([0x25, properties.retainAvailable ? 1 : 0]);
  }
  // id: 0x26, type: UTF-8 String Pair
  if (properties.userProperties) { // string,
    if (properties.userProperties.length !== 0) {
      properties.userProperties.forEach((entry) => {
        chunks.push([0x26]);
        chunks.push(stringToUtfEncodedString(entry.key));
        chunks.push(stringToUtfEncodedString(entry.val));
      });
    }
  }
  // id: 0x27, type: Four Byte Integer
  if (properties.maximumPacketSize) { // number,
    chunks.push([0x27], numToFourByteInteger(properties.maximumPacketSize));
  }
  // id: 0x28, type: Byte
  if (typeof properties.wildcardSubscriptionAvailable !== 'undefined') { // boolean,
    chunks.push([0x28, properties.wildcardSubscriptionAvailable ? 1 : 0]);
  }
  // id: 0x29, type: Byte
  if (typeof properties.subscriptionIdentifiersAvailable !== 'undefined') { // boolean,
    chunks.push([0x29, properties.subscriptionIdentifiersAvailable ? 1 : 0]);
  }
  // id: 0x2A, type: Byte
  if (typeof properties.sharedSubscriptionAvailable !== 'undefined') { // boolean ,
    chunks.push([0x2A, properties.sharedSubscriptionAvailable ? 1 : 0]);
  }

  const bytes = concatBytes(chunks);
  return concatBytes([numToVariableByteInteger(bytes.length), bytes]);
}

/**
 * Decodes properties from a buffer.
 * @param buffer the buffer that contains the properties.
 * @param offset the position of the first property in the buffer.
 * @param propertyLength the length of the properties in bytes.
 * @returns the decoded properties.
 * @throws {UnsuportedPropertyError} if a property identifier is not supported.
 */
export function parseMqttProperties(
  buffer: Uint8Array,
  offset: number,
  propertyLength: number,
): Properties {
  const properties: Properties = {};
  let pos = offset;

  while ((pos - offset) < propertyLength) {
    const { number: propertyId, size: propertyIdLength } = variableByteIntegerToNum(buffer, pos);
    pos += propertyIdLength;

    switch (propertyId) {
      case 0x01: // (1) Payload Format Indicator, type: Byte
        properties.payloadFormatIndicator = buffer[pos] & 0xFF;
        pos++;
        break;
      case 0x02: // (2) Message Expiry Interval , type: Four Byte Integer
        properties.messageExpiryInterval = fourByteIntegerToNum(buffer, pos);
        pos += 4;
        break;
      case 0x03: // (3) ContentType, type: UTF-8 Encoded String
        {
          const contentTypeInfo = utfEncodedStringToString(buffer, pos);
          properties.contentType = contentTypeInfo.value;
          pos += contentTypeInfo.length;
        }
        break;
      case 0x08: // (8) Response Topic, UTF-8 Encoded String
        {
          const responseTopicInfo = utfEncodedStringToString(buffer, pos);
          properties.responseTopic = responseTopicInfo.value;
          pos += responseTopicInfo.length;
        }
        break;
      case 0x09: // (9) Correlation Data, type: Binary Data
        {
          const correlationDataLength = twoByteIntegerToNum(buffer, pos);
          pos += 2;
          properties.correlationData = buffer.slice(pos, pos + correlationDataLength);
          pos += correlationDataLength;
        }
        break;
      case 0x0B: // (11) Subscription Identifier, type: Variable Byte Integer
        {
          const subscriptionIdentifierInfo = variableByteIntegerToNum(buffer, pos);
          properties.subscriptionIdentifier = subscriptionIdentifierInfo.number;
          pos += subscriptionIdentifierInfo.size;
        }
        break;
      case 0x11: // (17) Session Expiry Interval, type: Four Byte Integer
        properties.sessionExpiryInterval = fourByteIntegerToNum(buffer, pos);
        pos += 4;
        break;
      case 0x12: // (18) Assigned Client Identifier, type: UTF-8 Encoded String
        {
          const assignedClientIdentifierInfo = utfEncodedStringToString(buffer, pos);
          properties.assignedClientIdentifier = assignedClientIdentifierInfo.value;
          pos += assignedClientIdentifierInfo.length;
        }
        break;
      case 0x13: // (19) Server Keep Alive, type: Two Byte Integer
        properties.serverKeepAlive = twoByteIntegerToNum(buffer, pos);
        pos += 2;
        break;
      case 0x15: // (21) Authentication Method, type: UTF-8 Encoded String
        {
          const authenticationMethodInfo = utfEncodedStringToString(buffer, pos);
          properties.authenticationMethod = authenticationMethodInfo.value;
          pos += authenticationMethodInfo.length;
        }
        break;
      case 0x16: // (22) Authentication Data, type: Binary Data
        {
          const authenticationDataLength = twoByteIntegerToNum(buffer, pos);
          pos += 2;
          properties.authenticationData = buffer.slice(pos, pos + authenticationDataLength);
          pos += authenticationDataLength;
        }
        break;
      case 0x17: // (23) Request Problem Information, type: Byte
        properties.requestProblemInformation = buffer[pos++] === 1 ? true : false;
        break;
      case 0x18: // (24) Will Delay Interval, type: Four Byte Integer
        properties.willDelayInterval = fourByteIntegerToNum(buffer, pos);
        pos += 4;
        break;
      case 0x19: // (25) Request Response Information, type: Byte
        properties.requestResponseInformation = buffer[pos++] === 1 ? true : false;
        break;
      case 0x1A: // (26) Response Information, type: UTF-8 Encoded String
        {
          const responseInformationTypeInfo = utfEncodedStringToString(buffer, pos);
          properties.responseInformation = responseInformationTypeInfo.value;
          pos += responseInformationTypeInfo.length;
        }
        break;
      case 0x1C: // (28) Server Reference, type: UTF-8 Encoded String
        {
          const serverReferenceInfo = utfEncodedStringToString(buffer, pos);
          properties.serverReference = serverReferenceInfo.value;
          pos += serverReferenceInfo.length;
        }
        break;
      case 0x1F: // (31) ReasonString, type: UTF-8 Encoded String
        {
          const reasonStringInfo = utfEncodedStringToString(buffer, pos);
          properties.reasonString = reasonStringInfo.value;
          pos += reasonStringInfo.length;
        }
        break;
      case 0x21: // (33) ReceiveMaximum, type: Two Byte Integer
        properties.receiveMaximum = twoByteIntegerToNum(buffer, pos);
        pos += 2;
        break;
      case 0x22: // (34) TopicAliasMaximum,  type: Two Byte Integer
        properties.topicAliasMaximum = twoByteIntegerToNum(buffer, pos);
        pos += 2;
        break;
      case 0x23: // (35) TopicAlias , type: Two Byte Integer
        properties.topicAlias = twoByteIntegerToNum(buffer, pos);
        pos += 2;
        break;
      case 0x24: // (36) Maximum QoS , type: Byte
        properties.maximumQoS = numToQoS(buffer[pos++]);
        break;
      case 0x25: // (37) Retain Available , type: Byte
        properties.retainAvailable = buffer[pos++] === 1 ? true : false;
        break;
      case 0x26: // (38) UserPropertis , type: UserProperties
        {
          const keyInfo = utfEncodedStringToString(buffer, pos);
          const key = keyInfo.value;
          pos += keyInfo.length;
          const valInfo = utfEncodedStringToString(buffer, pos);
          const val = valInfo.value;
          pos += valInfo.length;

          if (properties.userProperties) {
            properties.userProperties.push({ key, val });
          } else {
            properties.userProperties = [{ key, val }];
          }
        }
        break;
      case 0x27: // (39) Maximum Packet Size , type: Four Byte Integer
        properties.maximumPacketSize = fourByteIntegerToNum(buffer, pos);
        pos += 4;
        break;
      case 0x28: // (40) Wildcard Subscription Available , type: Byte
        properties.wildcardSubscriptionAvailable = buffer[pos++] === 1 ? true : false;
        break;
      case 0x29: // (41) Subscription Identifiers Available , type: Byte
        properties.subscriptionIdentifiersAvailable = buffer[pos++] === 1 ? true : false;
        break;
      case 0x2A: // (42) Shared Subscription Available , type: Byte
        properties.sharedSubscriptionAvailable = buffer[pos++] === 1 ? true : false;
        break;
      default:
        throw new UnsuportedPropertyError(propertyId);
    }
  }

  return properties;
}

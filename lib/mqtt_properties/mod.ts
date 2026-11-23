/**
 * This module contains definitions and functions for the properties of the MQTT protocol version 5.0
 * @module
 */

import * as Mqtt from '../mqtt/mod.ts';

import { ByteReader, concatBytes, numToFourByteInteger, numToTwoByteInteger, numToVariableByteInteger, stringToUtfEncodedString } from '../mqtt_utils/mod.ts';
import { readPropertyList } from './read_properties.ts';

// `export *` keeps the error visible in the docs of the MqttProperties namespace.
export * from './error.ts';

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
  /**
   * Maximum packet size in bytes the client accepts. (id: 0x27)
   *
   * The broker must not send a larger packet. If it does, the client does not receive it: it sends DISCONNECT with the
   * Reason Code 0x95 (Packet too large) as soon as the fixed header tells the size of the packet.
   */
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
  /**
   * Identifiers of the subscriptions that matched, set by the broker. (id: 0x0B)
   *
   * Holds one identifier for each matching subscription that has one, so it can contain more than one value.
   */
  subscriptionIdentifiers?: number[];
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
  // id: 0x0B (Subscription Identifier) is not here: a client must not send it in PUBLISH (MQTT 5.0 [MQTT-3.3.4-6]).
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

type AcknowledgementPacketProperties = {
  /** Human readable reason for diagnostics. (id: 0x1F) */
  reasonString?: string;
  /** Application-defined key-value pairs. (id: 0x26) */
  userProperties?: UserProperties;
};

/** Properties of PUBACK. */
export type PubackProperties = AcknowledgementPacketProperties;
/** Properties of PUBREC. */
export type PubrecProperties = AcknowledgementPacketProperties;
/** Properties of PUBREL. */
export type PubrelProperties = AcknowledgementPacketProperties;
/** Properties of PUBCOMP. */
export type PubcompProperties = AcknowledgementPacketProperties;
/** Properties of SUBACK. */
export type SubackProperties = AcknowledgementPacketProperties;
/** Properties of UNSUBACK. */
export type UnsubackProperties = AcknowledgementPacketProperties;

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
  if (typeof properties.messageExpiryInterval !== 'undefined') { // number, 0 is meaningful (expires immediately if not deliverable)
    chunks.push([0x02], numToFourByteInteger(properties.messageExpiryInterval));
  }
  // id: 0x03
  if (typeof properties.contentType !== 'undefined') { // string, '' is encoded as a zero-length string
    chunks.push([0x03], stringToUtfEncodedString(properties.contentType));
  }
  // id: 0x08
  if (typeof properties.responseTopic !== 'undefined') { // string, '' is encoded as a zero-length string
    chunks.push([0x08], stringToUtfEncodedString(properties.responseTopic));
  }
  // id: 0x09
  if (properties.correlationData) { // Uint8Array,
    const correlationDataLength = properties.correlationData.length;
    chunks.push([0x09], numToTwoByteInteger(correlationDataLength), properties.correlationData);
  }
  // id: 0x0B, type: Variable Byte Integer
  if (properties.subscriptionIdentifier) { // number, the single identifier of SUBSCRIBE
    chunks.push([0x0B], numToVariableByteInteger(properties.subscriptionIdentifier));
  }
  if (properties.subscriptionIdentifiers) { // number[], one property per identifier (PUBLISH)
    properties.subscriptionIdentifiers.forEach((id) => {
      chunks.push([0x0B], numToVariableByteInteger(id));
    });
  }
  // id: 0x11, type: Four Byte Integer
  if (typeof properties.sessionExpiryInterval !== 'undefined') { // number, 0 is meaningful in DISCONNECT (ends the session) and CONNACK
    chunks.push([0x11], numToFourByteInteger(properties.sessionExpiryInterval));
  }
  // id: 0x12
  if (typeof properties.assignedClientIdentifier !== 'undefined') { // string, '' is encoded as a zero-length string
    chunks.push([0x12], stringToUtfEncodedString(properties.assignedClientIdentifier));
  }
  // id: 0x13, type: Two Byte Integer
  if (typeof properties.serverKeepAlive !== 'undefined') { // number, 0 is meaningful (keep alive disabled)
    chunks.push([0x13], numToTwoByteInteger(properties.serverKeepAlive));
  }
  // id: 0x15
  if (typeof properties.authenticationMethod !== 'undefined') { // string, '' is encoded as a zero-length string
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
  if (typeof properties.responseInformation !== 'undefined') { // string, '' is encoded as a zero-length string
    chunks.push([0x1A], stringToUtfEncodedString(properties.responseInformation));
  }
  // id: 0x1C
  if (typeof properties.serverReference !== 'undefined') { // string, '' is encoded as a zero-length string
    chunks.push([0x1C], stringToUtfEncodedString(properties.serverReference));
  }
  // id: 0x1F
  if (typeof properties.reasonString !== 'undefined') { // string, '' is encoded as a zero-length string
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
  if (typeof properties.maximumQoS !== 'undefined') { // Mqtt.QoS, 0 is meaningful (QoS 0 only)
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
 * @throws if the properties are malformed: a property goes past `propertyLength` or past the end of `buffer`, or a string is
 * ill-formed UTF-8 or contains U+0000.
 * @throws if the properties are a Protocol Error (MQTT 5.0 chapter 3): a property is included more than once (other than the
 * User Property, the Subscription Identifier, and the Payload Format Indicator and Message Expiry Interval of PUBLISH), a
 * property that is 0 or 1 (e.g. Retain Available, Maximum QoS) has another value, or the Receive Maximum, the Maximum Packet
 * Size or a Subscription Identifier is 0.
 * @throws {UnsupportedPropertyError} if a property identifier is not supported.
 */
export function parseMqttProperties(
  buffer: Uint8Array,
  offset: number,
  propertyLength: number,
): Properties {
  return readPropertyList(new ByteReader(buffer.subarray(offset), propertyLength));
}

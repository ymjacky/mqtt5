/**
 * This module contains definitions and functions for the properties of the MQTT protocol version 5.0
 * @module
 */

import * as Mqtt from '../mqtt/mod.ts';

import {
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

export class UnsuportedPropertyError extends Error {
  constructor(propertyId: number) {
    super(`unsuported property. propertyId: ${propertyId}`);
  }
} // // id: 0x01

export type StringPair = { key: string; val: string };
export type UserProperties = StringPair[];

export type ConnectProperties = {
  // id: 0x11
  sessionExpiryInterval?: number;
  // id: 0x15
  authenticationMethod?: string;
  // id: 0x16
  authenticationData?: Uint8Array;
  // id: 0x17
  requestProblemInformation?: boolean;
  // id: 0x19
  requestResponseInformation?: boolean;
  // id: 0x21
  receiveMaximum?: number;
  // id: 0x22
  topicAliasMaximum?: number;
  // id: 0x26
  userProperties?: UserProperties;
  // id: 0x27
  maximumPacketSize?: number;
};

export type ConnackProperties = {
  // id: 0x11
  sessionExpiryInterval?: number;
  // id: 0x12
  assignedClientIdentifier?: string;
  // id: 0x13
  serverKeepAlive?: number;
  // id: 0x15
  authenticationMethod?: string;
  // id: 0x16
  authenticationData?: Uint8Array;
  // id: 0x1A
  responseInformation?: string;
  // id: 0x1C
  serverReference?: string;
  // id: 0x1F
  reasonString?: string;
  // id: 0x21
  receiveMaximum?: number;
  // id: 0x22
  topicAliasMaximum?: number;
  // id: 0x24
  maximumQoS?: Mqtt.QoS;
  // id: 0x25
  retainAvailable?: boolean;
  // id: 0x26
  userProperties?: UserProperties;
  // id: 0x27
  maximumPacketSize?: number;
  // id: 0x28
  wildcardSubscriptionAvailable?: boolean;
  // id: 0x29
  subscriptionIdentifiersAvailable?: boolean;
  // id: 0x2A
  sharedSubscriptionAvailable?: boolean;
};

export type PublishProperties = {
  // id: 0x01
  payloadFormatIndicator?: number;
  // id: 0x02
  messageExpiryInterval?: number;
  // id: 0x03
  contentType?: string;
  // id: 0x08
  responseTopic?: string;
  // id: 0x09
  correlationData?: Uint8Array;
  // id: 0x0B
  subscriptionIdentifier?: number;
  // id: 0x23
  topicAlias?: number;
  // id: 0x26
  userProperties?: UserProperties;
};

export type UserPublishProperties = {
  // id: 0x01
  payloadFormatIndicator?: number;
  // id: 0x02
  messageExpiryInterval?: number;
  // id: 0x03
  contentType?: string;
  // id: 0x08
  responseTopic?: string;
  // id: 0x09
  correlationData?: Uint8Array;
  // id: 0x0B
  subscriptionIdentifier?: number;
  // // id: 0x23
  // topicAlias?: number;
  // id: 0x26
  userProperties?: UserProperties;
};

export type SubscribeProperties = {
  // id: 0x0B
  subscriptionIdentifier?: number;
  // id: 0x26
  userProperties?: UserProperties;
};

export type UnsubscribeProperties = {
  // id: 0x26
  userProperties?: UserProperties;
};

export type DisconnectProperties = {
  // id: 0x11
  sessionExpiryInterval?: number;
  // id: 0x1C
  serverReference?: string;
  // id: 0x1F
  reasonString?: string;
  // id: 0x26
  userProperties?: UserProperties;
};

export type AuthProperties = {
  // id: 0x15
  authenticationMethod?: string;
  // id: 0x16
  authenticationData?: Uint8Array;
  // id: 0x1F
  reasonString?: string;
  // id: 0x26
  userProperties?: UserProperties;
};
export type WillProperties = {
  // id: 0x01
  payloadFormatIndicator?: number;
  // id: 0x02
  messageExpiryInterval?: number;
  // id: 0x03
  contentType?: string;
  // id: 0x08
  responseTopic?: string;
  // id: 0x09
  correlationData?: Uint8Array;
  // id: 0x18
  willDelayInterval?: number;
  // id: 0x26
  userProperties?: UserProperties;
};

type AcknolagePacketProperties = {
  // id: 0x1F
  reasonString?: string;
  // id: 0x26
  userProperties?: UserProperties;
};

export type PubackProperties = AcknolagePacketProperties;
export type PubrecProperties = AcknolagePacketProperties;
export type PubrelProperties = AcknolagePacketProperties;
export type PubcompProperties = AcknolagePacketProperties;
export type SubackProperties = AcknolagePacketProperties;
export type UnsubackProperties = AcknolagePacketProperties;

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

export function propertiesToBytes(properties?: Properties): Uint8Array {
  if (typeof properties === 'undefined') {
    return new Uint8Array([0x00]);
  }

  const bytes = [];
  // id: 0x01 , type: Byte
  if (properties.payloadFormatIndicator) {
    bytes.push(0x01, properties.payloadFormatIndicator & 0xFF);
  }
  // id: 0x02 , type: Four Byte Integer
  if (properties.messageExpiryInterval) { // number ,
    bytes.push(0x02, ...numToFourByteInteger(properties.messageExpiryInterval));
  }
  // id: 0x03
  if (properties.contentType) { // string,
    bytes.push(0x03, ...stringToUtfEncodedString(properties.contentType));
  }
  // id: 0x08
  if (properties.responseTopic) { // string ,
    bytes.push(0x08, ...stringToUtfEncodedString(properties.responseTopic));
  }
  // id: 0x09
  if (properties.correlationData) { // Uint8Array,
    const correlationDataLength = properties.correlationData.length;
    bytes.push(0x09, ...numToTwoByteInteger(correlationDataLength), ...properties.correlationData);
  }
  // id: 0x0B, type: Variable Byte Integer
  if (properties.subscriptionIdentifier) { // number,
    bytes.push(0x0B, ...numToVariableByteInteger(properties.subscriptionIdentifier));
  }
  // id: 0x11, type: Four Byte Integer
  if (properties.sessionExpiryInterval) { // number ,
    bytes.push(0x11, ...numToFourByteInteger(properties.sessionExpiryInterval));
  }
  // id: 0x12
  if (properties.assignedClientIdentifier) { // string,
    bytes.push(0x12, ...stringToUtfEncodedString(properties.assignedClientIdentifier));
  }
  // id: 0x13, type: Two Byte Integer
  if (properties.serverKeepAlive) { // number ,
    bytes.push(0x13, ...numToTwoByteInteger(properties.serverKeepAlive));
  }
  // id: 0x15
  if (properties.authenticationMethod) { // string ,
    bytes.push(0x15, ...stringToUtfEncodedString(properties.authenticationMethod));
  }
  // id: 0x16
  if (properties.authenticationData) { // Uint8Array,
    const authenticationDataLength = properties.authenticationData.length;
    bytes.push(0x16, ...numToTwoByteInteger(authenticationDataLength), ...properties.authenticationData);
  }
  // id: 0x17
  if (typeof properties.requestProblemInformation !== 'undefined') { // boolean ,
    bytes.push(0x17, properties.requestProblemInformation ? 1 : 0);
  }
  // id: 0x18
  if (properties.willDelayInterval) { // number ,
    bytes.push(0x18, ...numToFourByteInteger(properties.willDelayInterval));
  }
  // id: 0x19
  if (typeof properties.requestResponseInformation !== 'undefined') { // boolean,
    bytes.push(0x19, properties.requestResponseInformation ? 1 : 0);
  }
  // id: 0x1A
  if (properties.responseInformation) { // string,
    bytes.push(0x1A, ...stringToUtfEncodedString(properties.responseInformation));
  }
  // id: 0x1C
  if (properties.serverReference) { // string,
    bytes.push(0x1C, ...stringToUtfEncodedString(properties.serverReference));
  }
  // id: 0x1F
  if (properties.reasonString) { // string,
    bytes.push(0x1F, ...stringToUtfEncodedString(properties.reasonString));
  }
  // id: 0x21 type: Two Byte Integer
  if (properties.receiveMaximum) { // number,
    bytes.push(0x21, ...numToTwoByteInteger(properties.receiveMaximum));
  }
  // id: 0x22 type: Two Byte Integer
  if (properties.topicAliasMaximum) { // number,
    bytes.push(0x22, ...numToTwoByteInteger(properties.topicAliasMaximum));
  }
  // id: 0x23, type: Two Byte Integer
  if (properties.topicAlias) { // number,
    bytes.push(0x23, ...numToTwoByteInteger(properties.topicAlias));
  }
  // id: 0x24, type: Byte
  if (properties.maximumQoS) { // Mqtt.QoS,
    bytes.push(0x24, properties.maximumQoS & 0xFF);
  }
  // id: 0x25, type: Byte
  if (typeof properties.retainAvailable !== 'undefined') { // boolean,
    bytes.push(0x25, properties.retainAvailable ? 1 : 0);
  }
  // id: 0x26, type: UTF-8 String Pair
  if (properties.userProperties) { // string,
    if (properties.userProperties.length !== 0) {
      properties.userProperties.forEach((entry) => {
        bytes.push(0x26);
        bytes.push(...stringToUtfEncodedString(entry.key));
        bytes.push(...stringToUtfEncodedString(entry.val));
      });
    }
  }
  // id: 0x27, type: Four Byte Integer
  if (properties.maximumPacketSize) { // number,
    bytes.push(0x27, ...numToFourByteInteger(properties.maximumPacketSize));
  }
  // id: 0x28, type: Byte
  if (typeof properties.wildcardSubscriptionAvailable !== 'undefined') { // boolean,
    bytes.push(0x28, properties.wildcardSubscriptionAvailable ? 1 : 0);
  }
  // id: 0x29, type: Byte
  if (typeof properties.subscriptionIdentifiersAvailable !== 'undefined') { // boolean,
    bytes.push(0x29, properties.subscriptionIdentifiersAvailable ? 1 : 0);
  }
  // id: 0x2A, type: Byte
  if (typeof properties.sharedSubscriptionAvailable !== 'undefined') { // boolean ,
    bytes.push(0x2A, properties.sharedSubscriptionAvailable ? 1 : 0);
  }

  return new Uint8Array([...numToVariableByteInteger(bytes.length), ...bytes]);
}

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

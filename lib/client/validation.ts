/**
 * Checks of the values given to publish(), subscribe(), unsubscribe() and connect(), done before anything is sent.
 * Only the values that are sent are checked: MQTT 3.1.1 packets have no properties and no Retain Handling,
 * so they are not checked there.
 * The packet encoders do not check them: they encode what they are given.
 * @module
 */

import { Mqtt, MqttProperties, MqttUtils } from '../mod.ts';
import { ConnectOptions, SubscriptionOption } from './client_types.ts';
import {
  InvalidArgumentError,
  InvalidPropertyError,
  InvalidTopicFilterError,
  InvalidTopicNameError,
  QoSNotSupportedError,
  RetainNotSupportedError,
  SharedSubscriptionsNotSupportedError,
  SubscriptionIdentifiersNotSupportedError,
  WildcardSubscriptionsNotSupportedError,
} from './error.ts';

const sharedSubscriptionPrefix = '$share/';

const maxTwoByteInteger = 0xFFFF;
const maxFourByteInteger = 0xFFFF_FFFF;
/** The maximum length in bytes of a UTF-8 Encoded String and of Binary Data: their length is a Two Byte Integer. */
const maxDataLength = 0xFFFF;

const textEncoder = new TextEncoder();

/** The length in bytes of a string encoded as UTF-8. */
function utf8Length(str: string): number {
  return textEncoder.encode(str).length;
}

/** Whether the packets of the protocol version have properties and the other MQTT 5.0 fields. */
function isMqtt5(protocolVersion: Mqtt.ProtocolVersion): boolean {
  return protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1;
}

/**
 * Checks a value that must be 0, 1 or 2, e.g. a QoS or a Retain Handling.
 * @throws {InvalidArgumentError}
 */
function validateZeroToTwo(value: number, name: string): void {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new InvalidArgumentError(`${name} must be 0, 1 or 2 (got ${value})`);
  }
}

/**
 * Checks a Topic Name: at least one character, at most 65,535 bytes, no U+0000 and no wildcard characters
 * ([MQTT-4.7.3-1], [MQTT-4.7.3-2], [MQTT-4.7.3-3], [MQTT-3.3.2-2]).
 * @param topic the Topic Name to check.
 * @param name what the value is, used in the error message, e.g. `topic`.
 * @throws {InvalidTopicNameError}
 */
export function validateTopicName(topic: string, name: string): void {
  if (topic.length === 0) {
    throw new InvalidTopicNameError(`${name} must be at least one character long`);
  }
  if (utf8Length(topic) > maxDataLength) {
    throw new InvalidTopicNameError(`${name} must be at most ${maxDataLength} bytes long in UTF-8`);
  }
  if (topic.includes('\u0000')) {
    throw new InvalidTopicNameError(`${name} ${JSON.stringify(topic)} must not contain U+0000`);
  }
  if (topic.includes('+') || topic.includes('#')) {
    throw new InvalidTopicNameError(`${name} ${JSON.stringify(topic)} must not contain the wildcard characters + and #`);
  }
}

/** Whether the Topic Filter is a Shared Subscription. `$share` is special in MQTT 5.0 only. */
function isSharedSubscription(topicFilter: string, protocolVersion: Mqtt.ProtocolVersion): boolean {
  return isMqtt5(protocolVersion) && topicFilter.startsWith(sharedSubscriptionPrefix);
}

/**
 * Checks the wildcard characters of a Topic Filter: `#` only as the whole last level and `+` only as a whole level
 * ([MQTT-4.7.1-1], [MQTT-4.7.1-2]).
 */
function validateWildcards(topicFilter: string, quoted: string): void {
  const levels = topicFilter.split('/');
  levels.forEach((level, i) => {
    if (level.includes('#') && (level !== '#' || i !== levels.length - 1)) {
      throw new InvalidTopicFilterError(`${quoted}: # must be the whole last level`);
    }
    if (level.includes('+') && level !== '+') {
      throw new InvalidTopicFilterError(`${quoted}: + must be a whole level`);
    }
  });
}

/**
 * Checks a Topic Filter: at least one character, at most 65,535 bytes, no U+0000 and the rules of {@link validateWildcards}
 * ([MQTT-4.7.3-1], [MQTT-4.7.3-3], [MQTT-4.7.3-2]).
 * In MQTT 5.0, a filter that starts with `$share/` must have the form `$share/{ShareName}/{filter}`,
 * where ShareName is at least one character and contains no `/`, `+` or `#` ([MQTT-4.8.2-1], [MQTT-4.8.2-2]).
 * @throws {InvalidTopicFilterError}
 */
export function validateTopicFilter(topicFilter: string, protocolVersion: Mqtt.ProtocolVersion): void {
  if (topicFilter.length === 0) {
    throw new InvalidTopicFilterError('a topic filter must be at least one character long');
  }
  if (utf8Length(topicFilter) > maxDataLength) {
    throw new InvalidTopicFilterError(`a topic filter must be at most ${maxDataLength} bytes long in UTF-8`);
  }
  const quoted = JSON.stringify(topicFilter);
  if (topicFilter.includes('\u0000')) {
    throw new InvalidTopicFilterError(`${quoted} must not contain U+0000`);
  }
  if (!isSharedSubscription(topicFilter, protocolVersion)) {
    validateWildcards(topicFilter, quoted);
    return;
  }

  const rest = topicFilter.slice(sharedSubscriptionPrefix.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) {
    throw new InvalidTopicFilterError(`${quoted}: a shared subscription must have the form $share/{ShareName}/{filter}`);
  }
  const shareName = rest.slice(0, slash);
  if (shareName.includes('+') || shareName.includes('#')) {
    throw new InvalidTopicFilterError(`${quoted}: ShareName must not contain + or #`);
  }
  const filter = rest.slice(slash + 1);
  if (filter.length === 0) {
    throw new InvalidTopicFilterError(`${quoted}: the topic filter after $share/{ShareName}/ must be at least one character long`);
  }
  validateWildcards(filter, quoted);
}

/** Checks one property value. `name` is the property's path, used in the error message. */
type PropertyRule = (value: unknown, name: string) => void;

/** An integer from `min` to `max`. */
function integerIn(min: number, max: number): PropertyRule {
  return (value, name) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new InvalidPropertyError(`${name} must be an integer from ${min} to ${max} (got ${value})`);
    }
  };
}

/** A UTF-8 Encoded String: at most 65,535 bytes and no U+0000 ([MQTT-1.5.4-1], [MQTT-1.5.4-2]). */
const utf8String: PropertyRule = (value, name) => {
  if (typeof value !== 'string') {
    throw new InvalidPropertyError(`${name} must be a string`);
  }
  if (utf8Length(value) > maxDataLength) {
    throw new InvalidPropertyError(`${name} must be at most ${maxDataLength} bytes long in UTF-8`);
  }
  if (value.includes('\u0000')) {
    throw new InvalidPropertyError(`${name} ${JSON.stringify(value)} must not contain U+0000`);
  }
};

/** Binary Data: a Uint8Array of at most 65,535 bytes. */
const binaryData: PropertyRule = (value, name) => {
  if (!(value instanceof Uint8Array)) {
    throw new InvalidPropertyError(`${name} must be a Uint8Array`);
  }
  if (value.length > maxDataLength) {
    throw new InvalidPropertyError(`${name} must be at most ${maxDataLength} bytes long (got ${value.length})`);
  }
};

/** User Properties: UTF-8 String Pairs. */
const userProperties: PropertyRule = (value, name) => {
  if (!Array.isArray(value)) {
    throw new InvalidPropertyError(`${name} must be an array of { key, val }`);
  }
  value.forEach((pair, i) => {
    utf8String(pair?.key, `${name}[${i}].key`);
    utf8String(pair?.val, `${name}[${i}].val`);
  });
};

/** A Response Topic is a Topic Name. */
const responseTopic: PropertyRule = (value, name) => {
  if (typeof value !== 'string') {
    throw new InvalidPropertyError(`${name} must be a string`);
  }
  validateTopicName(value, name);
};

/**
 * The rules of the properties a client sends. A property without a rule (e.g. a boolean, which is encoded as 0 or 1)
 * is not checked.
 */
const propertyRules: Partial<Record<keyof MqttProperties.Properties, PropertyRule>> = {
  payloadFormatIndicator: integerIn(0, 1), // id: 0x01
  messageExpiryInterval: integerIn(0, maxFourByteInteger), // id: 0x02
  contentType: utf8String, // id: 0x03
  responseTopic, // id: 0x08
  correlationData: binaryData, // id: 0x09
  subscriptionIdentifier: integerIn(1, MqttUtils.maxVariableByteInteger), // id: 0x0B
  sessionExpiryInterval: integerIn(0, maxFourByteInteger), // id: 0x11
  authenticationMethod: utf8String, // id: 0x15
  authenticationData: binaryData, // id: 0x16
  willDelayInterval: integerIn(0, maxFourByteInteger), // id: 0x18
  serverReference: utf8String, // id: 0x1C
  reasonString: utf8String, // id: 0x1F
  receiveMaximum: integerIn(1, maxTwoByteInteger), // id: 0x21, 0 is a Protocol Error
  topicAliasMaximum: integerIn(0, maxTwoByteInteger), // id: 0x22
  userProperties, // id: 0x26
  maximumPacketSize: integerIn(1, maxFourByteInteger), // id: 0x27, 0 is a Protocol Error
};

/**
 * Checks MQTT 5.0 properties. A Response Topic must be a valid Topic Name.
 * @param name the path of the properties, used in the error message, e.g. `properties`.
 * @throws {InvalidPropertyError}
 * @throws {InvalidTopicNameError} if the Response Topic is not a valid Topic Name.
 */
export function validateProperties(properties: object | undefined, name: string): void {
  if (typeof properties === 'undefined') {
    return;
  }
  for (const [key, value] of Object.entries(properties)) {
    const rule = propertyRules[key as keyof MqttProperties.Properties];
    if (rule && typeof value !== 'undefined') {
      rule(value, `${name}.${key}`);
    }
  }
}

/**
 * Checks the topic, QoS, DUP flag and properties of publish(). `qos` and `dup` are the values that are sent.
 * The topic is the one given by the caller, before topic alias resolution.
 * @throws {InvalidTopicNameError}
 * @throws {InvalidArgumentError}
 * @throws {InvalidPropertyError}
 */
export function validatePublish(
  topic: string,
  qos: number,
  dup: boolean,
  properties: MqttProperties.UserPublishProperties | undefined,
  protocolVersion: Mqtt.ProtocolVersion,
): void {
  validateTopicName(topic, 'topic');
  validateZeroToTwo(qos, 'qos');
  if (dup && qos === Mqtt.QoS.AT_MOST_ONCE) {
    // [MQTT-3.3.1-2]
    throw new InvalidArgumentError('dup must be false for QoS 0');
  }
  if (isMqtt5(protocolVersion)) {
    validateProperties(properties, 'properties');
  }
}

/**
 * What the broker accepts from the client on a connection, as it said in CONNACK. The broker treats what it does not
 * accept as a Protocol Error and closes the connection.
 */
export type BrokerCapabilities = {
  /** The Maximum QoS of CONNACK. Every QoS level is supported if undefined. */
  maximumQoS?: Mqtt.QoS;
  /** The Retain Available of CONNACK: whether retained messages are supported. */
  retainAvailable: boolean;
  /** The Wildcard Subscription Available of CONNACK: whether topic filters with `+` or `#` are supported. */
  wildcardSubscriptionAvailable: boolean;
  /** The Subscription Identifiers Available of CONNACK: whether Subscription Identifiers are supported. */
  subscriptionIdentifiersAvailable: boolean;
  /** The Shared Subscription Available of CONNACK: whether `$share/...` subscriptions are supported. */
  sharedSubscriptionAvailable: boolean;
};

/** What a broker that restricts nothing accepts: before CONNACK, with MQTT 3.1.1, and for a CONNACK without these properties. */
export const unrestrictedBroker: Readonly<BrokerCapabilities> = {
  retainAvailable: true,
  wildcardSubscriptionAvailable: true,
  subscriptionIdentifiersAvailable: true,
  sharedSubscriptionAvailable: true,
};

/** The capabilities of the broker from the properties of its CONNACK. An absent property means that it is supported. */
export function brokerCapabilitiesOf(properties: MqttProperties.ConnackProperties | undefined): BrokerCapabilities {
  return {
    maximumQoS: properties?.maximumQoS,
    retainAvailable: properties?.retainAvailable ?? true,
    wildcardSubscriptionAvailable: properties?.wildcardSubscriptionAvailable ?? true,
    subscriptionIdentifiersAvailable: properties?.subscriptionIdentifiersAvailable ?? true,
    sharedSubscriptionAvailable: properties?.sharedSubscriptionAvailable ?? true,
  };
}

/**
 * Checks that the broker accepts the QoS and the Retain flag of a PUBLISH.
 * @param qos the QoS that is sent.
 * @param retain the Retain flag that is sent.
 * @throws {QoSNotSupportedError} if `qos` is higher than the Maximum QoS [MQTT-3.2.2-11].
 * @throws {RetainNotSupportedError} if `retain` is true and retained messages are not supported [MQTT-3.2.2-14].
 */
export function validatePublishCapabilities(qos: number, retain: boolean, capabilities: BrokerCapabilities): void {
  if (capabilities.maximumQoS !== undefined && qos > capabilities.maximumQoS) {
    throw new QoSNotSupportedError(qos, capabilities.maximumQoS);
  }
  if (retain && !capabilities.retainAvailable) {
    throw new RetainNotSupportedError();
  }
}

/**
 * Checks that the broker supports what the subscriptions and properties of a SUBSCRIBE use: wildcards, shared subscriptions
 * and a Subscription Identifier (MQTT 5.0 3.2.2.3.11 to 3.2.2.3.13). The Topic Filters are valid: see {@link validateSubscribe}.
 * @throws {WildcardSubscriptionsNotSupportedError}
 * @throws {SharedSubscriptionsNotSupportedError}
 * @throws {SubscriptionIdentifiersNotSupportedError}
 */
export function validateSubscribeCapabilities(
  subscriptions: SubscriptionOption[],
  properties: MqttProperties.SubscribeProperties | undefined,
  capabilities: BrokerCapabilities,
): void {
  for (const { topicFilter } of subscriptions) {
    if (!capabilities.sharedSubscriptionAvailable && topicFilter.startsWith(sharedSubscriptionPrefix)) {
      throw new SharedSubscriptionsNotSupportedError(topicFilter);
    }
    if (!capabilities.wildcardSubscriptionAvailable && (topicFilter.includes('+') || topicFilter.includes('#'))) {
      throw new WildcardSubscriptionsNotSupportedError(topicFilter);
    }
  }
  if (!capabilities.subscriptionIdentifiersAvailable && typeof properties?.subscriptionIdentifier !== 'undefined') {
    throw new SubscriptionIdentifiersNotSupportedError();
  }
}

/**
 * Checks the subscriptions and properties of subscribe(). `subscriptions` hold the QoS that is sent.
 * @throws {InvalidTopicFilterError}
 * @throws {InvalidArgumentError}
 * @throws {InvalidPropertyError}
 */
export function validateSubscribe(
  subscriptions: SubscriptionOption[],
  properties: MqttProperties.SubscribeProperties | undefined,
  protocolVersion: Mqtt.ProtocolVersion,
): void {
  if (subscriptions.length === 0) {
    // [MQTT-3.8.3-2]
    throw new InvalidArgumentError('subscribe() needs at least one topic filter');
  }

  for (const sub of subscriptions) {
    validateTopicFilter(sub.topicFilter, protocolVersion);
    const quoted = JSON.stringify(sub.topicFilter);
    validateZeroToTwo(sub.qos, `qos of ${quoted}`);
    if (isMqtt5(protocolVersion) && typeof sub.retainHandling !== 'undefined') {
      validateZeroToTwo(sub.retainHandling, `retainHandling of ${quoted}`);
    }
    if (sub.noLocal && isSharedSubscription(sub.topicFilter, protocolVersion)) {
      // [MQTT-3.8.3-4]
      throw new InvalidArgumentError(`noLocal must not be true for the shared subscription ${quoted}`);
    }
  }

  if (isMqtt5(protocolVersion)) {
    validateProperties(properties, 'properties');
  }
}

/**
 * Checks the topic filters and properties of unsubscribe().
 * @throws {InvalidTopicFilterError}
 * @throws {InvalidArgumentError}
 * @throws {InvalidPropertyError}
 */
export function validateUnsubscribe(
  topicFilters: string[],
  properties: MqttProperties.UnsubscribeProperties | undefined,
  protocolVersion: Mqtt.ProtocolVersion,
): void {
  if (topicFilters.length === 0) {
    // [MQTT-3.10.3-2]
    throw new InvalidArgumentError('unsubscribe() needs at least one topic filter');
  }
  for (const topicFilter of topicFilters) {
    validateTopicFilter(topicFilter, protocolVersion);
  }
  if (isMqtt5(protocolVersion)) {
    validateProperties(properties, 'properties');
  }
}

/**
 * Checks the options of connect(): the CONNECT properties and the Will.
 * The Will Topic is a Topic Name, the Will QoS is 0, 1 or 2 and the Will Payload is at most 65,535 bytes.
 * @throws {InvalidTopicNameError}
 * @throws {InvalidArgumentError}
 * @throws {InvalidPropertyError}
 */
export function validateConnect(options: ConnectOptions | undefined, protocolVersion: Mqtt.ProtocolVersion): void {
  const mqtt5 = isMqtt5(protocolVersion);
  if (mqtt5) {
    validateProperties(options?.properties, 'properties');
  }

  const will = options?.will;
  if (!will) {
    return;
  }
  validateTopicName(will.topic, 'will.topic');
  if (typeof will.qos !== 'undefined') {
    validateZeroToTwo(will.qos, 'will.qos');
  }
  if (will.payload && will.payload.length > maxDataLength) {
    throw new InvalidArgumentError(`will.payload must be at most ${maxDataLength} bytes long (got ${will.payload.length})`);
  }
  if (mqtt5) {
    validateProperties(will.properties, 'will.properties');
  }
}

/**
 * Checks the properties of disconnect() (MQTT 5.0; MQTT 3.1.1 DISCONNECT has none, so they are not sent there).
 * A Session Expiry Interval other than 0 cannot be set when the Session Expiry Interval of CONNECT was 0 or absent:
 * the broker would not treat the DISCONNECT as valid, and would publish the Will Message (MQTT 5.0 3.14.2.2.2).
 * The rule is about the value the client sent in CONNECT, also when the broker uses another one (CONNACK).
 * @param connectProperties the properties of the CONNECT of the current connection.
 * @throws {InvalidPropertyError}
 */
export function validateDisconnect(
  properties: MqttProperties.DisconnectProperties | undefined,
  connectProperties: MqttProperties.ConnectProperties | undefined,
  protocolVersion: Mqtt.ProtocolVersion,
): void {
  if (!isMqtt5(protocolVersion)) {
    return;
  }
  validateProperties(properties, 'properties');
  const sessionExpiryInterval = properties?.sessionExpiryInterval;
  if (sessionExpiryInterval !== undefined && sessionExpiryInterval !== 0 && !connectProperties?.sessionExpiryInterval) {
    throw new InvalidPropertyError(
      `properties.sessionExpiryInterval must be 0 or absent, as the Session Expiry Interval of CONNECT was 0 or absent (got ${sessionExpiryInterval})`,
    );
  }
}

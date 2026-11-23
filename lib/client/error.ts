/**
 * This module contains the errors thrown by the clients
 * @module
 */

import type * as Mqtt from '../mqtt/mod.ts';

// Thrown below the client, by the splitting of the received bytes into packets, and re-exported here.
// `export *` keeps it visible in the docs of the ClientErrors namespace.
export * from '../mqtt_stream_utils/error.ts';

/**
 * The connection was closed. Rejected by `connect()` when the connection is closed before CONNACK is received
 * (`WebSocketMqttClient` also when the connection cannot be opened), and by `subscribe()` and `unsubscribe()` when it is
 * closed before SUBACK / UNSUBACK is received; the broker may or may not have processed the request.
 */
export class ConnectionClosed extends Error {
  readonly #className = 'ConnectionClosed';
  constructor() {
    super(`connection closed`);
  }
}

/** CONNACK was not received within `connectTimeoutMS`. Rejected by `connect()`. */
export class ConnectTimeout extends Error {
  readonly #className = 'ConnectTimeout';
  constructor() {
    super('connect timed out');
  }
}

/** `connect()` was called while the client is connected or connecting. */
export class StateIsNotOfflineError extends Error {
  readonly #className = 'StateIsNotOfflineError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`State is not offline: ${message}`);
  }
}

/**
 * `publish()`, `subscribe()` or `unsubscribe()` was called while the client is not connected,
 * or after it has sent DISCONNECT and is waiting for the connection to close.
 */
export class StateIsNotOnlineError extends Error {
  readonly #className = 'StateIsNotOnlineError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`State is not online: ${message}`);
  }
}

/**
 * The broker did not keep the session (CONNACK Session Present is 0), so a request sent on a previous connection
 * will not complete. Rejected by `publish()` (QoS 1 and 2) waiting for PUBACK / PUBREC / PUBCOMP.
 * The message may or may not have reached the broker.
 */
export class SessionLostError extends Error {
  readonly #className = 'SessionLostError';
  constructor() {
    super('session lost: the broker did not keep the session');
  }
}

/** A packet could not be sent because the client is not connected. */
export class SendPacketError extends Error {
  readonly #className = 'SendPacketError';
  constructor() {
    super(`can't send packet because offline`);
  }
}

/**
 * A Topic Name is invalid: the topic or Response Topic of `publish()`, or the Will Topic or Will Response Topic of `connect()`.
 * The call rejects with it and nothing is sent.
 */
export class InvalidTopicNameError extends Error {
  readonly #className = 'InvalidTopicNameError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`invalid topic name: ${message}`);
  }
}

/** A Topic Filter of `subscribe()` or `unsubscribe()` is invalid. The call rejects with it and nothing is sent. */
export class InvalidTopicFilterError extends Error {
  readonly #className = 'InvalidTopicFilterError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`invalid topic filter: ${message}`);
  }
}

/**
 * An MQTT 5.0 property is invalid, e.g. a number out of the range of its type, a string longer than 65,535 bytes or with U+0000
 * or a lone surrogate, or a Subscription Identifier of 0. The call rejects with it and nothing is sent.
 */
export class InvalidPropertyError extends Error {
  readonly #className = 'InvalidPropertyError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`invalid property: ${message}`);
  }
}

/**
 * Another argument or option is invalid, e.g. a QoS other than 0, 1 or 2, or an empty list of topic filters.
 * The call rejects with it and nothing is sent.
 */
export class InvalidArgumentError extends Error {
  readonly #className = 'InvalidArgumentError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`invalid argument: ${message}`);
  }
}

/**
 * A packet is too large to send: larger than the Maximum Packet Size of the broker (CONNACK, MQTT 5.0),
 * or its Remaining Length is larger than 268,435,455 bytes, the largest MQTT allows.
 * Rejected by `connect()`, `publish()`, `subscribe()`, `unsubscribe()` and `auth()`; nothing is sent.
 * A QoS 1 / QoS 2 `publish()` also rejects with it when its message, resent after reconnecting, is too large for the new connection.
 */
export class PacketTooLargeError extends Error {
  readonly #className = 'PacketTooLargeError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`packet too large: ${message}`);
  }
}

/**
 * The call asks for something that the broker said in CONNACK (MQTT 5.0) it does not support. The call rejects with one of
 * the subclasses, which tell what is not supported, and nothing is sent: the broker would treat it as a Protocol Error and
 * close the connection. Catch this class to handle all of them at once.
 *
 * What the broker supports is that of the connection that is open now, and can differ after reconnecting.
 */
export class NotSupportedByBrokerError extends Error {
  readonly #className = 'NotSupportedByBrokerError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(message);
  }
}

/**
 * `publish()` was called with a QoS higher than the Maximum QoS of the broker (CONNACK). Publish with `maximumQoS`, or lower.
 */
export class QoSNotSupportedError extends NotSupportedByBrokerError {
  readonly #className = 'QoSNotSupportedError';
  /** The highest QoS the broker supports: `Mqtt.QoS.AT_MOST_ONCE` or `Mqtt.QoS.AT_LEAST_ONCE`. */
  readonly maximumQoS: Mqtt.QoS;
  /** Creates the error for the QoS that was requested and the Maximum QoS of the broker. */
  constructor(qos: number, maximumQoS: Mqtt.QoS) {
    super(`QoS not supported: qos ${qos} is higher than the Maximum QoS ${maximumQoS} of the broker`);
    this.maximumQoS = maximumQoS;
  }
}

/** `publish()` was called with `retain: true`, but the broker does not support retained messages (Retain Available is 0 in CONNACK). */
export class RetainNotSupportedError extends NotSupportedByBrokerError {
  readonly #className = 'RetainNotSupportedError';
  /** Creates the error. */
  constructor() {
    super('retain not supported: the broker does not support retained messages (Retain Available is 0)');
  }
}

/**
 * `subscribe()` was called with a topic filter that has a wildcard (`+` or `#`), but the broker does not support
 * wildcard subscriptions (Wildcard Subscription Available is 0 in CONNACK).
 */
export class WildcardSubscriptionsNotSupportedError extends NotSupportedByBrokerError {
  readonly #className = 'WildcardSubscriptionsNotSupportedError';
  /** Creates the error for the topic filter that was requested. */
  constructor(topicFilter: string) {
    super(`wildcard subscriptions not supported: ${JSON.stringify(topicFilter)} has a wildcard (Wildcard Subscription Available is 0)`);
  }
}

/**
 * `subscribe()` was called with a Subscription Identifier, but the broker does not support them
 * (Subscription Identifiers Available is 0 in CONNACK).
 */
export class SubscriptionIdentifiersNotSupportedError extends NotSupportedByBrokerError {
  readonly #className = 'SubscriptionIdentifiersNotSupportedError';
  /** Creates the error. */
  constructor() {
    super('subscription identifiers not supported: the broker does not support them (Subscription Identifiers Available is 0)');
  }
}

/**
 * `subscribe()` was called with a shared subscription (`$share/...`), but the broker does not support them
 * (Shared Subscription Available is 0 in CONNACK).
 */
export class SharedSubscriptionsNotSupportedError extends NotSupportedByBrokerError {
  readonly #className = 'SharedSubscriptionsNotSupportedError';
  /** Creates the error for the topic filter that was requested. */
  constructor(topicFilter: string) {
    super(`shared subscriptions not supported: ${JSON.stringify(topicFilter)} is a shared subscription (Shared Subscription Available is 0)`);
  }
}

/** The URL protocol is not supported by the client (`MqttClient` accepts `mqtt:` and `mqtts:`). */
export class UnexpectedUrlProtocol extends Error {
  readonly #className = 'UnexpectedUrlProtocol';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`unexpected URL protocol: ${message}`);
  }
}

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
  /** The name of the error class. */
  override readonly name = 'ConnectionClosed' as const;
  constructor() {
    super(`connection closed`);
  }
}

/** CONNACK was not received within `connectTimeoutMS`. Rejected by `connect()`. */
export class ConnectTimeout extends Error {
  /** The name of the error class. */
  override readonly name = 'ConnectTimeout' as const;
  constructor() {
    super('connect timed out');
  }
}

/**
 * While `connect()` waited for CONNACK, the client received a packet that it cannot accept, and closed the connection
 * without sending DISCONNECT. Rejected by `connect()`.
 *
 * The packet is a Malformed Packet, e.g. a CONNACK with a property that MQTT 5.0 does not define, a Protocol Error, e.g.
 * a CONNACK with a property twice, a packet larger than the Maximum Packet Size of CONNECT, a packet that only a
 * client sends, e.g. SUBSCRIBE, or a packet that the broker must not send before CONNACK, e.g. PUBLISH.
 */
export class InvalidPacketBeforeConnackError extends Error {
  /** The name of the error class. */
  override readonly name = 'InvalidPacketBeforeConnackError' as const;
  /**
   * Why the client closed the connection, e.g. `Mqtt.ReasonCode.MalformedPacket`, `Mqtt.ReasonCode.ProtocolError` or
   * `Mqtt.ReasonCode.PacketTooLarge`. It is not sent to the broker. Set with MQTT 3.1.1 too, which has no reason codes.
   */
  readonly reasonCode: Mqtt.ReasonCode;
  /** Creates the error for the reason the connection was closed for. */
  constructor(reasonCode: Mqtt.ReasonCode) {
    super(`invalid packet before CONNACK: the connection was closed (reason code 0x${reasonCode.toString(16).padStart(2, '0')})`);
    this.reasonCode = reasonCode;
  }
}

/** `connect()` was called while the client is connected or connecting. */
export class StateIsNotOfflineError extends Error {
  /** The name of the error class. */
  override readonly name = 'StateIsNotOfflineError' as const;
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
  /** The name of the error class. */
  override readonly name = 'StateIsNotOnlineError' as const;
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
  /** The name of the error class. */
  override readonly name = 'SessionLostError' as const;
  constructor() {
    super('session lost: the broker did not keep the session');
  }
}

/** A packet could not be sent because the client is not connected. */
export class SendPacketError extends Error {
  /** The name of the error class. */
  override readonly name = 'SendPacketError' as const;
  constructor() {
    super(`can't send packet because offline`);
  }
}

/**
 * A Topic Name is invalid: the topic or Response Topic of `publish()`, or the Will Topic or Will Response Topic of `connect()`.
 * The call rejects with it and nothing is sent.
 */
export class InvalidTopicNameError extends Error {
  /** The name of the error class. */
  override readonly name = 'InvalidTopicNameError' as const;
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`invalid topic name: ${message}`);
  }
}

/** A Topic Filter of `subscribe()` or `unsubscribe()` is invalid. The call rejects with it and nothing is sent. */
export class InvalidTopicFilterError extends Error {
  /** The name of the error class. */
  override readonly name = 'InvalidTopicFilterError' as const;
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
  /** The name of the error class. */
  override readonly name = 'InvalidPropertyError' as const;
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`invalid property: ${message}`);
  }
}

/**
 * Another argument or option is invalid, e.g. a QoS other than 0, 1 or 2, or an empty list of topic filters.
 * The call rejects with it and nothing is sent.
 * The client constructors throw it for an invalid option, e.g. a `keepAlive` that is not an integer from 0 to 65,535.
 */
export class InvalidArgumentError extends Error {
  /** The name of the error class. */
  override readonly name = 'InvalidArgumentError' as const;
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
  /** The name of the error class. */
  override readonly name = 'PacketTooLargeError' as const;
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
  /**
   * The name of the error class. The subclasses narrow it to their own name; the type keeps the errors that are not
   * about broker support apart from this class.
   */
  override readonly name: `${string}NotSupported${string}Error` = 'NotSupportedByBrokerError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(message);
  }
}

/**
 * `publish()` was called with a QoS higher than the Maximum QoS of the broker (CONNACK). Publish with `maximumQoS`, or lower.
 */
export class QoSNotSupportedError extends NotSupportedByBrokerError {
  /** The name of the error class. */
  override readonly name = 'QoSNotSupportedError' as const;
  /** The highest QoS the broker supports: `Mqtt.QoS.AtMostOnce` or `Mqtt.QoS.AtLeastOnce`. */
  readonly maximumQoS: Mqtt.QoS;
  /** Creates the error for the QoS that was requested and the Maximum QoS of the broker. */
  constructor(qos: number, maximumQoS: Mqtt.QoS) {
    super(`QoS not supported: qos ${qos} is higher than the Maximum QoS ${maximumQoS} of the broker`);
    this.maximumQoS = maximumQoS;
  }
}

/** `publish()` was called with `retain: true`, but the broker does not support retained messages (Retain Available is 0 in CONNACK). */
export class RetainNotSupportedError extends NotSupportedByBrokerError {
  /** The name of the error class. */
  override readonly name = 'RetainNotSupportedError' as const;
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
  /** The name of the error class. */
  override readonly name = 'WildcardSubscriptionsNotSupportedError' as const;
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
  /** The name of the error class. */
  override readonly name = 'SubscriptionIdentifiersNotSupportedError' as const;
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
  /** The name of the error class. */
  override readonly name = 'SharedSubscriptionsNotSupportedError' as const;
  /** Creates the error for the topic filter that was requested. */
  constructor(topicFilter: string) {
    super(`shared subscriptions not supported: ${JSON.stringify(topicFilter)} is a shared subscription (Shared Subscription Available is 0)`);
  }
}

/** The URL protocol is not supported by the client (`MqttClient` accepts `mqtt:` and `mqtts:`). */
export class UnexpectedUrlProtocol extends Error {
  /** The name of the error class. */
  override readonly name = 'UnexpectedUrlProtocol' as const;
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`unexpected URL protocol: ${message}`);
  }
}

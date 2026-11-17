/**
 * This module contains the errors thrown by the clients
 * @module
 */

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

/** A received packet could not be decoded. */
export class MalformedPacketError extends Error {
  readonly #className = 'MalformedPacketError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(message);
  }
}

/** The connection was reset. */
export class ConnectionReset extends Error {
  readonly #className = 'ConnectionReset';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(message);
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
 * An MQTT 5.0 property is invalid, e.g. a number out of the range of its type, a string with U+0000 or longer than 65,535 bytes,
 * or a Subscription Identifier of 0. The call rejects with it and nothing is sent.
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

/** The URL protocol is not supported by the client (`MqttClient` accepts `mqtt:` and `mqtts:`). */
export class UnexpectedUrlProtocol extends Error {
  readonly #className = 'UnexpectedUrlProtocol';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`unexpected URL protocol: ${message}`);
  }
}

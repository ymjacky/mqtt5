/**
 * This module contains the errors thrown by the clients
 * @module
 */

/**
 * The connection was closed. Also rejected by `subscribe()` and `unsubscribe()` when the connection is closed before
 * SUBACK / UNSUBACK is received; the broker may or may not have processed the request.
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

/** `publish()`, `subscribe()` or `unsubscribe()` was called while the client is not connected. */
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

/** The URL protocol is not supported by the client (`MqttClient` accepts `mqtt:` and `mqtts:`). */
export class UnexpectedUrlProtocol extends Error {
  readonly #className = 'UnexpectedUrlProtocol';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`unexpected URL protocol: ${message}`);
  }
}

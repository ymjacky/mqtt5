/**
 * This module contains the errors thrown by the clients
 * @module
 */

/** The connection was closed by the peer. */
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

/** `publish()` was called while the client is not connected. */
export class StateIsNotOnlineError extends Error {
  readonly #className = 'StateIsNotOnlineError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`State is not online: ${message}`);
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
  readonly #className = 'UnexpectedUrlProtocolextends';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`unexpected URL protcol: ${message}`);
  }
}

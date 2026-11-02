/** Received bytes could not be decoded as an MQTT packet. */
export class MqttPacketParseError extends Error {
  readonly #className = 'MqttPacketParseError';
  /** Creates the error. Pass the underlying error as `options.cause`. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** A packet could not be encoded to bytes. */
export class MqttPacketSerializeError extends Error {
  readonly #className = 'MqttPacketSerializeError';
  /** Creates the error. Pass the underlying error as `options.cause`. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** The packet type is not supported. */
export class UnsupportedPacketError extends Error {
  readonly #className = 'UnsupportedPacketError';
  /** Creates the error for the given packet type. */
  constructor(packetType: string) {
    super(`unsupported packet: ${packetType}`);
  }
}

/** @deprecated Use {@link UnsupportedPacketError} instead. */
export const UnsuportedPacketError: typeof UnsupportedPacketError = UnsupportedPacketError;
/** @deprecated Use {@link UnsupportedPacketError} instead. */
export type UnsuportedPacketError = UnsupportedPacketError;

/** The protocol version is not supported. */
export class InvalidProtocolVersionError extends Error {
  readonly #className = 'InvalidProtocolVersionError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`invalid protocol version: ${message}`);
  }
}

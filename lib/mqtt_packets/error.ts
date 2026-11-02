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
export class UnsuportedPacketError extends Error {
  readonly #className = 'UnsuportedPacketError';
  /** Creates the error for the given packet type. */
  constructor(packetType: string) {
    super(`unsuported packet.  ${packetType}`);
  }
}

/** The protocol version is not supported. */
export class InvalidProtocolVersionError extends Error {
  readonly #className = 'InvalidProtocolVersionError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(`invalid protocol version: ${message}`);
  }
}

import { MqttClientError } from '../error/mod.ts';

/** Received bytes could not be decoded as an MQTT packet. */
export class MqttPacketParseError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'MqttPacketParseError' as const;
  /** Creates the error. Pass the underlying error as `options.cause`. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** A packet could not be encoded to bytes. */
export class MqttPacketSerializeError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'MqttPacketSerializeError' as const;
  /** Creates the error. Pass the underlying error as `options.cause`. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** The packet type is not supported. */
export class UnsupportedPacketError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'UnsupportedPacketError' as const;
  /** Creates the error for the given packet type. Pass the underlying error as `options.cause`. */
  constructor(packetType: string, options?: ErrorOptions) {
    super(`unsupported packet: ${packetType}`, options);
  }
}

/** The protocol version is not supported. */
export class InvalidProtocolVersionError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'InvalidProtocolVersionError' as const;
  /** Creates the error with the given details. Pass the underlying error as `options.cause`. */
  constructor(message: string, options?: ErrorOptions) {
    super(`invalid protocol version: ${message}`, options);
  }
}

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

/**
 * A field of a packet to encode, other than a property, has a value that it cannot have: a packet ID that is not an integer
 * from 1 to 65,535 (from 0 in PUBACK, PUBREC, PUBREL, PUBCOMP, SUBACK and UNSUBACK, which answer the packet ID that the peer
 * sent), a QoS or a Retain Handling other than 0, 1 or 2, a Keep Alive that is not an integer from 0 to 65,535, or a Reason
 * Code (MQTT 5.0) or a return code (MQTT 3.1.1) that the packet cannot carry. See `MqttProperties.InvalidPropertyValueError`
 * for the properties.
 */
export class InvalidFieldValueError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'InvalidFieldValueError' as const;
  /** Creates the error with the given details. Pass the underlying error as `options.cause`. */
  constructor(message: string, options?: ErrorOptions) {
    super(`invalid field value: ${message}`, options);
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

/**
 * The protocol version is not one that this library supports: 4 (MQTT 3.1.1) or 5 (MQTT 5.0). It is the Protocol Level of a
 * received CONNECT, the `protocolVersion` of a CONNECT to encode, or the protocol version given to `packetToBytes()` or
 * `decode()`.
 */
export class InvalidProtocolVersionError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'InvalidProtocolVersionError' as const;
  /** Creates the error with the given details. Pass the underlying error as `options.cause`. */
  constructor(message: string, options?: ErrorOptions) {
    super(`invalid protocol version: ${message}`, options);
  }
}

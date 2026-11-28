import { MqttClientError } from '../error/mod.ts';

export class NumIsOutOfRange extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'NumIsOutOfRange' as const;
  constructor(options?: ErrorOptions) {
    super('num is out of range', options);
  }
}

export class RemainingLengthError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'RemainingLengthError' as const;
  constructor(message: string, options?: ErrorOptions) {
    super(`RemainingLengthError: ${message}`, options);
  }
}

/**
 * A UTF-8 Encoded String breaks the rules of MQTT. A received one is ill-formed UTF-8 or contains U+0000: the packet is a
 * Malformed Packet. One to send contains U+0000 or is longer than 65,535 bytes in UTF-8: the packet cannot be encoded.
 */
export class InvalidUtf8EncodedStringError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'InvalidUtf8EncodedStringError' as const;
  constructor(message: string, options?: ErrorOptions) {
    super(`invalid UTF-8 Encoded String: ${message}`, options);
  }
}

/**
 * A string to send has a lone surrogate, which UTF-8 cannot encode: TextEncoder would put U+FFFD in its place, so the packet
 * would not carry the string that was given. The packet cannot be encoded.
 */
export class UnencodableStringError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'UnencodableStringError' as const;
  constructor(message: string, options?: ErrorOptions) {
    super(`cannot encode the string as UTF-8: ${message}`, options);
  }
}

/**
 * The bytes of a received packet do not fit its structure: a field goes past the end of the packet or of its properties,
 * bytes are left after the last field, a Variable Byte Integer is longer than 4 bytes, or the flags of the fixed header are
 * not the ones that the packet type must have. The packet is a Malformed Packet.
 */
export class MalformedDataError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'MalformedDataError' as const;
  constructor(message: string, options?: ErrorOptions) {
    super(`malformed data: ${message}`, options);
  }
}

/**
 * A received packet can be read, but breaks a rule that makes it a Protocol Error (MQTT 5.0 4.13), e.g. a property that is
 * included more than once. The receiver ends the connection with DISCONNECT and the Reason Code 0x82 (Protocol Error).
 */
export class ProtocolViolationError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'ProtocolViolationError' as const;
  constructor(message: string, options?: ErrorOptions) {
    super(`protocol error: ${message}`, options);
  }
}

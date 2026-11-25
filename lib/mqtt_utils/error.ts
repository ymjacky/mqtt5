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

/** A received UTF-8 Encoded String is ill-formed UTF-8 or contains U+0000: the packet is a Malformed Packet. */
export class InvalidUtf8EncodedStringError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'InvalidUtf8EncodedStringError' as const;
  constructor(message: string, options?: ErrorOptions) {
    super(`invalid UTF-8 Encoded String: ${message}`, options);
  }
}

/**
 * The bytes of a received packet do not fit its structure: a field goes past the end of the packet or of its properties,
 * bytes are left after the last field, or a Variable Byte Integer is longer than 4 bytes. The packet is a Malformed Packet.
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

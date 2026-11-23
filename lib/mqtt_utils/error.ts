export class NumIsOutOfRange extends Error {
  readonly #className = 'NumIsOutOfRange';
  constructor() {
    super('num is out of range');
  }
}

export class RemainingLengthError extends Error {
  readonly #className = 'RemainingLengthError';
  constructor(message: string) {
    super(`RemainingLengthError: ${message}`);
  }
}

/** A received UTF-8 Encoded String is ill-formed UTF-8 or contains U+0000: the packet is a Malformed Packet. */
export class InvalidUtf8EncodedStringError extends Error {
  readonly #className = 'InvalidUtf8EncodedStringError';
  constructor(message: string, options?: ErrorOptions) {
    super(`invalid UTF-8 Encoded String: ${message}`, options);
  }
}

/**
 * The bytes of a received packet do not fit its structure: a field goes past the end of the packet or of its properties,
 * bytes are left after the last field, or a Variable Byte Integer is longer than 4 bytes. The packet is a Malformed Packet.
 */
export class MalformedDataError extends Error {
  readonly #className = 'MalformedDataError';
  constructor(message: string) {
    super(`malformed data: ${message}`);
  }
}

/**
 * A received packet can be read, but breaks a rule that makes it a Protocol Error (MQTT 5.0 4.13), e.g. a property that is
 * included more than once. The receiver ends the connection with DISCONNECT and the Reason Code 0x82 (Protocol Error).
 */
export class ProtocolViolationError extends Error {
  readonly #className = 'ProtocolViolationError';
  constructor(message: string) {
    super(`protocol error: ${message}`);
  }
}

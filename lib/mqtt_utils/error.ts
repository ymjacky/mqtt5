export class NumIsOutOfRange extends Error {
  readonly #className = 'NumIsOutOfRange';
  constructor() {
    super('num is out of range');
  }
}

export class InvalidVariableByteInteger extends Error {
  readonly #className = 'InvalidVariableByteInteger';
  constructor() {
    super('invalid variable byte integer');
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

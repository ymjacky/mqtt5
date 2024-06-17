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

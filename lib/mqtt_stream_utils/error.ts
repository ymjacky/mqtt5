// Everything here is part of the public ClientErrors namespace: lib/client/error.ts re-exports this module.

/** A received packet could not be decoded. */
export class MalformedPacketError extends Error {
  readonly #className = 'MalformedPacketError';
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(message);
  }
}

// Everything here is part of the public ClientErrors namespace: lib/client/error.ts re-exports this module.

/** A received packet could not be decoded. */
export class MalformedPacketError extends Error {
  /** The name of the error class. */
  override readonly name = 'MalformedPacketError' as const;
  /** Creates the error with the given details. */
  constructor(message: string) {
    super(message);
  }
}

// Everything here is part of the public ClientErrors namespace: lib/client/error.ts re-exports this module.

import { MqttClientError } from '../error/mod.ts';

/** A received packet could not be decoded. */
export class MalformedPacketError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'MalformedPacketError' as const;
  /** Creates the error with the given details. Pass the underlying error as `options.cause`. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

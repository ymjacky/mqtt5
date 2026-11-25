// Everything here is part of the public ClientErrors namespace: lib/client/error.ts re-exports this module.

import { MqttClientError } from '../error/mod.ts';

/**
 * All the packet IDs (1 to 65,535) are in use by requests that have not completed: QoS 1 / QoS 2 `publish()`, `subscribe()`
 * and `unsubscribe()`, also those kept in the session to be resent after reconnecting. Rejected by those calls; nothing is
 * sent. Call again after some of the requests have completed.
 */
export class PacketIdsExhaustedError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'PacketIdsExhaustedError' as const;
  /** Creates the error with the given details. Pass the underlying error as `options.cause`. */
  constructor(message: string, options?: ErrorOptions) {
    super(`packet IDs exhausted: ${message}`, options);
  }
}

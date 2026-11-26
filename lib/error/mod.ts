/**
 * This module contains the base class of the errors of this library
 * @module
 */

// Everything here is part of the public ClientErrors namespace: lib/client/error.ts re-exports this module.
// It is below every other module of lib/, so that the errors of each of them can extend it.

/**
 * The base class of every error class of this library, those of `ClientErrors`, `MqttPackets.MqttPacketsError` and
 * `MqttProperties` included. Catch it to handle all of them at once. The errors that do not come from this library are not
 * of this class, e.g. those of opening the connection (`Deno.errors.ConnectionRefused`) or of a session store (Deno KV).
 *
 * `cause` is the error that caused it, when there is one. Browsers without the `cause` of `Error` (ES2022, e.g. Safari before
 * 15) do not set it.
 */
export class MqttClientError extends Error {
  /** The name of the error class. The subclasses set it to their own name. */
  override readonly name: string = 'MqttClientError';
  /** Creates the error. Pass the underlying error as `options.cause`. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

import { MqttClientError } from '../error/mod.ts';

/** The property identifier is not supported. */
export class UnsupportedPropertyError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'UnsupportedPropertyError' as const;
  /** Creates the error for the given property identifier. Pass the underlying error as `options.cause`. */
  constructor(propertyId: number, options?: ErrorOptions) {
    super(`unsupported property. propertyId: ${propertyId}`, options);
  }
}

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

/**
 * A property to encode has a value that it cannot have: an integer property is not an integer, does not fit its type, or has
 * a value that MQTT 5.0 does not allow, e.g. a Receive Maximum of 0 or a Maximum QoS of 2.
 */
export class InvalidPropertyValueError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'InvalidPropertyValueError' as const;
  /** Creates the error with the given details. Pass the underlying error as `options.cause`. */
  constructor(message: string, options?: ErrorOptions) {
    super(`invalid property value: ${message}`, options);
  }
}

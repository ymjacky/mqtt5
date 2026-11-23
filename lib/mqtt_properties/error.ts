/** The property identifier is not supported. */
export class UnsupportedPropertyError extends Error {
  /** Creates the error for the given property identifier. */
  constructor(propertyId: number) {
    super(`unsupported property. propertyId: ${propertyId}`);
  }
}

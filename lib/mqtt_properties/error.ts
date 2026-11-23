/** The property identifier is not supported. */
export class UnsupportedPropertyError extends Error {
  /** The name of the error class. */
  override readonly name = 'UnsupportedPropertyError' as const;
  /** Creates the error for the given property identifier. */
  constructor(propertyId: number) {
    super(`unsupported property. propertyId: ${propertyId}`);
  }
}

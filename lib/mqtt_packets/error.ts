export class MqttPacketParseError extends Error {
  readonly #className = 'MqttPacketParseError';
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class MqttPacketSerializeError extends Error {
  readonly #className = 'MqttPacketSerializeError';
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class UnsuportedPacketError extends Error {
  readonly #className = 'UnsuportedPacketError';
  constructor(packetType: string) {
    super(`unsuported packet.  ${packetType}`);
  }
}

export class InvalidProtocolVersionError extends Error {
  readonly #className = 'InvalidProtocolVersionError';
  constructor(message: string) {
    super(`invalid protocol version: ${message}`);
  }
}

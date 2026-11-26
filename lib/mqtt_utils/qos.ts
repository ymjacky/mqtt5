import type * as Mqtt from '../mqtt/mod.ts';
import { MqttClientError } from '../error/mod.ts';

export class InvalidQoSError extends MqttClientError {
  /** The name of the error class. */
  override readonly name = 'InvalidQoSError' as const;
  constructor(num: number, options?: ErrorOptions) {
    super(`invalid qos: ${num}`, options);
  }
}

export function numToQoS(num: number): Mqtt.QoS {
  if (num === 0 || num === 1 || num === 2) {
    return num as Mqtt.QoS;
  }
  throw new InvalidQoSError(num);
}

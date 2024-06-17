import * as Mqtt from '../mqtt/mod.ts';

export class InvalidQoSError extends Error {
  constructor(num: number) {
    super(`invalid qos: ${num}`);
  }
}

export function numToQoS(num: number) {
  if (num === 0 || num === 1 || num === 2) {
    return num as Mqtt.QoS;
  }
  throw new InvalidQoSError(num);
}

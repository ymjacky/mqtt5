import { MqttPackets } from '../mod.ts';

export interface CustomEventMap {
  'publish': CustomEvent<MqttPackets.PublishPacket>;
  'disconnect': CustomEvent<MqttPackets.DisconnectPacket>;
  'auth': CustomEvent<MqttPackets.AuthPacket>;
  'closed': CustomEvent<void>;
  'error': CustomEvent<Error>;
}

export interface CustomEventListener<T = unknown> {
  (evt: T): void | Promise<void>;
}

export const createCustomEvent = <T extends keyof CustomEventMap>(
  type: T,
  eventInitDict: CustomEventInit<
    CustomEventMap[T] extends CustomEvent<infer T> ? T : never
  >,
) => new CustomEvent(type, eventInitDict);

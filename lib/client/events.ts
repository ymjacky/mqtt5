import type * as MqttPackets from '../mqtt_packets/mod.ts';

/**
 * Events emitted by the clients. Register listeners with `client.on(type, listener)`;
 * `event.detail` holds the received packet.
 */
export interface CustomEventMap {
  /** A message is received. */
  'publish': CustomEvent<MqttPackets.PublishPacket>;
  /** CONNACK is received. Emitted also when the broker rejects the connection; check `reasonCode`. */
  'connack': CustomEvent<MqttPackets.ConnackPacket>;
  /** The broker sends DISCONNECT (MQTT 5.0). */
  'disconnect': CustomEvent<MqttPackets.DisconnectPacket>;
  /** The broker sends AUTH (MQTT 5.0 enhanced authentication). */
  'auth': CustomEvent<MqttPackets.AuthPacket>;
  /** The connection is closed, for any reason. The client does not reconnect automatically. */
  'closed': CustomEvent<void>;
}

/** A listener for an event in {@link CustomEventMap}. */
export interface CustomEventListener<T = unknown> {
  (evt: T): void | Promise<void>;
}

/** The type of `event.detail` of an event in {@link CustomEventMap}. */
type EventDetail<T extends keyof CustomEventMap> = CustomEventMap[T] extends CustomEvent<infer D> ? D : never;

export const createCustomEvent = <T extends keyof CustomEventMap>(
  type: T,
  eventInitDict: CustomEventInit<EventDetail<T>>,
): CustomEvent<EventDetail<T>> => new CustomEvent(type, eventInitDict);

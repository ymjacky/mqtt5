import type * as Mqtt from '../mqtt/mod.ts';
import type * as MqttProperties from '../mqtt_properties/mod.ts';

/** CONNECT packet: the client requests a connection to the broker. */
export type ConnectPacket = {
  type: 'connect';
  clientId: string;
  protocolVersion: Mqtt.ProtocolVersion;
  protocolName?: string;
  username?: string;
  password?: string;
  clean?: boolean;
  keepAlive?: number;
  properties?: MqttProperties.ConnectProperties;
  will?: {
    retain?: boolean;
    qos?: Mqtt.QoS;
    topic: string;
    payload?: Uint8Array;
    properties?: MqttProperties.WillProperties;
  };
};

/** CONNACK packet: the broker acknowledges a connection request. */
export type ConnackPacket = {
  type: 'connack';
  sessionPresent: boolean;
  returnCode?: Mqtt.V3_1_1_ConnectReturnCode;
  reasonCode?: Mqtt.ReasonCode;
  properties?: MqttProperties.ConnackProperties;
};

/**
 * PUBLISH packet: an application message. Narrow it by its `qos`: only QoS 1 and QoS 2 have a `packetId`.
 * @example
 * ```ts
 * import type { MqttPackets } from '@ymjacky/mqtt5';
 *
 * function describe(packet: MqttPackets.PublishPacket): string {
 *   if (packet.qos === 0) {
 *     return `${packet.topic} (QoS 0)`;
 *   }
 *   return `${packet.topic} (QoS ${packet.qos}, packet ID ${packet.packetId})`;
 * }
 * ```
 */
export type PublishPacket = PublishPacketWithoutId | PublishPacketWithId;

/** PUBLISH packet with QoS 0. It has no packet ID: the broker does not acknowledge it. */
export type PublishPacketWithoutId = {
  type: 'publish';
  topic: string;
  payload: Uint8Array;
  dup: boolean;
  retain: boolean;
  /** `Mqtt.QoS.AtMostOnce`. */
  qos: 0;
  /** QoS 0 has no packet ID. */
  packetId?: undefined;
  properties?: MqttProperties.PublishProperties;
};

/** PUBLISH packet with QoS 1 or QoS 2. It has a packet ID, which its acknowledgments carry. */
export type PublishPacketWithId = {
  type: 'publish';
  topic: string;
  payload: Uint8Array;
  dup: boolean;
  retain: boolean;
  /** `Mqtt.QoS.AtLeastOnce` or `Mqtt.QoS.ExactlyOnce`. */
  qos: 1 | 2;
  packetId: number;
  properties?: MqttProperties.PublishProperties;
};

/** PUBACK packet: the response to a QoS 1 PUBLISH. */
export type PubackPacket = {
  type: 'puback';
  packetId: number;
  /**
   * MQTT 5.0: the Reason Code. A received PUBACK without one (Remaining Length 2) has `Mqtt.ReasonCode.Success` (0x00).
   * Not set for MQTT 3.1.1. When sending, 0x00 is used if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.PubackProperties;
};

/** PUBREC packet: the first response to a QoS 2 PUBLISH. */
export type PubrecPacket = {
  type: 'pubrec';
  packetId: number;
  /**
   * MQTT 5.0: the Reason Code. A received PUBREC without one (Remaining Length 2) has `Mqtt.ReasonCode.Success` (0x00).
   * Not set for MQTT 3.1.1. When sending, 0x00 is used if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.PubrecProperties;
};

/** PUBREL packet: the response to PUBREC. */
export type PubrelPacket = {
  type: 'pubrel';
  packetId: number;
  /**
   * MQTT 5.0: the Reason Code. A received PUBREL without one (Remaining Length 2) has `Mqtt.ReasonCode.Success` (0x00).
   * Not set for MQTT 3.1.1. When sending, 0x00 is used if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.PubrelProperties;
};

/** PUBCOMP packet: the response to PUBREL, which completes a QoS 2 publish. */
export type PubcompPacket = {
  type: 'pubcomp';
  packetId: number;
  /**
   * MQTT 5.0: the Reason Code. A received PUBCOMP without one (Remaining Length 2) has `Mqtt.ReasonCode.Success` (0x00).
   * Not set for MQTT 3.1.1. When sending, 0x00 is used if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.PubcompProperties;
};

/** SUBSCRIBE packet: the client subscribes to topic filters. */
export type SubscribePacket = {
  type: 'subscribe';
  packetId: number;
  subscriptions: Subscription[];
  properties?: MqttProperties.SubscribeProperties;
};

/**
 * A topic filter and its subscription options in SUBSCRIBE.
 * `retainHandling`, `retainAsPublished` and `noLocal` are MQTT 5.0 subscription options.
 */
export type Subscription = {
  /** Topic filter, e.g. `sensors/+/temperature`, `logs/#` or `$share/group1/topicA`. */
  topicFilter: string;
  /** Maximum QoS the broker may use to send messages for this subscription. */
  qos: Mqtt.QoS;
  /** Whether retained messages are sent when subscribing. See {@link Mqtt.RetainHandling}. */
  retainHandling?: Mqtt.RetainHandling;
  /** When true, the broker keeps the retain flag of the messages as they were published. */
  retainAsPublished?: boolean;
  /** When true, the broker does not send the client its own messages. Not allowed for a shared subscription. */
  noLocal?: boolean;
};

/** SUBACK packet: the broker acknowledges SUBSCRIBE. */
export type SubackPacket = {
  type: 'suback';
  packetId: number;
  returnCodes?: number[];
  reasonCodes?: number[];
  properties?: MqttProperties.SubackProperties;
};

/** UNSUBSCRIBE packet: the client unsubscribes from topic filters. */
export type UnsubscribePacket = {
  type: 'unsubscribe';
  packetId: number;
  topicFilters: string[];
  properties?: MqttProperties.UnsubscribeProperties;
};

/** UNSUBACK packet: the broker acknowledges UNSUBSCRIBE. */
export type UnsubackPacket = {
  type: 'unsuback';
  packetId: number;
  reasonCodes?: number[];
  properties?: MqttProperties.UnsubackProperties;
};

/** PINGREQ packet: the client checks that the connection is alive. */
export type PingreqPacket = {
  type: 'pingreq';
};

/** PINGRESP packet: the broker responds to PINGREQ. */
export type PingrespPacket = {
  type: 'pingresp';
};

/** DISCONNECT packet: sent before closing the connection. */
export type DisconnectPacket = {
  type: 'disconnect';
  /**
   * MQTT 5.0: the Reason Code. A received DISCONNECT without one (Remaining Length 0) has
   * `Mqtt.ReasonCode.NormalDisconnection` (0x00). Not set for MQTT 3.1.1. When sending, 0x00 is used if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.DisconnectProperties;
};

/** AUTH packet: exchanges authentication data (MQTT 5.0 enhanced authentication). */
export type AuthPacket = {
  type: 'auth';
  /**
   * The Reason Code. A received AUTH without one (Remaining Length 0) has `Mqtt.ReasonCode.Success` (0x00). When sending,
   * 0x00 is used if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.AuthProperties;
};

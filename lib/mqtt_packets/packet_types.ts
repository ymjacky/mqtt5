import type * as Mqtt from '../mqtt/mod.ts';
import type * as MqttProperties from '../mqtt_properties/mod.ts';

/** CONNECT packet: the client requests a connection to the broker. */
export type ConnectPacket = {
  type: 'connect';
  clientId: string;
  protocolVersion: Mqtt.ProtocolVersion;
  protocolName?: string;
  username?: string;
  /**
   * The Password, which is Binary Data. A string is sent as its UTF-8 bytes. A decoded CONNECT always has a Uint8Array: the
   * bytes may not be UTF-8.
   */
  password?: string | Uint8Array;
  clean?: boolean;
  /** The Keep Alive in seconds, an integer from 0 to 65,535. 0 (used if omitted) turns the keep alive off. */
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
  /** MQTT 3.1.1: the return code, 0x00 to 0x05. When sending, 0x00 is used if omitted. */
  returnCode?: Mqtt.V3_1_1_ConnectReturnCode;
  /**
   * MQTT 5.0: the Reason Code, one of the Connect Reason Codes (MQTT 5.0 3.2.2.2), e.g. not 0x8B (Server shutting down), which
   * only DISCONNECT has. When sending, 0x00 is used if omitted.
   */
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
  /** The packet ID, an integer from 1 to 65,535. */
  packetId: number;
  properties?: MqttProperties.PublishProperties;
};

/** PUBACK packet: the response to a QoS 1 PUBLISH. */
export type PubackPacket = {
  type: 'puback';
  /** The packet ID of the PUBLISH that it answers, an integer from 0 to 65,535 (0 only to answer a peer that sent 0). */
  packetId: number;
  /**
   * MQTT 5.0: the Reason Code, one of the PUBACK Reason Codes (MQTT 5.0 3.4.2.1). A received PUBACK without one (Remaining
   * Length 2) has `Mqtt.ReasonCode.Success` (0x00). Not set for MQTT 3.1.1. When sending, 0x00 is used if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.PubackProperties;
};

/** PUBREC packet: the first response to a QoS 2 PUBLISH. */
export type PubrecPacket = {
  type: 'pubrec';
  /** The packet ID of the PUBLISH that it answers, an integer from 0 to 65,535 (0 only to answer a peer that sent 0). */
  packetId: number;
  /**
   * MQTT 5.0: the Reason Code, one of the PUBREC Reason Codes (MQTT 5.0 3.5.2.1). A received PUBREC without one (Remaining
   * Length 2) has `Mqtt.ReasonCode.Success` (0x00). Not set for MQTT 3.1.1. When sending, 0x00 is used if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.PubrecProperties;
};

/** PUBREL packet: the response to PUBREC. */
export type PubrelPacket = {
  type: 'pubrel';
  /** The packet ID of the PUBLISH flow that it answers, an integer from 0 to 65,535 (0 only to answer a peer that sent 0). */
  packetId: number;
  /**
   * MQTT 5.0: the Reason Code, one of the PUBREL Reason Codes (MQTT 5.0 3.6.2.1). A received PUBREL without one (Remaining
   * Length 2) has `Mqtt.ReasonCode.Success` (0x00). Not set for MQTT 3.1.1. When sending, 0x00 is used if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.PubrelProperties;
};

/** PUBCOMP packet: the response to PUBREL, which completes a QoS 2 publish. */
export type PubcompPacket = {
  type: 'pubcomp';
  /** The packet ID of the PUBLISH flow that it answers, an integer from 0 to 65,535 (0 only to answer a peer that sent 0). */
  packetId: number;
  /**
   * MQTT 5.0: the Reason Code, one of the PUBCOMP Reason Codes (MQTT 5.0 3.7.2.1). A received PUBCOMP without one (Remaining
   * Length 2) has `Mqtt.ReasonCode.Success` (0x00). Not set for MQTT 3.1.1. When sending, 0x00 is used if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.PubcompProperties;
};

/** SUBSCRIBE packet: the client subscribes to topic filters. */
export type SubscribePacket = {
  type: 'subscribe';
  /** The packet ID, an integer from 1 to 65,535. */
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
  /** Maximum QoS the broker may use to send messages for this subscription: 0, 1 or 2. */
  qos: Mqtt.QoS;
  /** Whether retained messages are sent when subscribing: 0 (used if omitted), 1 or 2. See {@link Mqtt.RetainHandling}. */
  retainHandling?: Mqtt.RetainHandling;
  /** When true, the broker keeps the retain flag of the messages as they were published. */
  retainAsPublished?: boolean;
  /** When true, the broker does not send the client its own messages. Not allowed for a shared subscription. */
  noLocal?: boolean;
};

/** SUBACK packet: the broker acknowledges SUBSCRIBE. */
export type SubackPacket = {
  type: 'suback';
  /** The packet ID of the SUBSCRIBE that it answers, an integer from 0 to 65,535 (0 only to answer a peer that sent 0). */
  packetId: number;
  /** MQTT 3.1.1: a return code for each topic filter of SUBSCRIBE: 0x00, 0x01, 0x02 or 0x80 (Failure). */
  returnCodes?: number[];
  /** MQTT 5.0: a Reason Code for each topic filter of SUBSCRIBE, one of the Subscribe Reason Codes (MQTT 5.0 3.9.3). */
  reasonCodes?: number[];
  properties?: MqttProperties.SubackProperties;
};

/** UNSUBSCRIBE packet: the client unsubscribes from topic filters. */
export type UnsubscribePacket = {
  type: 'unsubscribe';
  /** The packet ID, an integer from 1 to 65,535. */
  packetId: number;
  topicFilters: string[];
  properties?: MqttProperties.UnsubscribeProperties;
};

/** UNSUBACK packet: the broker acknowledges UNSUBSCRIBE. */
export type UnsubackPacket = {
  type: 'unsuback';
  /** The packet ID of the UNSUBSCRIBE that it answers, an integer from 0 to 65,535 (0 only to answer a peer that sent 0). */
  packetId: number;
  /** MQTT 5.0: a Reason Code for each topic filter of UNSUBSCRIBE, one of the Unsubscribe Reason Codes (MQTT 5.0 3.11.3). */
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
   * MQTT 5.0: the Reason Code, one of the DISCONNECT Reason Codes (MQTT 5.0 3.14.2.1). A received DISCONNECT without one
   * (Remaining Length 0) has `Mqtt.ReasonCode.NormalDisconnection` (0x00). Not set for MQTT 3.1.1. When sending, 0x00 is used
   * if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.DisconnectProperties;
};

/** AUTH packet: exchanges authentication data (MQTT 5.0 enhanced authentication). */
export type AuthPacket = {
  type: 'auth';
  /**
   * The Reason Code: 0x00 (Success), 0x18 (Continue authentication) or 0x19 (Re-authenticate). A received AUTH without one
   * (Remaining Length 0) has `Mqtt.ReasonCode.Success` (0x00). When sending, 0x00 is used if omitted.
   */
  reasonCode?: number;
  properties?: MqttProperties.AuthProperties;
};

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

/** PUBLISH packet: an application message. */
export type PublishPacket = {
  type: 'publish';
  topic: string;
  payload: Uint8Array;
  dup: boolean;
  retain: boolean;
  qos: Mqtt.QoS;
  packetId?: number;
  properties?: MqttProperties.PublishProperties;
};

/** PUBACK packet: the response to a QoS 1 PUBLISH. */
export type PubackPacket = {
  type: 'puback';
  packetId: number;
  reasonCode?: number;
  properties?: MqttProperties.PubackProperties;
};

/** PUBREC packet: the first response to a QoS 2 PUBLISH. */
export type PubrecPacket = {
  type: 'pubrec';
  packetId: number;
  reasonCode?: number;
  properties?: MqttProperties.PubrecProperties;
};

/** PUBREL packet: the response to PUBREC. */
export type PubrelPacket = {
  type: 'pubrel';
  packetId: number;
  reasonCode?: number;
  properties?: MqttProperties.PubrelProperties;
};

/** PUBCOMP packet: the response to PUBREL, which completes a QoS 2 publish. */
export type PubcompPacket = {
  type: 'pubcomp';
  packetId: number;
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

/** A topic filter and its subscription options in SUBSCRIBE. */
export type Subscription = {
  topicFilter: string;
  qos: Mqtt.QoS;
  retainHandling?: Mqtt.RetainHandling;
  retainAsPublished?: boolean;
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
  reasonCode?: number;
  properties?: MqttProperties.DisconnectProperties;
};

/** AUTH packet: exchanges authentication data (MQTT 5.0 enhanced authentication). */
export type AuthPacket = {
  type: 'auth';
  reasonCode?: number;
  properties?: MqttProperties.AuthProperties;
};

/**
 * This module contains the option and result types of the clients
 * @module
 */

import type * as Mqtt from '../mqtt/mod.ts';
import type * as MqttProperties from '../mqtt_properties/mod.ts';
import type { IncomingStore, OutgoingStore } from '../mqtt_store/mod.ts';
import type { Subscription } from '../mqtt_packets/mod.ts';

/**
 * Options for the {@link MqttClient} and {@link WebSocketMqttClient} constructors. All options are optional,
 * except that `WebSocketMqttClient` requires `url`.
 */
export type ClientOptions = {
  /**
   * Broker URL. `MqttClient`: `mqtt:` or `mqtts:`. `WebSocketMqttClient`: `ws:` or `wss:` (required).
   * Without a port, the default port of the protocol is used: 1883 (`mqtt:`), 8883 (`mqtts:`), 80 (`ws:`) or 443 (`wss:`).
   * @default {new URL('mqtt://127.0.0.1:1883')}
   */
  url?: URL;
  /**
   * Client identifier. With an empty ID, an MQTT 5.0 broker assigns one.
   * It is a UTF-8 Encoded String: at most 65,535 bytes in UTF-8, without U+0000 or a lone surrogate. Another value makes the
   * constructor throw `InvalidArgumentError`.
   * @default {''}
   */
  clientId?: string;
  /**
   * Clean Start (MQTT 5.0) / Clean Session (MQTT 3.1.1). Can be overridden by {@link ConnectOptions.clean}.
   * @default {true}
   */
  clean?: boolean;
  /**
   * Keep alive interval in seconds: an integer from 0 to 65,535. 0 disables keep alive (no PINGREQ is sent).
   * If the broker's CONNACK has a Server Keep Alive (MQTT 5.0), that value is used for the connection instead.
   * Another value makes the constructor throw `InvalidArgumentError`.
   * @default {10}
   */
  keepAlive?: number;
  /**
   * User name sent in CONNECT. It is a UTF-8 Encoded String: at most 65,535 bytes in UTF-8, without U+0000 or a lone
   * surrogate. Another value makes the constructor throw `InvalidArgumentError`.
   */
  username?: string;
  /**
   * Password sent in CONNECT. It is Binary Data of at most 65,535 bytes: a Uint8Array is sent as it is, and a string as its
   * UTF-8 bytes (U+0000 is allowed, a lone surrogate is not). Another value makes the constructor throw `InvalidArgumentError`.
   * The client keeps a copy of a Uint8Array, which it sends on every connection.
   */
  password?: string | Uint8Array;
  /**
   * Time to wait for CONNACK, in milliseconds. A value that is not positive uses the default.
   * @default {10000}
   */
  connectTimeoutMS?: number;
  /**
   * Time to wait for the connection to close after sending DISCONNECT, in milliseconds. A value that is not positive uses the default.
   * @default {1000}
   */
  disconnectTimeoutMS?: number;
  /**
   * MQTT protocol version: `Mqtt.ProtocolVersion.MqttV5` or `Mqtt.ProtocolVersion.MqttV3_1_1`.
   * @default {Mqtt.ProtocolVersion.MqttV5}
   */
  protocolVersion?: Mqtt.ProtocolVersion;
  incomingStore?: IncomingStore;
  /**
   * The store of the QoS 1 and QoS 2 messages in flight, which are resent after reconnecting.
   * By default they are kept in memory and lost when the process exits; `KvOutgoingStore` keeps them in Deno KV,
   * and requires `clientId`.
   */
  outgoingStore?: OutgoingStore;
  /** Called with debug logs. */
  logger?: (msg: string, ...args: unknown[]) => void;
  /**
   * CA certificates (PEM) to trust in addition to the default root certificates, for `mqtts:`.
   * `MqttClient` only; ignored by `WebSocketMqttClient`.
   * @example
   * ```ts ignore
   * ['-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n']
   * ```
   */
  caCerts?: string[];
  /**
   * Client certificate (PEM) for TLS client authentication. Used together with {@link ClientOptions.privateKey}.
   * `MqttClient` only; ignored by `WebSocketMqttClient`.
   */
  cert?: string;
  /**
   * Private key (PEM) of the client certificate for TLS client authentication. Used together with {@link ClientOptions.cert}.
   * `MqttClient` only; ignored by `WebSocketMqttClient`.
   */
  privateKey?: string;
  /**
   * Time to wait for PINGRESP, in milliseconds. A value that is not positive uses the default.
   * @default {2000}
   */
  pingrespTimeoutMS?: number;
  /**
   * MQTT 5.0 only. When set, topic aliases are assigned to outgoing PUBLISH packets automatically,
   * up to the smaller of this value and the broker's Topic Alias Maximum.
   * If the broker's CONNACK has no Topic Alias Maximum (or it is 0), no topic aliases are sent.
   * An integer from 0 to 65,535 (0 sends no topic aliases); another value makes the constructor throw `InvalidArgumentError`.
   */
  topicAliasMaximumAboutSend?: number;
  /**
   * MQTT 5.0 only. When set, it is sent to the broker as the Topic Alias Maximum property of CONNECT,
   * and topic aliases in incoming PUBLISH packets are resolved automatically.
   * A PUBLISH with a topic alias that is 0 or greater than the Topic Alias Maximum sent in CONNECT (any topic alias when it
   * was not sent) ends the connection with DISCONNECT 0x94 (Topic Alias invalid).
   * An integer from 0 to 65,535 (0 accepts no topic aliases); another value makes the constructor throw `InvalidArgumentError`.
   */
  topicAliasMaximumAboutReceive?: number;
};

/** Options for {@link MqttClient.connect} / {@link WebSocketMqttClient.connect}. */
export type ConnectOptions = {
  /** Clean Start (MQTT 5.0) / Clean Session (MQTT 3.1.1). Overrides {@link ClientOptions.clean}. */
  clean?: boolean;
  /** MQTT 5.0 CONNECT properties. They are kept and sent again on reconnect. */
  properties?: MqttProperties.ConnectProperties;
  /** Will message, published by the broker when the connection is closed without a DISCONNECT. */
  will?: {
    /** Retain flag of the will message. */
    retain?: boolean;
    /** QoS of the will message. */
    qos?: Mqtt.QoS;
    /** Topic of the will message. */
    topic: string;
    /** Payload of the will message. */
    payload?: Uint8Array;
    /** MQTT 5.0 will properties. */
    properties?: MqttProperties.WillProperties;
  };
};

/** Options for {@link MqttClient.publish} / {@link WebSocketMqttClient.publish}. */
export type PublishOptions = {
  /**
   * DUP flag. Must be false for QoS 0 ([MQTT-3.3.1-2]).
   * @default {false}
   */
  dup?: boolean;
  /**
   * QoS level.
   * @default {Mqtt.QoS.AtMostOnce}
   */
  qos?: Mqtt.QoS;
  /**
   * Retain flag.
   * @default {false}
   */
  retain?: boolean;
};

/**
 * A topic filter with its subscription options, passed to {@link MqttClient.subscribe} / {@link WebSocketMqttClient.subscribe}.
 * It is the same type as {@link MqttPackets.Subscription}, which describes each field.
 */
export type SubscriptionOption = Subscription;

/** Result of {@link MqttClient.publish} / {@link WebSocketMqttClient.publish}. */
export type PublishResult = {
  /**
   * Reason code. `Mqtt.ReasonCode.Success` (0) on success, or the reason code of PUBACK / PUBREC / PUBCOMP
   * when the broker reports a failure.
   */
  result: number;
  /** MQTT 5.0: the Reason String property sent by the broker, if any. */
  reason?: string;
};

/** Result of {@link MqttClient.subscribe} / {@link WebSocketMqttClient.subscribe}. */
export type SubscribeResults = {
  /**
   * Reason codes (MQTT 5.0) or return codes (MQTT 3.1.1) of SUBACK, one per subscription in the order they were requested.
   * A value of 0, 1 or 2 is the granted QoS; 128 (0x80) or more is a failure.
   */
  reasons: number[];
  /** MQTT 5.0: the Reason String property sent by the broker, if any. */
  reason?: string;
};

/** Result of {@link MqttClient.unsubscribe} / {@link WebSocketMqttClient.unsubscribe}. */
export type UnsubscribeResults = {
  /** MQTT 5.0: reason codes of UNSUBACK, one per topic filter in the order they were requested. Not set for MQTT 3.1.1. */
  reasonCodes?: number[];
  /** MQTT 5.0: the Reason String property sent by the broker, if any. */
  reason?: string;
};

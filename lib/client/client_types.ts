import { Mqtt, MqttProperties } from '../mod.ts';
import { IncomingStore, OutgoingStore } from '../mqtt_store/mod.ts';
import { Subscription } from '../mqtt_packets/mod.ts';

/**
 * Options for the {@link MqttClient} and {@link WebSocketMqttClient} constructors. All options are optional,
 * except that `WebSocketMqttClient` requires `url`.
 */
export type ClientOptions = {
  /**
   * Broker URL. `MqttClient`: `mqtt:` or `mqtts:`. `WebSocketMqttClient`: `ws:` or `wss:` (required).
   * @default {new URL('mqtt://127.0.0.1:1883')}
   */
  url?: URL;
  /**
   * Client identifier. With an empty ID, an MQTT 5.0 broker assigns one.
   * @default {''}
   */
  clientId?: string;
  /**
   * Clean Start (MQTT 5.0) / Clean Session (MQTT 3.1.1). Can be overridden by {@link ConnectOptions.clean}.
   * @default {true}
   */
  clean?: boolean;
  /**
   * Keep alive interval in seconds.
   * @default {10}
   */
  keepAlive?: number;
  /** User name sent in CONNECT. */
  username?: string;
  /** Password sent in CONNECT. */
  password?: string;
  /**
   * Time to wait for CONNACK, in milliseconds.
   * @default {10000}
   */
  connectTimeoutMS?: number;
  /**
   * Time to wait for the connection to close after sending DISCONNECT, in milliseconds.
   * @default {1000}
   */
  disconnectTimeoutMS?: number;
  /**
   * MQTT protocol version: `Mqtt.ProtocolVersion.MQTT_V5` or `Mqtt.ProtocolVersion.MQTT_V3_1_1`.
   * @default {Mqtt.ProtocolVersion.MQTT_V5}
   */
  protocolVersion?: Mqtt.ProtocolVersion;
  incomingStore?: IncomingStore;
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
   * Time to wait for PINGRESP, in milliseconds.
   * @default {2000}
   */
  pingrespTimeoutMS?: number;
  /**
   * MQTT 5.0 only. When set, topic aliases are assigned to outgoing PUBLISH packets automatically,
   * up to the smaller of this value and the broker's Topic Alias Maximum.
   */
  topicAliasMaximumAboutSend?: number;
  /**
   * MQTT 5.0 only. When set, it is sent to the broker as the Topic Alias Maximum property of CONNECT,
   * and topic aliases in incoming PUBLISH packets are resolved automatically.
   */
  topicAliasMaximumAboutReceive?: number;
};

/** Options for {@link MqttClient.connect} / {@link WebSocketMqttClient.connect}. */
export type ConnectOptions = {
  /** Clean Start (MQTT 5.0) / Clean Session (MQTT 3.1.1). Overrides {@link ClientOptions.clean}. */
  clean?: boolean;
  /** MQTT 5.0 CONNECT properties. They are kept and sent again on reconnect. */
  properties?: MqttProperties.Properties;
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
   * DUP flag.
   * @default {false}
   */
  dup?: boolean;
  /**
   * QoS level.
   * @default {Mqtt.QoS.AT_MOST_ONCE}
   */
  qos?: Mqtt.QoS;
  /**
   * Retain flag.
   * @default {false}
   */
  retain?: boolean;
};

/** A subscription with options, passed to {@link MqttClient.subscribe} / {@link WebSocketMqttClient.subscribe}. */
export type SubscriptionOption = Subscription;

/** Writes bytes to the connection. Used internally by the clients. */
export type WriterFunction = (bytes: Uint8Array) => Promise<void>;
/** Creates a {@link WriterFunction}. Used internally by the clients. */
// deno-lint-ignore no-explicit-any
export type WriterFactory = (...args: any[]) => WriterFunction;

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

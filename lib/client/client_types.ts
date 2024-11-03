import { Mqtt, MqttProperties } from '../mod.ts';
import { IncomingStore, OutgoingStore } from './store.ts';
import { Subscription } from '../mqtt_packets/mod.ts';

export type ClientOptions = {
  url?: URL;
  clientId?: string;
  clean?: boolean;
  keepAlive?: number;
  username?: string;
  password?: string;
  connectTimeoutMS?: number;
  disconnectTimeoutMS?: number;
  protocolVersion?: Mqtt.ProtocolVersion;
  incomingStore?: IncomingStore;
  outgoingStore?: OutgoingStore;
  logger?: (msg: string, ...args: unknown[]) => void;
  caCerts?: string[];
  cert?: string;
  privateKey?: string;
  pingrespTimeoutMS?: number;
  topicAliasMaximumAboutSend?: number;
  topicAliasMaximumAboutReceive?: number;
};

export type ConnectOptions = {
  clean?: boolean;
  properties?: MqttProperties.Properties;
  will?: {
    retain?: boolean;
    qos?: Mqtt.QoS;
    topic: string;
    payload?: Uint8Array;
    properties?: MqttProperties.WillProperties;
  };
};
export type PublishOptions = {
  dup?: boolean;
  qos?: Mqtt.QoS;
  retain?: boolean;
};

export type SubscriptionOption = Subscription;

export type WriterFunction = (bytes: Uint8Array) => Promise<void>;
// deno-lint-ignore no-explicit-any
export type WriterFactory = (...args: any[]) => WriterFunction;

export type PublishResult = {
  result: number;
  reason?: string;
};

export type SubscribeResults = {
  reasons: number[];
  reason?: string;
};

export type UnsubscribeResults = {
  reasonCodes?: number[];
  reason?: string;
};

import { Mqtt, MqttPackets, MqttProperties } from '../mod.ts';
import { Session } from './session.ts';
import { TopicAliasManager } from './topic_alias.ts';
import { ClientOptions, ConnectOptions, PublishOptions, PublishResult, SubscribeResults, SubscriptionOption, UnsubscribeResults } from './client_types.ts';
import { ConnectTimeout, MalformedPacketError, SendPacketError, StateIsNotOfflineError, StateIsNotOnlineError } from './error.ts';
import { Deferred } from './promise.ts';
import { IncomingMemoryStore, IncomingStore } from '../mqtt_store/mod.ts';
import { createCustomEvent, CustomEventListener, CustomEventMap } from './events.ts';

import {
  type AnyPacket,
  type AuthPacket,
  type ConnackPacket,
  type DisconnectPacket,
  type PingrespPacket,
  type PubackPacket,
  type PubcompPacket,
  type PublishPacket,
  type PubrecPacket,
  type PubrelPacket,
  type SubackPacket,
  type SubscribePacket,
  type UnsubackPacket,
  type UnsubscribePacket,
} from '../mqtt_packets/mod.ts';

type ConnectionStates =
  | 'offline'
  | 'connecting'
  | 'online';

const defaultKeepAlive = 10; // 10 sec
const defaultConnectTimeout = 10 * 1000;
const defaultDisconnectTimeout = 1 * 1000;
const defaultPingrespTimeout = 2 * 1000;

/** Returns `value` if it is a positive number, otherwise `defaultValue`. */
function positiveOrDefault(value: number | undefined, defaultValue: number): number {
  return value !== undefined && value > 0 ? value : defaultValue;
}

/**
 * The API shared by {@link MqttClient} and {@link WebSocketMqttClient}: connecting, publishing, subscribing and events.
 *
 * It is exported as a type only, e.g. to write a function that accepts either client.
 * It is not meant to be subclassed; its protected members may change without notice.
 *
 * @example
 * ```ts
 * import { type BaseMqttClient, Mqtt } from '@ymjacky/mqtt5';
 *
 * async function subscribeAll(client: BaseMqttClient, topics: string[]) {
 *   await client.subscribe(topics, Mqtt.QoS.AT_LEAST_ONCE);
 * }
 * ```
 */
export abstract class BaseMqttClient {
  /** The URL of the broker to connect to. */
  protected url: URL;
  private userName?: string;
  private password?: string;
  private clientId: string;
  // Keep Alive sent in CONNECT.
  private keepAlive: number;
  // Keep Alive used for the current connection: the Server Keep Alive in CONNACK if present, otherwise keepAlive.
  private currentKeepAlive: number;
  /** The MQTT protocol version used for the connection. */
  protected protocolVersion: Mqtt.ProtocolVersion;
  private clean: boolean;
  private connectTimeout: number;
  private disconnectTimeout: number;
  private connectionState: ConnectionStates;
  private session: Session;
  private unresolvedConnect?: Deferred<ConnackPacket>;
  private incomingStore: IncomingStore;
  // Tail of the chain that runs received packet handlers one at a time.
  private packetHandling: Promise<void> = Promise.resolve();
  private timers: { [key: string]: ReturnType<typeof setTimeout> };
  /** Logger given by the `logger` option; does nothing by default. */
  protected log: (msg: string, ...args: unknown[]) => void;
  /**
   * ca certificate.
   * @example
   * ```
   * ["-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"]
   * ```
   */
  protected caCerts?: string[];
  /**
   * client certificate.
   * @example
   * ```
   * "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
   * ```
   */
  protected cert?: string;
  /**
   * client private key.
   * @example
   * ```
   * "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
   * ```
   */
  protected privateKey?: string;

  private connectProperties?: MqttProperties.ConnectProperties;

  /** Dispatches the client events registered with `on()`. */
  protected eventTarget: EventTarget;
  private pingrespTimeoutMs: number;
  private topicAliasMaximumAboutSend?: number;
  private topicAliasManagerAboutSend?: TopicAliasManager;
  private topicAliasMaximumAboutReceive?: number;
  private topicAliasMapAboutReceive: Map<number, string>;
  private waitForClose?: Deferred<void>;

  /** Creates a client. Use {@link MqttClient} or {@link WebSocketMqttClient}. */
  constructor(options?: ClientOptions) {
    this.url = options?.url || new URL('mqtt://127.0.0.1:1883');
    this.log = options?.logger || (() => {});
    this.userName = options?.username;
    this.password = options?.password;
    this.clientId = options?.clientId || '';
    this.keepAlive = options?.keepAlive === undefined ? defaultKeepAlive : Math.max(options.keepAlive, 0);
    this.currentKeepAlive = this.keepAlive;
    this.protocolVersion = options?.protocolVersion || Mqtt.ProtocolVersion.MQTT_V5;
    this.clean = (() => {
      if (options) {
        return (typeof options.clean === 'undefined') ? true : options.clean;
      }
      return true;
    })();
    this.connectTimeout = positiveOrDefault(options?.connectTimeoutMS, defaultConnectTimeout);
    this.disconnectTimeout = positiveOrDefault(options?.disconnectTimeoutMS, defaultDisconnectTimeout);

    this.connectionState = 'offline';
    this.incomingStore = options?.incomingStore || new IncomingMemoryStore();

    if (this.clean) {
      this.session = new Session(this.clientId);
    } else {
      this.session = new Session(this.clientId, options?.outgoingStore);
    }

    this.caCerts = options?.caCerts;
    this.cert = options?.cert;
    this.privateKey = options?.privateKey;

    this.eventTarget = new EventTarget();
    this.pingrespTimeoutMs = positiveOrDefault(options?.pingrespTimeoutMS, defaultPingrespTimeout);
    this.timers = {};

    if (this.protocolVersion == Mqtt.ProtocolVersion.MQTT_V5 && options?.topicAliasMaximumAboutSend) {
      this.topicAliasMaximumAboutSend = options.topicAliasMaximumAboutSend;
    }

    if (this.protocolVersion == Mqtt.ProtocolVersion.MQTT_V5 && options?.topicAliasMaximumAboutReceive) {
      this.topicAliasMaximumAboutReceive = options.topicAliasMaximumAboutReceive;
    }
    this.topicAliasMapAboutReceive = new Map<number, string>();
  }

  /** Encodes and sends a packet, and restarts the keep alive timer. */
  private async sendPacket(packet: AnyPacket) {
    try {
      if (this.connectionState === 'offline') {
        this.log(`can't send packet because offline.`, packet);
        throw new SendPacketError();
      }

      this.log(`sending ${packet.type} packet`, packet);
      const bytes = MqttPackets.packetToBytes(packet, this.protocolVersion);
      this.startKeepAliveTimer();
      await this.write(bytes);
    } catch (err) {
      this.log('sendPacket: ', err);
      throw err;
    }
  }

  /**
   * Send a packet without waiting for completion, e.g. a response to a
   * received packet. A send failure (e.g. the peer has closed the connection)
   * is only logged by sendPacket(); the closed connection itself is detected
   * by the receive side.
   */
  private sendPacketInBackground(packet: AnyPacket) {
    this.sendPacket(packet).catch(() => {
      // already logged in sendPacket()
    });
  }

  /** Opens the transport connection to the broker. */
  protected abstract open(): Promise<void>;

  /**
   * Connects to the broker: opens the connection, sends CONNECT and waits for CONNACK.
   *
   * The returned promise resolves with the CONNACK packet even when the broker rejects the connection,
   * so check its `reasonCode` (MQTT 5.0) / `returnCode` (MQTT 3.1.1).
   * After the client is closed, it can connect again with this method; it does not reconnect automatically.
   *
   * @param options CONNECT options: clean start, MQTT 5.0 properties and will message.
   * @returns the received CONNACK packet.
   * @throws {StateIsNotOfflineError} if the client is already connected or connecting.
   * @throws {ConnectTimeout} if CONNACK is not received within `connectTimeoutMS`.
   * @example
   * mqtt
   * ```ts
   * import { MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   * await client.connect();
   * ```
   *
   * using properties
   * ```ts
   * import { MqttClient, MqttProperties } from '@ymjacky/mqtt5';
   *
   * const properties: MqttProperties.ConnectProperties = {
   *   sessionExpiryInterval: 300,
   *   receiveMaximum: 10,
   *   maximumPacketSize: 128,
   *   topicAliasMaximum: 20,
   *   requestResponseInformation: false,
   *   requestProblemInformation: false,
   *   userProperties: [
   *     { key: 'userProp1', val: 'userData1' },
   *     { key: 'userProp2', val: 'userData2' },
   *     { key: 'userProp2', val: 'userData3' },
   *   ],
   * };
   * const client = new MqttClient();
   * await client.connect({ properties });
   * ```
   *
   * using will
   * ```ts
   * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   * const willPayload = new TextEncoder().encode('will message');
   * await client.connect({
   *   will: {
   *     topic: 'topicA',
   *     qos: Mqtt.QoS.AT_LEAST_ONCE,
   *     payload: willPayload,
   *     properties: { userProperties: [{ key: 'userProp1', val: 'userData1' }] },
   *   },
   * });
   * ```
   */
  public async connect(
    options?: ConnectOptions,
  ): Promise<ConnackPacket> {
    if (this.connectionState != 'offline') {
      return Promise.reject(
        new StateIsNotOfflineError('connect'),
      );
    }

    if (options) {
      if (typeof options.clean !== 'undefined') {
        this.clean = options.clean;
      }
      if (options.properties) {
        // save properties for reconnect
        this.connectProperties = options.properties;
      }
    }

    if (this.topicAliasMaximumAboutReceive) {
      // Tell the broker that you can receive topic alias
      if (this.connectProperties) {
        this.connectProperties.topicAliasMaximum = this.topicAliasMaximumAboutReceive;
      } else {
        this.connectProperties = { topicAliasMaximum: this.topicAliasMaximumAboutReceive };
      }
    }

    this.connectionState = 'connecting';

    const deferred = new Deferred<ConnackPacket>();
    this.unresolvedConnect = deferred;

    try {
      this.startConnectTimer();
      this.log(`opening connection to ${this.url}`);
      await this.open();

      const connectPacket: AnyPacket = {
        type: 'connect',
        clientId: this.clientId,
        username: this.userName,
        password: this.password,
        protocolVersion: this.protocolVersion,
        clean: this.clean,
        keepAlive: this.keepAlive,
        properties: this.connectProperties,
        will: options?.will,
      };

      this.log(`sending ${connectPacket.type} packet`, connectPacket);
      const bytes = MqttPackets.packetToBytes(connectPacket, this.protocolVersion);
      await this.write(bytes);
    } catch (err) {
      const e = err instanceof Error ? err : err as Error;
      this.log(`caught error opening connection: ${e.message}`);

      this.detectClosed();
      if (this.unresolvedConnect) {
        this.unresolvedConnect.reject(e);
      }
    }

    return deferred.promise;
  }

  /**
   * Returns the number of sent QoS 1 / QoS 2 PUBLISH messages whose acknowledgment flow has not completed yet.
   */
  public async publishInflightCount(): Promise<number> {
    return await this.session.publishInflightCount();
  }

  /**
   * Publishes a message.
   *
   * The returned promise resolves when the flow for the QoS level completes: right after sending for QoS 0,
   * on PUBACK for QoS 1, and on PUBCOMP for QoS 2. A failure reported by the broker resolves with its reason code
   * in {@link PublishResult.result} instead of rejecting.
   *
   * @param topic topic name
   * @param payload payload. A string is encoded as UTF-8.
   * @param options QoS, retain and DUP flags. QoS defaults to `Mqtt.QoS.AT_MOST_ONCE`.
   * @param properties MQTT 5.0 PUBLISH properties.
   * @returns the result of the publish flow.
   * @throws {StateIsNotOnlineError} if the client is not connected.
   * @example
   * ```ts
   * import { Mqtt, MqttClient, MqttProperties } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_MOST_ONCE });
   * await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_LEAST_ONCE });
   * await client.publish('topicA', 'payload', { qos: Mqtt.QoS.EXACTLY_ONCE });
   * await client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTLY_ONCE });
   * await client.publish('topicA', 'payloadA', { qos: Mqtt.QoS.AT_LEAST_ONCE, dup: true, retain: true });
   *
   * const pubProperties: MqttProperties.UserPublishProperties = {
   *   payloadFormatIndicator: 1,
   *   messageExpiryInterval: 60,
   *   responseTopic: 'responseTopicA',
   *   correlationData: new TextEncoder().encode('correlationDataA'),
   *   userProperties: [
   *     { key: 'userProp1', val: 'userData1' },
   *     { key: 'userProp2', val: 'userData2' },
   *     { key: 'userProp2', val: 'userData3' },
   *   ],
   *   subscriptionIdentifier: 3,
   *   contentType: 'application/json',
   * };
   * await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_MOST_ONCE }, pubProperties);
   * ```
   */
  public async publish(
    topic: string,
    payload: string | Uint8Array,
    options?: PublishOptions,
    properties?: MqttProperties.UserPublishProperties,
  ): Promise<PublishResult> {
    if (this.connectionState !== 'online') {
      throw new StateIsNotOnlineError('publish');
    }

    const dup = (options && options.dup) || false;
    const qos = (options && options.qos) || 0;
    const retain = (options && options.retain) || false;

    const deferred = new Deferred<PublishResult>();

    const buffer: Uint8Array = (typeof payload === 'string') ? new TextEncoder().encode(payload) : payload;

    // resolve topic alias
    let omittedTopic;
    let topicId: number = 0; // 0 = not use
    if (this.topicAliasManagerAboutSend) {
      const [generated, tid] = await this.topicAliasManagerAboutSend.getTopicId(topic);
      if (!generated) {
        omittedTopic = topic;
        topic = '';
      }
      topicId = tid;
    }

    // Set the topic alias on a copy: the caller's object may be shared by other publishes, possibly running concurrently.
    const publishProperties: MqttProperties.PublishProperties | undefined = (properties || topicId)
      ? { ...properties, ...(topicId > 0 && { topicAlias: topicId }) }
      : undefined;

    if (qos === Mqtt.QoS.AT_MOST_ONCE) {
      const packet: PublishPacket = {
        type: 'publish',
        topic,
        payload: buffer,
        dup,
        retain,
        qos,
        packetId: 0,
        properties: publishProperties,
      };
      await this.sendPacket(packet);
      deferred.resolve({ result: 0, reason: '' });
    } else {
      const packetId = await this.session.acquirePacketId();
      const packet: PublishPacket = {
        type: 'publish',
        topic,
        payload: buffer,
        dup,
        retain,
        qos,
        packetId,
        properties: publishProperties,
      };
      await this.session.storePublish(packet, deferred, omittedTopic);
      await this.sendPacket(packet);
    }

    return deferred.promise;
  }

  /**
   * Subscribes to a topic filter and waits for SUBACK.
   * @param topicFilter topic name or topic filter
   * @param qos QoS level. Defaults to `Mqtt.QoS.AT_MOST_ONCE`.
   * @param properties MQTT 5.0 SUBSCRIBE properties.
   * @returns the reason codes of SUBACK.
   * @example
   * ```ts
   * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.subscribe('topicA', Mqtt.QoS.AT_MOST_ONCE);
   * ```
   */
  public async subscribe(
    topicFilter: string,
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults>;

  /**
   * Subscribes to multiple topic filters with one SUBSCRIBE packet and waits for SUBACK.
   * @param topicFilters topic names or topic filters
   * @param qos QoS level. Defaults to `Mqtt.QoS.AT_MOST_ONCE`.
   * @param properties MQTT 5.0 SUBSCRIBE properties.
   * @returns the reason codes of SUBACK.
   * @example
   * ```ts
   * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.subscribe(['topicA', 'topicB'], Mqtt.QoS.AT_MOST_ONCE);
   * ```
   */
  public async subscribe(
    topicFilters: string[],
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults>;

  /**
   * Subscribes to a topic filter with MQTT 5.0 subscription options and waits for SUBACK.
   * @param subscription topic filter and subscription options. Its `qos` takes precedence over the `qos` argument.
   * @param qos QoS level. Defaults to `Mqtt.QoS.AT_MOST_ONCE`.
   * @param properties MQTT 5.0 SUBSCRIBE properties.
   * @returns the reason codes of SUBACK.
   * @example
   * ```ts
   * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.subscribe({ topicFilter: 'topicA', qos: Mqtt.QoS.AT_MOST_ONCE, retainHandling: Mqtt.RetainHandling.DoNotSend, retainAsPublished: true, noLocal: true });
   * ```
   */
  public async subscribe(
    subscription: SubscriptionOption,
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults>;

  /**
   * Subscribes to multiple topic filters with subscription options with one SUBSCRIBE packet and waits for SUBACK.
   * @param subscriptions topic filters and subscription options. Their `qos` takes precedence over the `qos` argument.
   * @param qos QoS level. Defaults to `Mqtt.QoS.AT_MOST_ONCE`.
   * @param properties MQTT 5.0 SUBSCRIBE properties.
   * @returns the reason codes of SUBACK.
   * @example
   * ```ts
   * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.subscribe(
   *   [
   *     { topicFilter: 'topicA', qos: Mqtt.QoS.AT_MOST_ONCE },
   *     { topicFilter: 'topicB', qos: Mqtt.QoS.AT_LEAST_ONCE },
   *     { topicFilter: 'topicC', qos: Mqtt.QoS.EXACTLY_ONCE },
   *     { topicFilter: 'topicD', qos: Mqtt.QoS.EXACTLY_ONCE, retainHandling: Mqtt.RetainHandling.DoNotSend, retainAsPublished: true, noLocal: true }
   *   ],
   * );
   * ```
   */
  public async subscribe(
    subscriptions: SubscriptionOption[],
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults>;

  /**
   * Subscribes to one or more topic filters and waits for SUBACK.
   */
  public async subscribe(
    input: SubscriptionOption | string | (SubscriptionOption | string)[],
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults> {
    const arr = Array.isArray(input) ? input : [input];
    const subs = arr.map<SubscriptionOption>((sub) => {
      return (typeof sub === 'object')
        ? {
          topicFilter: sub.topicFilter,
          qos: sub.qos || qos || Mqtt.QoS.AT_MOST_ONCE,
          retainHandling: sub.retainHandling,
          retainAsPublished: sub.retainAsPublished,
          noLocal: sub.noLocal,
        }
        : { topicFilter: sub, qos: qos || Mqtt.QoS.AT_MOST_ONCE };
    });

    const deferred = new Deferred<SubscribeResults>();
    const packet: SubscribePacket = {
      type: 'subscribe',
      packetId: await this.session.acquirePacketId(),
      subscriptions: subs,
      properties: properties,
    };
    await this.session.storeSubscribe(packet, deferred);
    await this.sendPacket(packet);

    return deferred.promise;
  }

  /**
   * Unsubscribes from a topic filter and waits for UNSUBACK.
   * @param topicFilter topic name or topic filter
   * @param properties MQTT 5.0 UNSUBSCRIBE properties.
   * @returns the reason codes of UNSUBACK.
   * @example
   * ```ts
   * import { MqttClient, MqttProperties } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.unsubscribe('topicA');
   *
   * const properties: MqttProperties.UnsubscribeProperties = {
   *   userProperties: [
   *     { key: 'userProp1', val: 'userData1' },
   *     { key: 'userProp2', val: 'userData2' },
   *     { key: 'userProp2', val: 'userData3' },
   *   ]
   * };
   * await client.unsubscribe('topicB', properties);
   * ```
   */
  public async unsubscribe(topicFilter: string, properties?: MqttProperties.UnsubscribeProperties): Promise<UnsubscribeResults>;

  /**
   * Unsubscribes from multiple topic filters with one UNSUBSCRIBE packet and waits for UNSUBACK.
   * @param topicFilters topic names or topic filters
   * @param properties MQTT 5.0 UNSUBSCRIBE properties.
   * @returns the reason codes of UNSUBACK.
   * @example
   * ```ts
   * import { MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.unsubscribe(
   *   [
   *     'topicA',
   *     'topicB',
   *     'topicC',
   *   ],
   * );
   * ```
   */
  public async unsubscribe(topicFilters: string[], properties?: MqttProperties.UnsubscribeProperties): Promise<UnsubscribeResults>;

  /**
   * Unsubscribes from one or more topic filters and waits for UNSUBACK.
   */
  public async unsubscribe(
    input: string | string[],
    properties?: MqttProperties.UnsubscribeProperties,
  ): Promise<UnsubscribeResults> {
    const unsubs = Array.isArray(input) ? input : [input];

    const deferred = new Deferred<UnsubscribeResults>();
    const packet: UnsubscribePacket = {
      type: 'unsubscribe',
      packetId: await this.session.acquirePacketId(),
      topicFilters: unsubs,
      properties,
    };

    await this.session.storeUnsubscribe(packet, deferred);
    await this.sendPacket(packet);

    return deferred.promise;
  }

  /**
   * Disconnects from the broker.
   *
   * Normally sends DISCONNECT and waits for the connection to close (closes it after `disconnectTimeoutMS`).
   * With `force`, closes the connection without sending DISCONNECT, so the broker publishes the will message.
   * Resolves immediately if the client is not connected.
   * If a disconnect is already in progress, waits for the same close without sending DISCONNECT again;
   * with `force`, closes the connection now instead of waiting for the broker. `properties` of this call are ignored.
   *
   * @param force `true` to close without sending DISCONNECT.
   * @param properties MQTT 5.0 DISCONNECT properties.
   * @example
   * normal disconnection
   * ```ts
   * import { MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.disconnect();
   * ```
   *
   * using disconnect properties.
   * ```ts
   * import { MqttClient, MqttProperties } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * const properties: MqttProperties.DisconnectProperties = {
   *   reasonString: 'trouble',
   *   sessionExpiryInterval: 300,
   * };
   * await client.disconnect(false, properties);
   * ```
   * force disconnect
   * ```ts
   * import { MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.disconnect(true);
   * ```
   */
  public async disconnect(
    force: boolean = false,
    properties?: MqttProperties.DisconnectProperties,
  ): Promise<void> {
    // A disconnect is already in progress: wait for the same close instead of sending DISCONNECT again.
    if (this.waitForClose) {
      const waitForClose = this.waitForClose;
      if (force && this.connectionState === 'online') {
        // Do not wait for the broker or disconnectTimeoutMS to close the connection.
        await this.close();
      }
      return waitForClose.promise;
    }

    const deferred = new Deferred<void>();
    this.waitForClose = deferred;

    if (this.connectionState === 'connecting') {
      this.log('A disconnect request was accepted while connected');
      if (this.unresolvedConnect) {
        try {
          await this.unresolvedConnect.promise;
        } catch (err) {
          // connect() failed, so there is no connection to close. Release the calls waiting for it.
          this.waitForClose = undefined;
          deferred.resolve();
          throw err;
        }
      }
    }

    if (this.connectionState === 'offline') {
      this.waitForClose = undefined;
      deferred.resolve();
    } else {
      await this.doDisconnect(force, undefined, properties);
    }

    return deferred.promise;
  }

  /** Closes the connection when `force` is true, otherwise sends DISCONNECT and waits for the broker to close it. */
  protected async doDisconnect(
    force: boolean = false,
    reasonCode?: Mqtt.ReasonCode,
    properties?: MqttProperties.Properties,
  ) {
    if (this.connectionState === 'online') {
      if (force) {
        await this.close();
      } else {
        const disconnectPacket: DisconnectPacket = {
          type: 'disconnect',
          ...(reasonCode !== undefined && { reasonCode }),
          ...(properties && { properties }),
        };
        await this.sendPacket(disconnectPacket);
        this.startDisconnectTimer();
      }
    }
  }

  /**
   * Sends AUTH (MQTT 5.0 enhanced authentication). Receive AUTH from the broker with the `auth` event.
   * @param reasonCode e.g. `Mqtt.ReasonCode.ContinueAuthentication` or `Mqtt.ReasonCode.ReAuthenticate`.
   * @param properties AUTH properties, such as `authenticationMethod` and `authenticationData`.
   */
  public async auth(
    reasonCode?: Mqtt.ReasonCode,
    properties?: MqttProperties.AuthProperties,
  ): Promise<void> {
    const packet: AuthPacket = {
      type: 'auth',
      reasonCode,
      properties,
    };
    await this.sendPacket(packet);
  }

  /** Writes bytes to the transport. Set by subclasses when the connection is opened. */
  protected write: (byte: Uint8Array) => void = (_byte: Uint8Array) => {};

  /** Closes the transport connection. */
  protected abstract close(): Promise<void>;

  /**
   * Handles a malformed packet per protocol version: closes the connection (MQTT 3.1.1)
   * or sends DISCONNECT with the MalformedPacket reason code (MQTT 5.0).
   */
  protected async handleMalformedPacket(error: Error): Promise<void> {
    try {
      this.log('handling malformed packet', error);
      if (this.protocolVersion === Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        // MQTT v3.1.1: DISCONNECT has no reason code and unconditionally signals a
        // clean disconnect, which also causes the broker to discard the Will message.
        // Since this is an abnormal condition caused by the peer, close the connection
        // directly instead of sending a misleading DISCONNECT.
        this.log('Closing connection (v3.1.1) due to malformed packet');
        await this.close();
      } else if (this.protocolVersion === Mqtt.ProtocolVersion.MQTT_V5) {
        // MQTT v5.0: Send DISCONNECT with MalformedPacket reason code
        // Note: We don't send PUBACK/PUBREC/AUTH responses for malformed packets
        // because we cannot trust the packet type or content in malformed data
        this.log('Sending DISCONNECT (v5.0) with MalformedPacket reason code');
        await this.doDisconnect(false, Mqtt.ReasonCode.MalformedPacket);
      }
    } catch (handlingError) {
      // If we can't even send error responses, just log and close
      this.log('Error while handling malformed packet:', handlingError);
    }
  }

  /**
   * Decode the bytes of a single complete MQTT packet and dispatch it.
   * Called by subclasses once a packet has been framed off the transport.
   *
   * Decoding and dispatching are performed synchronously, so packets are
   * processed in the order this method is called. A malformed packet is
   * handled per protocol version and the returned promise settles when that
   * handling completes; any other error is thrown synchronously.
   */
  protected handleReceivedBytes(receiveBytes: Uint8Array): Promise<void> {
    this.log('receive bytes', receiveBytes);

    try {
      const packet = MqttPackets.decode(receiveBytes, this.protocolVersion);
      this.log('receive packet', packet);
      this.packetReceived(packet);
    } catch (decodeError) {
      if (!(decodeError instanceof MqttPackets.MqttPacketsError.MqttPacketParseError)) {
        // Not caused by malformed data from the peer; treat as a fatal/unexpected error.
        throw decodeError;
      }

      this.log(`Malformed packet received: ${decodeError.message}`);
      this.log(`Raw bytes (first 20): ${receiveBytes.slice(0, 20)}`);

      // Send appropriate response based on protocol version
      return this.handleMalformedPacket(decodeError);
    }

    return Promise.resolve();
  }

  /**
   * Handle an error raised while framing packets off the transport.
   *
   * A MalformedPacketError means the byte stream framing is desynchronized
   * (e.g. an invalid Remaining Length), so it is handled per protocol version
   * and the returned promise settles when that handling completes. Subclasses
   * must stop interpreting further bytes on the connection afterwards. Any
   * other error is not caused by malformed data from the peer and is thrown
   * synchronously.
   */
  protected handleFramingError(streamError: unknown): Promise<void> {
    if (!(streamError instanceof MalformedPacketError)) {
      throw streamError;
    }

    this.log(`Malformed packet received (framing error): ${streamError.message}`);
    return this.handleMalformedPacket(streamError);
  }

  /** Called by subclasses when the connection is closed: stops the timers and emits the `closed` event. */
  protected detectClosed() {
    this.log('connection closed.');
    this.connectionState = 'offline';
    this.stopConnectTimer();
    this.stopDisconnectTimer();
    this.stopKeepAliveTimer();
    this.stopPingrespTimer();

    if (this.waitForClose) {
      this.waitForClose.resolve();
      this.waitForClose = undefined;
    }

    this.eventTarget.dispatchEvent(
      createCustomEvent('closed', {}),
    );
  }

  /**
   * Dispatch a received packet to its handler.
   *
   * Handlers run one at a time in the order packets were received, so a
   * handler awaiting e.g. a store never lets a later packet overtake it. A
   * failure inside a handler is logged instead of becoming an unhandled
   * rejection. An unsupported packet type is thrown synchronously.
   */
  protected packetReceived(packet: AnyPacket) {
    let handle: () => void | Promise<void>;
    switch (packet.type) {
      case 'connack':
        handle = () => this.handleConnack(packet);
        break;
      case 'publish':
        handle = () => this.handlePublish(packet);
        break;
      case 'puback':
        handle = () => this.handlePuback(packet);
        break;
      case 'pubrec':
        handle = () => this.handlePubrec(packet);
        break;
      case 'pubrel':
        handle = () => this.handlePubrel(packet);
        break;
      case 'pubcomp':
        handle = () => this.handlePubcomp(packet);
        break;
      case 'suback':
        handle = () => this.handleSuback(packet);
        break;
      case 'unsuback':
        handle = () => this.handleUnsuback(packet);
        break;
      case 'pingresp':
        handle = () => this.handlePingresp(packet);
        break;
      case 'disconnect':
        handle = () => this.handleDisconnect(packet);
        break;
      case 'auth':
        handle = () => this.handleAuth(packet);
        break;
      default:
        throw new MqttPackets.MqttPacketsError.UnsupportedPacketError('unknown');
    }

    this.packetHandling = this.packetHandling
      .then(handle)
      .catch((err) => {
        this.log(`Error while handling ${packet.type} packet:`, err);
      });
  }

  /**
   * Handles CONNACK: updates the session and settings from the broker, resends unacknowledged packets
   * and resolves `connect()`.
   */
  private async handleConnack(packet: ConnackPacket) {
    this.connectionState = 'online';

    this.stopConnectTimer();

    let connectionSuceeded = false;
    if (this.protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
      if (packet.reasonCode === Mqtt.ReasonCode.Success) {
        connectionSuceeded = true;
      } else {
        this.log(`connection failed. reasonCode:${packet.reasonCode}`);
      }
    } else {
      if (packet.returnCode === Mqtt.V3_1_1_ConnectReturnCode.ConnectionAccepted) {
        connectionSuceeded = true;
      } else {
        this.log(`connection failed. returnCode:${packet.returnCode}`);
      }
    }

    if (connectionSuceeded) {
      // server generates clientId
      if (packet.properties?.assignedClientIdentifier) {
        this.clientId = packet.properties.assignedClientIdentifier;
      }
      if (!packet.sessionPresent) {
        this.session.clearAllStores(this.clientId);
      }

      // The Server Keep Alive replaces the Keep Alive sent in CONNECT for this connection, even when it is higher or 0.
      this.currentKeepAlive = packet.properties?.serverKeepAlive ?? this.keepAlive;

      // Topic aliases are valid per connection, and an absent Topic Alias Maximum means 0 (no aliases allowed).
      const topicAliasMaximum = Math.min(this.topicAliasMaximumAboutSend ?? 0, packet.properties?.topicAliasMaximum ?? 0);
      this.topicAliasManagerAboutSend = topicAliasMaximum > 0 ? new TopicAliasManager(topicAliasMaximum) : undefined;

      // resend publish and pubrel
      for await (const packet of this.session.resendTargets()) {
        this.sendPacketInBackground(packet);
      }
    }

    if (this.unresolvedConnect) {
      this.unresolvedConnect.resolve(packet);
    }

    this.eventTarget.dispatchEvent(
      createCustomEvent('connack', { detail: packet }),
    );

    if (connectionSuceeded) {
      this.startKeepAliveTimer();
    }
  }

  /** Handles PUBLISH: resolves the topic alias, sends PUBACK / PUBREC per QoS and emits the `publish` event. */
  private async handlePublish(packet: PublishPacket) {
    { // resolve topic alias
      if (packet.properties?.topicAlias) {
        if (packet.topic == '') {
          const storedTopic = this.topicAliasMapAboutReceive.get(packet.properties.topicAlias);
          if (storedTopic) {
            packet.topic = storedTopic;
          } else {
            this.log('Unregistered topic alias received');
            return;
          }
        } else {
          this.topicAliasMapAboutReceive.set(packet.properties.topicAlias, packet.topic);
        }
      }
    }

    if (packet.qos === Mqtt.QoS.AT_MOST_ONCE) {
      this.eventTarget.dispatchEvent(
        createCustomEvent('publish', { detail: packet }),
      );
    } else if (packet.qos === Mqtt.QoS.AT_LEAST_ONCE) {
      this.sendPacketInBackground(
        {
          type: 'puback',
          packetId: packet.packetId!,
        },
      );

      this.eventTarget.dispatchEvent(
        createCustomEvent('publish', { detail: packet }),
      );
    } else if (packet.qos === Mqtt.QoS.EXACTLY_ONCE) {
      const emitMessage = !packet.dup ||
        !(await this.incomingStore.has(packet.packetId!));

      if (emitMessage) {
        await this.incomingStore.store(packet.packetId!);

        this.sendPacketInBackground(
          {
            type: 'pubrec',
            packetId: packet.packetId!,
          },
        );

        this.eventTarget.dispatchEvent(
          createCustomEvent('publish', { detail: packet }),
        );
      }
    }
  }

  /** Handles PUBACK: completes a QoS 1 publish. */
  private async handlePuback(packet: PubackPacket) {
    if (await this.session.packetIdInUse(packet.packetId)) {
      await this.session.discard(packet);
      const deferred = this.session.getPublishDeferred(packet.packetId);
      if (deferred) {
        if (packet.reasonCode) {
          const reason = packet.properties?.reasonString;
          deferred.resolve({ result: packet.reasonCode, reason });
        } else {
          deferred.resolve({ result: Mqtt.ReasonCode.Success });
        }
      }
    } else {
      this.log(`Unknown packetId received, it ignore. (packetId:${packet.packetId})`, 'puback');
    }
  }

  /** Handles PUBREC: sends PUBREL for a QoS 2 publish. */
  private async handlePubrec(packet: PubrecPacket) {
    if (await this.session.packetIdInUse(packet.packetId)) {
      // MUST send a PUBREL packet when it receives a PUBREC packet from the receiver with a Reason Code value less than 0x80.
      // This PUBREL packet MUST contain the same Packet Identifier as the original PUBLISH packet
      // sea: https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901237
      if (
        packet.reasonCode && packet.reasonCode >= Mqtt.ReasonCode.UnspecifiedError // UnspecifiedError: 128
      ) {
        await this.session.discard(packet);

        const deferred = this.session.getPublishDeferred(packet.packetId);
        if (deferred) {
          const reason = packet.properties?.reasonString;
          deferred.resolve({ result: packet.reasonCode, reason });
        }
        return;
      }

      const pubrel: PubrelPacket = {
        type: 'pubrel',
        packetId: packet.packetId,
      };

      this.session.storePubrel(pubrel);
      this.sendPacketInBackground(pubrel);
    } else {
      this.log(`Unknown packetId received. (packetId:${packet.packetId})`, 'pubrec');
      if (this.protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        const pubrel: PubrelPacket = {
          type: 'pubrel',
          packetId: packet.packetId,
          reasonCode: Mqtt.ReasonCode.PacketIdentifierNotFound,
        };
        this.sendPacketInBackground(pubrel);
      } else {
        const pubrel: PubrelPacket = {
          type: 'pubrel',
          packetId: packet.packetId,
        };
        this.sendPacketInBackground(pubrel);
      }
    }
  }

  /** Handles PUBREL: sends PUBCOMP for a received QoS 2 publish. */
  private async handlePubrel(packet: PubrelPacket) {
    if (await this.incomingStore.has(packet.packetId)) {
      await this.incomingStore.discard(packet.packetId);

      this.sendPacketInBackground(
        {
          type: 'pubcomp',
          packetId: packet.packetId,
        },
      );
    } else {
      this.log(`Unknown packetId received (packetId:${packet.packetId})`, 'pubrel');
      if (this.protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        const pubcomp: PubcompPacket = {
          type: 'pubcomp',
          packetId: packet.packetId,
          reasonCode: Mqtt.ReasonCode.PacketIdentifierNotFound,
        };
        this.sendPacketInBackground(pubcomp);
      } else {
        const pubcomp: PubcompPacket = {
          type: 'pubcomp',
          packetId: packet.packetId,
        };
        this.sendPacketInBackground(pubcomp);
      }
    }
  }

  /** Handles PUBCOMP: completes a QoS 2 publish. */
  private async handlePubcomp(packet: PubcompPacket) {
    if (await this.session.packetIdInUse(packet.packetId)) {
      await this.session.discard(packet);

      const deferred = this.session.getPublishDeferred(packet.packetId);
      if (deferred) {
        if (packet.reasonCode) {
          const reason = packet.properties?.reasonString;
          deferred.resolve({ result: packet.reasonCode, reason });
        } else {
          deferred.resolve({ result: Mqtt.ReasonCode.Success });
        }
      }
    } else {
      this.log(`Unknown packetId received, it ignore. (packetId:${packet.packetId})`, 'pubcomp');
    }
  }

  /** Handles SUBACK: resolves `subscribe()`. */
  private async handleSuback(packet: SubackPacket) {
    if (await this.session.packetIdInUse(packet.packetId)) {
      const rvList = packet.reasonCodes ? packet.reasonCodes : packet.returnCodes;

      await this.session.discard(packet);

      const deferred = this.session.getSubscribeDeferred(packet.packetId);
      if (deferred) {
        const reason = packet.properties?.reasonString;
        deferred.resolve({ reasons: rvList!, reason });
      }
    } else {
      this.log(`Unknown packetId received, it ignore. (packetId:${packet.packetId})`, 'suback');
    }
  }

  /** Handles UNSUBACK: resolves `unsubscribe()`. */
  private async handleUnsuback(packet: UnsubackPacket) {
    if (await this.session.packetIdInUse(packet.packetId)) {
      await this.session.discard(packet);
      const deferred = this.session.getUnsubscribeDeferred(packet.packetId);
      if (deferred) {
        if (packet.reasonCodes) {
          const reason = packet.properties?.reasonString;
          deferred.resolve({ reasonCodes: packet.reasonCodes, reason });
        } else {
          deferred.resolve({});
        }
      }
    } else {
      this.log(`Unknown packetId received, it ignore. (packetId:${packet.packetId})`, 'unsuback');
    }
  }

  /** Handles PINGRESP: stops the PINGRESP timeout. */
  private handlePingresp(_packet: PingrespPacket) {
    this.stopPingrespTimer();
  }

  /** Handles DISCONNECT from the broker: closes the connection and emits the `disconnect` event. */
  private async handleDisconnect(packet: DisconnectPacket) {
    await this.close();
    this.eventTarget.dispatchEvent(
      createCustomEvent('disconnect', { detail: packet }),
    );
  }

  /** Handles AUTH: emits the `auth` event. */
  private handleAuth(packet: AuthPacket) {
    this.eventTarget.dispatchEvent(
      createCustomEvent('auth', { detail: packet }),
    );
  }

  /** Closes the connection if the broker does not close it within `disconnectTimeoutMS` after DISCONNECT. */
  private startDisconnectTimer() {
    this.startTimer(
      'disconnect',
      () => {
        this.close();
      },
      this.disconnectTimeout,
    );
  }
  /** Stops the timer started by startDisconnectTimer(). */
  private stopDisconnectTimer() {
    if (this.timerExists('disconnect')) {
      this.stopTimer('disconnect');
    }
  }

  /** Rejects `connect()` with ConnectTimeout if CONNACK is not received within `connectTimeoutMS`. */
  private startConnectTimer() {
    this.startTimer(
      'connect',
      () => {
        this.close();
        if (this.unresolvedConnect) {
          this.unresolvedConnect.reject(new ConnectTimeout());
        }
      },
      this.connectTimeout,
    );
  }
  /** Stops the timer started by startConnectTimer(). */
  private stopConnectTimer() {
    if (this.timerExists('connect')) {
      this.stopTimer('connect');
    }
  }

  /** Sends PINGREQ when nothing is sent within the keep alive interval. */
  private startKeepAliveTimer() {
    if (!this.currentKeepAlive) {
      return;
    }

    this.startTimer(
      'keepAlive',
      async () => {
        await this.sendPacket({ type: 'pingreq' });
        this.startPingrespTimer();
      },
      this.currentKeepAlive * 1000,
    );
  }
  /** Stops the timer started by startKeepAliveTimer(). */
  private stopKeepAliveTimer() {
    if (this.timerExists('keepAlive')) {
      this.stopTimer('keepAlive');
    }
  }

  /** Disconnects if PINGRESP is not received within `pingrespTimeoutMS`. */
  private startPingrespTimer() {
    this.startTimer('pingrespTimeout', async () => {
      await this.disconnect(true);
    }, this.pingrespTimeoutMs);
  }
  /** Stops the timer started by startPingrespTimer(). */
  private stopPingrespTimer() {
    if (this.timerExists('pingrespTimeout')) {
      this.stopTimer('pingrespTimeout');
    }
  }

  /** Starts the named timer, replacing the running one with the same name. */
  private startTimer(
    name: string,
    cb: (...args: unknown[]) => void,
    delay: number,
  ) {
    if (this.timerExists(name)) {
      this.stopTimer(name);
    }

    this.timers[name] = setTimeout(() => {
      delete this.timers[name];
      cb();
    }, delay);
  }

  /** Stops the named timer. */
  private stopTimer(name: string) {
    if (!this.timerExists(name)) {
      return;
    }

    const timerId = this.timers[name];

    if (timerId) {
      clearTimeout(timerId);

      delete this.timers[name];
    }
  }

  /** Whether the named timer is running. */
  private timerExists(name: string): boolean {
    return !!this.timers[name];
  }

  /**
   * Registers an event listener. `event.detail` holds the received packet.
   *
   * | Event        | `event.detail`     | When                                                      |
   * | ------------ | ------------------ | --------------------------------------------------------- |
   * | `publish`    | `PublishPacket`    | A message is received.                                    |
   * | `connack`    | `ConnackPacket`    | CONNACK is received.                                      |
   * | `disconnect` | `DisconnectPacket` | The broker sends DISCONNECT (MQTT 5.0).                   |
   * | `auth`       | `AuthPacket`       | The broker sends AUTH (MQTT 5.0 enhanced authentication). |
   * | `closed`     | -                  | The connection is closed, for any reason.                 |
   *
   * @param type event type
   * @param callback listener
   * @example
   * Wait for receipt of a connack packet.
   * ```ts
   * import { MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * client.on('connack', (event) => {
   *   const connackPacket = event.detail;
   *   console.log(connackPacket);
   * });
   * ```
   *
   * Wait for receipt of a publish message.
   * ```ts
   * import { MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * client.on('publish', (event) => {
   *   const packet = event.detail;
   *   const receiveMessage = new TextDecoder().decode(packet.payload);
   *   console.log(`topic: ${packet.topic}`, `message: ${receiveMessage}`);
   * });
   * ```
   *
   * Wait for events when disconnected from the broker or disconnected by itself.
   * ```ts
   * import { MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * client.on('closed', () => {
   *   console.log('closed');
   * });
   * ```
   *
   * Waiting to receive Disconnect packets sent by the Broker
   * ```ts
   * import { MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * client.on('disconnect', (event) => {
   *   const disconnectPacket = event.detail;
   *   console.log(disconnectPacket.reasonCode);
   * });
   * ```
   * wait for Auth packet.
   * ```ts
   * import { MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * client.on('auth', (event) => {
   *   const authPacket = event.detail;
   *   console.log(authPacket);
   * });
   * ```
   */
  public on = <T extends keyof CustomEventMap>(
    type: T,
    callback: CustomEventListener<CustomEventMap[T]>,
  ): void => {
    this.eventTarget.addEventListener(type, callback as EventListener);
  };

  /**
   * Removes an event listener registered with {@link BaseMqttClient.on}.
   * @param type event type
   * @param callback the listener passed to `on()`
   */
  public off = <T extends keyof CustomEventMap>(
    type: T,
    callback: CustomEventListener<CustomEventMap[T]>,
  ): void => {
    this.eventTarget.removeEventListener(type, callback as EventListener);
  };

  /**
   * Returns the client identifier: the one specified in the client options, or, after connecting with an empty ID to an MQTT 5.0 broker,
   * the one assigned by the broker (Assigned Client Identifier).
   * @returns client identifier
   */
  public getClientId(): string {
    return this.clientId;
  }
}

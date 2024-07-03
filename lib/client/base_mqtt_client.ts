import { Mqtt, MqttPackets, MqttProperties } from '../mod.ts';
import { Session } from './session.ts';
import { TopicAliasManager } from './topic_alias.ts';
import { ClientOptions, ConnectOptions, PublishOptions, SubscriptionOption } from './client_types.ts';
import { ConnectTimeout, SendPacketError, StateIsNotOfflineError, StateIsNotOnlineError } from './error.ts';
import { InvalidQoSError } from '../mqtt_utils/mod.ts';
import { Deferred, PublishResult, SubscribeResults, UnsubscribeResults } from './promise.ts';
import { IncomingMemoryStore, IncomingStore } from './store.ts';
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

/**
 * Abstract MQTT Client.
 * Typical functions are implemented in this class.
 */
export abstract class BaseMqttClient {
  protected url: URL;
  private userName?: string;
  private password?: string;
  private clientId: string;
  private keepAlive: number;
  protected protocolVersion: Mqtt.ProtocolVersion;
  private clean: boolean;
  private connectTimeout: number;
  private disconnectTimeout: number;
  private connectionState: ConnectionStates;
  private disconnectRequested = false;
  private session: Session;
  private unresolvedConnect?: Deferred<ConnackPacket>;
  private incomingStore: IncomingStore;
  private timers: { [key: string]: ReturnType<typeof setTimeout> };
  protected log: (msg: string, ...args: unknown[]) => void;
  protected caCerts?: string[];

  private connectProperties?: MqttProperties.ConnectProperties;

  protected eventTarget: EventTarget;
  private pingrespTimeoutMs: number;
  private topicAliasManagerAboutSend?: TopicAliasManager;
  private topicAliasMaximumAboutReceive?: number;
  private topicAliasMapAboutReceive: Map<number, string>;
  private waitForClose?: Deferred<void>;

  // constructor
  constructor(options?: ClientOptions) {
    this.url = options?.url || new URL('mqtt://127.0.0.1:1883');
    this.log = options?.logger || (() => {});
    this.userName = options?.username;
    this.password = options?.password;
    this.clientId = options?.clientId || '';
    this.keepAlive = (() => {
      if (options?.keepAlive) {
        return options.keepAlive > 0 ? options.keepAlive : 0;
      } else {
        return defaultKeepAlive;
      }
    })();
    this.protocolVersion = options?.protocolVersion || Mqtt.ProtocolVersion.MQTT_V5;
    this.clean = (() => {
      if (options) {
        return (typeof options.clean === 'undefined') ? true : options.clean;
      }
      return true;
    })();
    this.connectTimeout = options?.connectTimeoutMS || defaultConnectTimeout;
    this.disconnectTimeout = options?.disconnectTimeoutMS || defaultDisconnectTimeout;

    this.connectionState = 'offline';
    this.incomingStore = options?.incomingStore || new IncomingMemoryStore();

    if (this.clean) {
      this.session = new Session(this.clientId);
    } else {
      this.session = new Session(this.clientId, options?.outgoingStore);
    }

    this.caCerts = options?.caCerts;

    this.eventTarget = new EventTarget();
    this.pingrespTimeoutMs = options?.pingrespTimeoutMS || defaultPingrespTimeout;
    this.timers = {};

    if (this.protocolVersion == Mqtt.ProtocolVersion.MQTT_V5 && options?.topicAliasMaximumAboutSend) {
      this.topicAliasManagerAboutSend = new TopicAliasManager(options.topicAliasMaximumAboutSend);
    }

    if (this.protocolVersion == Mqtt.ProtocolVersion.MQTT_V5 && options?.topicAliasMaximumAboutReceive) {
      this.topicAliasMaximumAboutReceive = options.topicAliasMaximumAboutReceive;
    }
    this.topicAliasMapAboutReceive = new Map<number, string>();
  }

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
      this.log(err, err.cause);
      throw err;
    }
  }

  protected abstract open(): Promise<void>;

  /**
   * Connect to Broker.
   *
   * @param options ConnectOptions
   * @returns Promise<ConnackPacket>
   * @example
   * mqtt
   * ```
   * const client = new MqttClient();
   * await client.connect();
   * ```
   * using properties
   * ```
   *   const properties: MqttProperties.ConnectProperties = {
   *     sessionExpiryInterval: 300,
   *     receiveMaximum: 10,
   *     maximumPacketSize: 128,
   *     topicAliasMaximum: 20,
   *     requestResponseInformation: false,
   *     requestProblemInformation: false,
   *     userProperties: [
   *       { key: 'userProp1', val: 'userData1' },
   *       { key: 'userProp2', val: 'userData2' },
   *       { key: 'userProp2', val: 'userData3' },
   *     ],
   *   };
   *   const client = new MqttClient();
   *   await client.connect({ properties });
   * ```
   *
   * using will
   * ```
   *   const client = new MqttClient();
   *   const willPayload = new TextEncoder().encode('will message');
   *   await client.connect({
   *     will: {
   *       topic: 'topicA',
   *       qos: Mqtt.QoS.AT_LEAST_ONCE,
   *       payload: willPayload,
   *       properties: { userProperties: [{ key: 'userProp1', val: 'userData1' }] },
   *     },
   *   });
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
    this.disconnectRequested = false;
    this.waitForClose = undefined;

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
      this.log(`caught error opening connection: ${err.message}`);

      this.detectClosed();
      if (this.unresolvedConnect) {
        this.unresolvedConnect.reject(err);
      }
    }

    return deferred.promise;
  }

  /**
   * Returns the current number of sent publish messages that have not been completed
   */
  public async publishInflightCount() {
    return await this.session.publishInflightCount();
  }

  /**
   * Send a publish packet.
   * @param topic topic name
   * @param payload publish payload
   * @param options PublishOptions
   * @param properties UserPublishProperties
   * @returns Promise<PublishResult>
   * @example
   * ```
   * await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_MOST_ONCE });
   * await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_LEAST_ONCE });
   * await client.publish('topicA', 'payload', { qos: Mqtt.QoS.EXACTRY_ONCE });
   * await client.publish('topicA', new TextEncoder().encode('payloadA'), { qos: Mqtt.QoS.EXACTRY_ONCE });
   * await client.publish('topicA', 'payloadA' { qos: Mqtt.QoS.AT_LEAST_ONCE, dup: true, retain: true });
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
    let topicId;
    if (this.topicAliasManagerAboutSend) {
      topicId = this.topicAliasManagerAboutSend.getTopicId(topic);
      if (topicId) {
        topic = '';
      } else {
        topicId = await this.topicAliasManagerAboutSend.registerTopic(topic);
      }
    }

    let publishProperties = properties as MqttProperties.PublishProperties;
    // set topic alias
    if (topicId) {
      if (publishProperties) {
        publishProperties.topicAlias = topicId;
      } else {
        publishProperties = { topicAlias: topicId };
      }
    }

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
      const packetId = await this.session.aquirePacketId();
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
      await this.session.storePublish(packet, deferred);
      await this.sendPacket(packet);
    }

    return deferred.promise;
  }

  /**
   * Send subscribe packets.
   * @param topicFilter topic name or topic filter
   * @param qos Mqtt.QoS
   * @param properties MqttProperties.SubscribeProperties
   * @example
   * ```
   * await client.subscribe('topicA', Mqtt.QoS.AT_MOST_ONCE);
   * ```
   */
  public async subscribe(
    topicFilter: string,
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults>;

  /**
   * Send subscribe packets.
   * @param topicFilters topic name or topic filter
   * @param qos Mqtt.QoS
   * @param properties MqttProperties.SubscribeProperties
   * @example
   * ```
   * await client.subscribe(['topicA', 'topicB'], Mqtt.QoS.AT_MOST_ONCE);
   * ```
   */
  public async subscribe(
    topicFilters: string[],
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults>;

  /**
   * Send subscribe packets.
   * @param subscription SubscriptionOption
   * @param qos Mqtt.QoS
   * @param properties MqttProperties.SubscribeProperties
   * @example
   * ```
   * await client.subscribe({ topicFilter: 'topicA', qos: Mqtt.QoS.AT_MOST_ONCE, retainHandling: Mqtt.RetainHandling.DoNotSend, retainAsPublished: true, noLocal: true });
   * ```
   */
  public async subscribe(
    subscription: SubscriptionOption,
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults>;

  /**
   * Send subscribe packets.
   * @param subscriptions SubscriptionOption[]
   * @param qos Mqtt.QoS
   * @param properties MqttProperties.SubscribeProperties
   * @example
   * ```
   * await client.subscribe(
   *   [
   *     { topicFilter: 'topicA', qos: Mqtt.QoS.AT_MOST_ONCE },
   *     { topicFilter: 'topicB', qos: Mqtt.QoS.AT_LEAST_ONCE },
   *     { topicFilter: 'topicC', qos: Mqtt.QoS.EXACTRY_ONCE },
   *     { topicFilter: 'topicD', qos: Mqtt.QoS.EXACTRY_ONCE, retainHandling: Mqtt.RetainHandling.DoNotSend, retainAsPublished: true, noLocal: true }
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
   * Send subscribe packets.
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
          qos: (sub.qos || qos || Mqtt.QoS.AT_MOST_ONCE),
          retainHandling: sub.retainHandling,
          retainAsPublished: sub.retainAsPublished,
          noLocal: sub.noLocal,
        }
        : { topicFilter: sub, qos: (qos || Mqtt.QoS.AT_MOST_ONCE) };
    });

    const deferred = new Deferred<SubscribeResults>();
    const packet: SubscribePacket = {
      type: 'subscribe',
      packetId: await this.session.aquirePacketId(),
      subscriptions: subs,
      properties: properties,
    };
    await this.session.storeSubscribe(packet, deferred);
    await this.sendPacket(packet);

    return deferred.promise;
  }

  /**
   * Send unsubscribe packets.
   * @param topicFilter topic name and topic filter.
   * @param properties UnsubackProperties
   * @example
   * ```
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
  public async unsubscribe(topicFilter: string, properties?: MqttProperties.UnsubackProperties): Promise<UnsubscribeResults>;

  /**
   * Send unsubscribe packets.
   * @param topicFilters topic name and topic filter
   * @param properties UnsubackProperties
   * @example
   * ```
   * await client.unsubscribe(
   *   [
   *     'topicA',
   *     'topicB',
   *     'topicC',
   *   ],
   * );
   * ```
   */
  public async unsubscribe(topicFilters: string[], properties?: MqttProperties.UnsubackProperties): Promise<UnsubscribeResults>;

  /**
   * Send unsubscribe packets.
   */
  public async unsubscribe(
    input: string | string[],
    properties?: MqttProperties.UnsubackProperties,
  ): Promise<UnsubscribeResults> {
    const unsubs = Array.isArray(input) ? input : [input];

    const deferred = new Deferred<UnsubscribeResults>();
    const packet: UnsubscribePacket = {
      type: 'unsubscribe',
      packetId: await this.session.aquirePacketId(),
      topicFilters: unsubs,
      properties,
    };

    await this.session.storeUnsubscribe(packet, deferred);
    await this.sendPacket(packet);

    return deferred.promise;
  }

  /**
   * Send disconnect packets or force disconnect.
   * Used for disconnecting.
   * Normally sends a DISCONNECT packet and waits for the Broker to disconnect.
   * In case of forced disconnection, the connection is terminated without sending a DISCONNECT packet.
   * @param force true is force disconnect, false is send disconnect packet.
   * @param properties DisconnectProperties
   * @example
   * normal disconnection
   * ```
   * await client.disconnect();
   * ```
   *
   * using disconnect properties.
   * ```
   * const properties: MqttProperties.DisconnectProperties = {
   *   reasonString: 'trouble',
   *   sessionExpiryInterval: 300,
   * };
   * await client.disconnect(false, properties);
   * ```
   * force disconnect
   * ```
   * await client.disconnect(true);
   * ```
   */
  public async disconnect(
    force: boolean = false,
    properties?: MqttProperties.DisconnectProperties,
  ): Promise<void> {
    const deferred = new Deferred<void>();
    this.waitForClose = deferred;
    this.disconnectRequested = true;
    if (this.connectionState !== 'offline') {
      await this.doDisconnect(force, properties);
    } else {
      deferred.resolve();
    }
    return deferred.promise;
  }

  private async doDisconnect(
    force: boolean = false,
    properties?: MqttProperties.Properties,
  ) {
    if (this.connectionState === 'online') {
      if (force) {
        await this.close();
      } else {
        await this.sendPacket({ type: 'disconnect', properties: properties });
        this.startDisconnectTimer();
      }
    }
  }

  /**
   * Send Auth packet.
   * @param reasonCode ReasonCode
   * @param properties AuthProperties
   */
  public async auth(
    reasonCode?: Mqtt.ReasonCode,
    properties?: MqttProperties.AuthProperties,
  ) {
    const packet: AuthPacket = {
      type: 'auth',
      reasonCode,
      properties,
    };
    await this.sendPacket(packet);
  }

  protected write: (byte: Uint8Array) => void = (_byte: Uint8Array) => {};

  protected abstract close(): Promise<void>;

  protected detectClosed() {
    this.log('connection closed.');
    this.connectionState = 'offline';
    this.stopConnectTimer();
    this.stopDisconnectTimer();
    this.stopKeepAliveTimer();
    this.stopPingrespTimer();

    this.eventTarget.dispatchEvent(
      createCustomEvent('closed', {}),
    );
    if (this.waitForClose) {
      this.waitForClose.resolve();
    }
  }

  protected packetReceived(packet: AnyPacket) {
    switch (packet.type) {
      case 'connack':
        this.handleConnack(packet);
        break;
      case 'publish':
        this.handlePublish(packet);
        break;
      case 'puback':
        this.handlePuback(packet);
        break;
      case 'pubrec':
        this.handlePubrec(packet);
        break;
      case 'pubrel':
        this.handlePubrel(packet);
        break;
      case 'pubcomp':
        this.handlePubcomp(packet);
        break;
      case 'suback':
        this.handleSuback(packet);
        break;
      case 'unsuback':
        this.handleUnsuback(packet);
        break;
      case 'pingresp':
        this.handlePingresp(packet);
        break;
      case 'disconnect':
        this.handleDisconnect(packet);
        break;
      case 'auth':
        this.handleAuth(packet);
        break;
      default:
        throw new MqttPackets.MqttPacketsError.UnsuportedPacketError('unknown');
    }
  }

  private handleConnack(packet: ConnackPacket) {
    this.connectionState = 'online';

    this.stopConnectTimer();

    // server  generates clientId
    if (packet.properties?.assignedClientIdentifier) {
      this.clientId = packet.properties.assignedClientIdentifier;
    }
    if (!packet.sessionPresent) {
      this.session.clearAllStores(this.clientId);
    }

    if (packet.properties) {
      if (packet.properties.serverKeepAlive) {
        if (this.keepAlive > packet.properties.serverKeepAlive) {
          this.keepAlive = packet.properties.serverKeepAlive;
        }
      }

      if (packet.properties.topicAliasMaximum) {
        if (this.topicAliasManagerAboutSend && this.topicAliasManagerAboutSend.capacity() > packet.properties.topicAliasMaximum) {
          this.topicAliasManagerAboutSend = new TopicAliasManager(packet.properties.topicAliasMaximum);
        }
      }
    }

    if (this.unresolvedConnect) {
      this.unresolvedConnect.resolve(packet);
    }

    this.eventTarget.dispatchEvent(
      createCustomEvent('connack', { detail: packet }),
    );

    if (this.disconnectRequested) {
      this.doDisconnect();
    } else {
      this.startKeepAliveTimer();
    }
  }

  private async handlePublish(packet: PublishPacket) {
    { // resolve topic alias
      if (packet.properties?.topicAlias) {
        if (packet.topic == '') {
          const storedTopic = this.topicAliasMapAboutReceive.get(packet.properties.topicAlias);
          if (storedTopic) {
            packet.topic = storedTopic;
          } else {
            this.log('Unregistered topic alias receiv');
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
      this.sendPacket(
        {
          type: 'puback',
          packetId: packet.packetId!,
        },
      );

      this.eventTarget.dispatchEvent(
        createCustomEvent('publish', { detail: packet }),
      );
    } else if (packet.qos === Mqtt.QoS.EXACTRY_ONCE) {
      const emitMessage = !packet.dup ||
        !(await this.incomingStore.has(packet.packetId!));

      if (emitMessage) {
        this.incomingStore.store(packet.packetId!);

        this.sendPacket(
          {
            type: 'pubrec',
            packetId: packet.packetId!,
          },
        );

        this.eventTarget.dispatchEvent(
          createCustomEvent('publish', { detail: packet }),
        );
      }
    } else {
      throw new InvalidQoSError(packet.qos);
    }
  }

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
      this.sendPacket(pubrel);
    } else {
      this.log(`Unknown packetId received. (packetId:${packet.packetId})`, 'pubrec');
      if (this.protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        const pubrel: PubrelPacket = {
          type: 'pubrel',
          packetId: packet.packetId,
          reasonCode: Mqtt.ReasonCode.PacketIdentifierNotFound,
        };
        this.sendPacket(pubrel);
      } else {
        const pubrel: PubrelPacket = {
          type: 'pubrel',
          packetId: packet.packetId,
        };
        this.sendPacket(pubrel);
      }
    }
  }

  private async handlePubrel(packet: PubrelPacket) {
    if (await this.incomingStore.has(packet.packetId)) {
      await this.incomingStore.discard(packet.packetId);

      this.sendPacket(
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
        this.sendPacket(pubcomp);
      } else {
        const pubcomp: PubcompPacket = {
          type: 'pubcomp',
          packetId: packet.packetId,
        };
        this.sendPacket(pubcomp);
      }
    }
  }

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

  private handlePingresp(_packet: PingrespPacket) {
    this.stopPingrespTimer();
  }

  private async handleDisconnect(packet: DisconnectPacket) {
    await this.close();
    this.eventTarget.dispatchEvent(
      createCustomEvent('disconnect', { detail: packet }),
    );
  }

  private handleAuth(packet: AuthPacket) {
    this.eventTarget.dispatchEvent(
      createCustomEvent('auth', { detail: packet }),
    );
  }

  private startDisconnectTimer() {
    this.startTimer(
      'disconnect',
      () => {
        this.close();
      },
      this.disconnectTimeout,
    );
  }
  private stopDisconnectTimer() {
    if (this.timerExists('disconnect')) {
      this.stopTimer('disconnect');
    }
  }

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
  private stopConnectTimer() {
    if (this.timerExists('connect')) {
      this.stopTimer('connect');
    }
  }

  private startKeepAliveTimer() {
    if (!this.keepAlive) {
      return;
    }

    this.startTimer(
      'keepAlive',
      async () => {
        await this.sendPacket({ type: 'pingreq' });
        this.startPingrespTimer();
      },
      this.keepAlive * 1000,
    );
  }
  private stopKeepAliveTimer() {
    if (this.timerExists('keepAlive')) {
      this.stopTimer('keepAlive');
    }
  }

  private startPingrespTimer() {
    this.startTimer('pingrespTimeout', async () => {
      await this.disconnect(true);
    }, this.pingrespTimeoutMs);
  }
  private stopPingrespTimer() {
    if (this.timerExists('pingrespTimeout')) {
      this.stopTimer('pingrespTimeout');
    }
  }

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

  private timerExists(name: string) {
    return !!this.timers[name];
  }

  /**
   * @param type
   * @param callback
   * @example
   * Wait for receipt of a connack packet.
   * ```
   * client.on('connack', (event) => {
   *   const connackPacket = event.detail;
   *   console.log(connackPacket);
   * });
   * ```
   *
   * Wait for receipt of a publish message.
   * ```
   * client.on('publish', (event) => {
   *   const packet = event.detail;
   *   const receiveMessage = decoder.decode(packet.payload);
   *   console.log(`topic: ${packet.topic}`, `message: ${receiveMessage}`);
   * });
   * ```
   *
   * Wait for events when disconnected from the broker or disconnected by itself.
   * ```
   * client.on('closed', () => {
   *   console.log('closed');
   * });
   * ```
   *
   * Waiting to receive Disconnect packets sent by the Broker
   * ```
   * client.on('disconnect', (event) => {
   *   const disconnectPacket = event.detail;
   *   console.log(disconnectPacket.reasonCode);
   * });
   * ```
   * wait for Auth packet.
   * ```
   * client.on('auth', (event) => {
   *   const authPacket = event.detail;
   *   console.log(authPacket);
   * });
   * ```
   */
  public on = <T extends keyof CustomEventMap>(
    type: T,
    callback: CustomEventListener<CustomEventMap[T]>,
  ) => {
    this.eventTarget.addEventListener(type, callback as EventListener);
  };

  public off = <T extends keyof CustomEventMap>(
    type: T,
    callback: CustomEventListener<CustomEventMap[T]>,
  ) => {
    this.eventTarget.removeEventListener(type, callback as EventListener);
  };

  public getClientId() {
    return this.clientId;
  }
}

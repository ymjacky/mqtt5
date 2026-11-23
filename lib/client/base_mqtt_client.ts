import * as Mqtt from '../mqtt/mod.ts';
import * as MqttPackets from '../mqtt_packets/mod.ts';
import type * as MqttProperties from '../mqtt_properties/mod.ts';
import * as MqttUtils from '../mqtt_utils/mod.ts';
import { Session } from './session.ts';
import { TopicAliasManager } from './topic_alias.ts';
import type { ClientOptions, ConnectOptions, PublishOptions, PublishResult, SubscribeResults, SubscriptionOption, UnsubscribeResults } from './client_types.ts';
import {
  ConnectionClosed,
  ConnectTimeout,
  InvalidArgumentError,
  MalformedPacketError,
  PacketTooLargeError,
  SendPacketError,
  StateIsNotOfflineError,
  StateIsNotOnlineError,
} from './error.ts';
import { Deferred } from './promise.ts';
import {
  type BrokerCapabilities,
  brokerCapabilitiesOf,
  unrestrictedBroker,
  validateConnect,
  validateDisconnect,
  validatePublish,
  validatePublishCapabilities,
  validateSubscribe,
  validateSubscribeCapabilities,
  validateUnsubscribe,
} from './validation.ts';
import { IncomingMemoryStore, type IncomingStore } from '../mqtt_store/mod.ts';
import { createCustomEvent, type CustomEventListener, type CustomEventMap } from './events.ts';
import * as MqttStream from '../mqtt_stream_utils/mod.ts';

import type {
  AnyPacket,
  AuthPacket,
  ConnackPacket,
  DisconnectPacket,
  PingrespPacket,
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket,
  SubackPacket,
  SubscribePacket,
  UnsubackPacket,
  UnsubscribePacket,
} from '../mqtt_packets/mod.ts';

type ConnectionStates =
  | 'offline'
  | 'connecting'
  | 'online'
  // The client has sent DISCONNECT and waits for the connection to close. Nothing may be sent any more [MQTT-3.14.4-1].
  | 'disconnecting';

/** A packet kept in the session, read to be resent after reconnecting, and its bytes. */
type ResendTarget = { packet: PublishPacket | PubrelPacket; bytes: Uint8Array };

const defaultKeepAlive = 10; // 10 sec
const defaultConnectTimeout = 10 * 1000;
const defaultDisconnectTimeout = 1 * 1000;
const defaultPingrespTimeout = 2 * 1000;

/** Returns `value` if it is a positive number, otherwise `defaultValue`. */
function positiveOrDefault(value: number | undefined, defaultValue: number): number {
  return value !== undefined && value > 0 ? value : defaultValue;
}

/**
 * Creates the Deferred whose promise connect(), publish(), subscribe(), unsubscribe() and auth() return.
 * A rejection reaches callers that await the promise, but never becomes an unhandled rejection
 * (which terminates the process in Deno) when a caller ignores the promise.
 */
function createRequestDeferred<T>(): Deferred<T> {
  const deferred = new Deferred<T>();
  deferred.promise.catch(() => {});
  return deferred;
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
  /**
   * The URL of the broker to connect to.
   * @ignore
   */
  protected url: URL;
  private userName?: string;
  private password?: string;
  private clientId: string;
  // Keep Alive sent in CONNECT.
  private keepAlive: number;
  // Keep Alive used for the current connection: the Server Keep Alive in CONNACK if present, otherwise keepAlive.
  private currentKeepAlive: number;
  /**
   * The MQTT protocol version used for the connection.
   * @ignore
   */
  protected protocolVersion: Mqtt.ProtocolVersion;
  private clean: boolean;
  private connectTimeout: number;
  private disconnectTimeout: number;
  private connectionState: ConnectionStates;
  private session: Session;
  // The deferred of the connect() that has not settled yet. It also identifies the connection attempt: what is still
  // running for an earlier attempt (startConnect(), handleConnack()) sees another value and leaves this one alone.
  private unresolvedConnect?: Deferred<ConnackPacket>;
  // Why the pending connect() fails when the connection is closed. ConnectionClosed if not set.
  private connectFailure?: Error;
  // The CONNACK with which the broker refused the connection: the pending connect() resolves with it when the connection is closed.
  private refusedConnack?: ConnackPacket;
  // Gives up the connect() in progress: it rejects with `reason` when the client is offline again. Set while connecting.
  private abortConnect?: (reason: Error) => void;
  private incomingStore: IncomingStore;
  // Tail of the chain that runs received packet handlers one at a time.
  private packetHandling: Promise<void> = Promise.resolve();
  private timers: { [key: string]: ReturnType<typeof setTimeout> };
  /**
   * Logger given by the `logger` option; does nothing by default.
   * @ignore
   */
  protected log: (msg: string, ...args: unknown[]) => void;
  /**
   * ca certificate.
   * @example
   * ```
   * ["-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"]
   * ```
   * @ignore
   */
  protected caCerts?: string[];
  /**
   * client certificate.
   * @example
   * ```
   * "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
   * ```
   * @ignore
   */
  protected cert?: string;
  /**
   * client private key.
   * @example
   * ```
   * "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
   * ```
   * @ignore
   */
  protected privateKey?: string;

  private connectProperties?: MqttProperties.ConnectProperties;

  /**
   * Dispatches the client events registered with `on()`.
   * @ignore
   */
  protected eventTarget: EventTarget;
  private pingrespTimeoutMs: number;
  private topicAliasMaximumAboutSend?: number;
  private topicAliasManagerAboutSend?: TopicAliasManager;
  private topicAliasMaximumAboutReceive?: number;
  private topicAliasMapAboutReceive: Map<number, string>;
  // Maximum Packet Size of the broker (CONNACK) for the current connection. No limit if undefined.
  private maximumPacketSizeAboutSend?: number;
  // What the broker accepts (Maximum QoS, Retain Available, ...) for the current connection, from CONNACK.
  private brokerCapabilities: BrokerCapabilities = unrestrictedBroker;
  private waitForClose?: Deferred<void>;
  // Settles when the PUBLISH of the last publish() call has been written or has failed (see waitForPublishTurn()).
  private publishQueue: Promise<void> = Promise.resolve();
  // The number of connections that have been closed. Work that belongs to one connection compares it to know whether
  // that connection is still open (see connectionOpen()).
  private closedConnections = 0;

  /** Creates a client. Use {@link MqttClient} or {@link WebSocketMqttClient}. */
  constructor(options?: ClientOptions) {
    this.url = options?.url ?? new URL('mqtt://127.0.0.1:1883');
    this.log = options?.logger ?? (() => {});
    this.userName = options?.username;
    this.password = options?.password;
    this.clientId = options?.clientId ?? '';
    this.keepAlive = options?.keepAlive === undefined ? defaultKeepAlive : Math.max(options.keepAlive, 0);
    this.currentKeepAlive = this.keepAlive;
    this.protocolVersion = options?.protocolVersion ?? Mqtt.ProtocolVersion.MQTT_V5;
    this.clean = options?.clean ?? true;
    this.connectTimeout = positiveOrDefault(options?.connectTimeoutMS, defaultConnectTimeout);
    this.disconnectTimeout = positiveOrDefault(options?.disconnectTimeoutMS, defaultDisconnectTimeout);

    this.connectionState = 'offline';
    this.incomingStore = options?.incomingStore ?? new IncomingMemoryStore();

    // The store is used whatever `clean` is: the session lasts for the Session Expiry Interval (MQTT 5.0), and
    // the broker tells in CONNACK (Session Present) whether the stored packets are resent or removed.
    const outgoingStore = options?.outgoingStore;
    try {
      outgoingStore?.setClientId?.(this.clientId);
    } catch (err) {
      throw new InvalidArgumentError(`the outgoingStore cannot be used with the clientId '${this.clientId}': ${(err as Error).message}`);
    }
    this.session = new Session(this.clientId, outgoingStore);

    this.caCerts = options?.caCerts;
    this.cert = options?.cert;
    this.privateKey = options?.privateKey;

    this.eventTarget = new EventTarget();
    this.pingrespTimeoutMs = positiveOrDefault(options?.pingrespTimeoutMS, defaultPingrespTimeout);
    this.timers = {};

    if (this.protocolVersion === Mqtt.ProtocolVersion.MQTT_V5 && options?.topicAliasMaximumAboutSend) {
      this.topicAliasMaximumAboutSend = options.topicAliasMaximumAboutSend;
    }

    if (this.protocolVersion === Mqtt.ProtocolVersion.MQTT_V5 && options?.topicAliasMaximumAboutReceive) {
      this.topicAliasMaximumAboutReceive = options.topicAliasMaximumAboutReceive;
    }
    this.topicAliasMapAboutReceive = new Map<number, string>();
  }

  /**
   * Encodes a packet to send. Its Remaining Length must not be larger than the largest MQTT allows, and the packet
   * must not be larger than the Maximum Packet Size of the broker ([MQTT-3.2.2-15]).
   * DISCONNECT and AUTH that are too large are encoded again without the Reason String and User Properties, which must not
   * be sent when they make the packet too large ([MQTT-3.14.2-3], [MQTT-3.14.2-4], [MQTT-3.15.2-2], [MQTT-3.15.2-3]).
   * @throws {PacketTooLargeError}
   * @throws {MqttPacketSerializeError} if the packet cannot be encoded for another reason.
   */
  private encodePacket(packet: AnyPacket): Uint8Array {
    const name = packet.type.toUpperCase();
    let bytes: Uint8Array;
    try {
      bytes = MqttPackets.packetToBytes(packet, this.protocolVersion);
    } catch (err) {
      // The encoder fails on the Remaining Length when it builds the fixed header, before copying a large payload.
      if (err instanceof MqttPackets.MqttPacketsError.MqttPacketSerializeError && err.cause instanceof MqttUtils.MqttUtilsError.RemainingLengthError) {
        throw new PacketTooLargeError(`${name} has a Remaining Length larger than ${MqttUtils.maxVariableByteInteger} bytes, the largest MQTT allows`);
      }
      throw err;
    }
    const max = this.maximumPacketSizeAboutSend;
    if (typeof max === 'undefined' || bytes.length <= max) {
      return bytes;
    }
    if (
      (packet.type === 'disconnect' || packet.type === 'auth') &&
      (packet.properties?.reasonString !== undefined || packet.properties?.userProperties !== undefined)
    ) {
      this.log(`${name} is too large for the broker: sending it without the Reason String and User Properties`);
      const properties = { ...packet.properties };
      delete properties.reasonString;
      delete properties.userProperties;
      return this.encodePacket({ ...packet, properties });
    }
    throw new PacketTooLargeError(`${name} is ${bytes.length} bytes, larger than the Maximum Packet Size ${max} of the broker`);
  }

  /**
   * Encodes and sends a packet, and restarts the keep alive timer.
   * @param bytes the packet already encoded by the caller, if any.
   */
  private async sendPacket(packet: AnyPacket, bytes?: Uint8Array): Promise<void> {
    try {
      if (this.connectionState === 'offline') {
        this.log(`can't send packet because offline.`, packet);
        throw new SendPacketError();
      }
      if (this.connectionState === 'disconnecting' && packet.type !== 'disconnect') {
        this.log(`can't send packet because DISCONNECT has been sent.`, packet);
        throw new SendPacketError();
      }

      this.log(`sending ${packet.type} packet`, packet);
      const data = bytes ?? this.encodePacket(packet);
      // No PINGREQ after DISCONNECT.
      if (packet.type !== 'disconnect') {
        this.startKeepAliveTimer();
      }
      await this.write(data);
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
  private sendPacketInBackground(packet: AnyPacket, bytes?: Uint8Array): void {
    this.sendPacket(packet, bytes).catch(() => {
      // already logged in sendPacket()
    });
  }

  /**
   * Opens the transport connection to the broker.
   * @param signal aborted when connect() gives up (connect timeout). Opening that is still in progress then rejects,
   * and a connection that opens later is closed without being used.
   * @ignore
   */
  protected abstract open(signal: AbortSignal): Promise<void>;

  /**
   * Connects to the broker: opens the connection, sends CONNECT and waits for CONNACK.
   *
   * The returned promise resolves with the CONNACK packet even when the broker rejects the connection,
   * so check its `reasonCode` (MQTT 5.0) / `returnCode` (MQTT 3.1.1).
   * When the broker rejects the connection, the client does not become online: it closes the connection, and the promise
   * resolves when the connection is closed.
   * After the client is closed, it can connect again with this method; it does not reconnect automatically.
   * When the broker has kept the session (Session Present), the QoS 1 / QoS 2 messages in flight are resent after the promise
   * resolves, in the order they were published and within the Receive Maximum of the broker; publish() calls made meanwhile
   * are sent after them.
   * When the returned promise rejects, or resolves with a CONNACK that rejects the connection, the client is offline again,
   * so this method can be called again right away.
   * A rejection of an ignored promise does not terminate the process; await the promise to handle failures.
   *
   * @param options {@link ConnectOptions}: clean start, MQTT 5.0 properties ({@link MqttProperties.ConnectProperties}) and will message.
   * @returns the received CONNACK packet ({@link MqttPackets.ConnackPacket}). Check its `reasonCode` (MQTT 5.0) or `returnCode` (MQTT 3.1.1):
   * the promise resolves even when the broker refuses the connection.
   * @throws {StateIsNotOfflineError} if the client is already connected or connecting.
   * @throws {InvalidTopicNameError} if the Will Topic or Will Response Topic is not a valid Topic Name. Nothing is sent.
   * @throws {InvalidArgumentError} if the Will QoS is not 0, 1 or 2, or the Will Payload is longer than 65,535 bytes. Nothing is sent.
   * @throws {InvalidPropertyError} if a CONNECT or Will property is invalid. Nothing is sent.
   * @throws {PacketTooLargeError} if CONNECT is larger than MQTT allows. No connection is opened.
   * @throws {MqttPacketSerializeError} if CONNECT cannot be encoded, e.g. the user name is longer than 65,535 bytes. No connection is opened.
   * @throws {ConnectTimeout} if CONNACK is not received within `connectTimeoutMS`, including the time to open the connection.
   * @throws {ConnectionClosed} if the connection is closed before CONNACK is received, e.g. by `disconnect(true)`.
   * `WebSocketMqttClient` also rejects with it when the connection cannot be opened.
   * @throws {Error} `MqttClient`: the error of opening the connection, e.g. `Deno.errors.ConnectionRefused` when the broker is not running,
   * or `Deno.errors.InvalidData` when the certificate of the broker is not trusted (`mqtts:`).
   * @throws {Error} the error of the session store (`outgoingStore`), if it fails when CONNACK is received. The connection is closed.
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
  public connect(
    options?: ConnectOptions,
  ): Promise<ConnackPacket> {
    const deferred = createRequestDeferred<ConnackPacket>();
    this.startConnect(options, deferred).catch((err) => deferred.reject(err));
    return deferred.promise;
  }

  /** Opens the connection and sends CONNECT for connect(). CONNACK, a failure or the connect timeout settles `deferred`. */
  private async startConnect(options: ConnectOptions | undefined, deferred: Deferred<ConnackPacket>): Promise<void> {
    if (this.connectionState !== 'offline') {
      throw new StateIsNotOfflineError('connect');
    }

    validateConnect(options, this.protocolVersion);

    const clean = options?.clean ?? this.clean;
    // The properties are saved for reconnect.
    let connectProperties = options?.properties ?? this.connectProperties;
    if (this.topicAliasMaximumAboutReceive) {
      // Tell the broker that you can receive topic alias
      connectProperties = { ...connectProperties, topicAliasMaximum: this.topicAliasMaximumAboutReceive };
    }

    const connectPacket: AnyPacket = {
      type: 'connect',
      clientId: this.clientId,
      username: this.userName,
      password: this.password,
      protocolVersion: this.protocolVersion,
      clean,
      keepAlive: this.keepAlive,
      properties: connectProperties,
      will: options?.will,
    };
    // The limits of the previous connection do not apply: the new ones come in CONNACK.
    this.maximumPacketSizeAboutSend = undefined;
    this.brokerCapabilities = unrestrictedBroker;
    // Nor do the topic aliases of the broker: they are valid on one connection only.
    this.topicAliasMapAboutReceive.clear();
    // Encode before opening the connection: if it fails, nothing is opened or changed.
    const bytes = this.encodePacket(connectPacket);

    this.clean = clean;
    this.connectProperties = connectProperties;
    this.connectionState = 'connecting';
    this.unresolvedConnect = deferred;
    this.connectFailure = undefined;
    this.refusedConnack = undefined;
    const opening = new AbortController();
    // Aborts the opening of the connection, or closes the connection. detectClosed() then rejects connect() with `reason`.
    const abortConnect = (reason: Error) => {
      this.connectFailure = reason;
      opening.abort(reason);
      this.close().catch((err) => this.log('failed to close the connection:', err));
    };
    this.abortConnect = abortConnect;

    let opened = false;
    try {
      this.startConnectTimer(abortConnect);
      this.log(`opening connection to ${this.url}`);
      await this.open(opening.signal);
      opened = true;

      this.log(`sending ${connectPacket.type} packet`, connectPacket);
      await this.write(bytes);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.log(`caught error opening connection: ${e.message}`);

      // The transport may have reported the close already, and connect() may even have been called again.
      if (this.unresolvedConnect !== deferred) {
        return;
      }
      // detectClosed() rejects connect(). Keep the reason of a connect timeout, which aborts the opening.
      this.connectFailure ??= e;
      if (opened) {
        // CONNECT could not be written: close the connection that was opened. The transport then reports the close.
        await this.close();
      } else {
        this.detectClosed();
      }
    }
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
   * A rejection of an ignored promise does not terminate the process; await the promise to handle failures.
   *
   * Messages are sent in the order publish() is called, whatever their QoS: each PUBLISH is sent after the PUBLISH
   * of the previous call has been written to the connection, or has failed.
   *
   * The broker limits, in CONNACK, what the client may send. QoS 1 and QoS 2: no more PUBLISH packets are in flight than its
   * Receive Maximum (MQTT 5.0, 65,535 if it has none), so a call waits until the PUBACK or PUBCOMP of an earlier message
   * arrives, and the calls after it wait too. If the connection is closed while waiting, the call rejects with `StateIsNotOnlineError`.
   * After reconnecting, the messages in flight kept in the session are resent first, also within the Receive Maximum, and the
   * calls wait for them.
   * A QoS higher than the Maximum QoS of the broker, and `retain` when the broker does not support retained messages
   * (Retain Available is 0), are rejected with {@link QoSNotSupportedError} and {@link RetainNotSupportedError}: the broker
   * would close the connection.
   *
   * @param topic topic name
   * @param payload payload. A string is encoded as UTF-8.
   * @param options {@link PublishOptions}: QoS, retain and DUP flags. QoS defaults to `Mqtt.QoS.AT_MOST_ONCE`.
   * @param properties MQTT 5.0 PUBLISH properties ({@link MqttProperties.UserPublishProperties}).
   * @returns the result of the publish flow ({@link PublishResult}). Its `result` is the reason code; 0x80 (128) or more is a failure.
   * @throws {StateIsNotOnlineError} if the client is not connected.
   * @throws {InvalidTopicNameError} if `topic` or the Response Topic is not a valid Topic Name. Nothing is sent.
   * @throws {InvalidArgumentError} if the QoS is not 0, 1 or 2, or `dup` is true with QoS 0. Nothing is sent.
   * @throws {QoSNotSupportedError} if the QoS is higher than the Maximum QoS of the broker (CONNACK). Nothing is sent.
   * @throws {RetainNotSupportedError} if `retain` is true and the broker does not support retained messages. Nothing is sent.
   * @throws {InvalidPropertyError} if a property is invalid. Nothing is sent.
   * @throws {PacketTooLargeError} if PUBLISH is larger than the Maximum Packet Size of the broker or than MQTT allows,
   * or QoS 1 and 2: than the session store can keep. Nothing is sent.
   * QoS 1 and 2 are checked with the Topic Name even when a topic alias would make them smaller: they are kept in the session
   * with it, to be resent after reconnecting. They are also rejected when resent after reconnecting and larger than
   * the Maximum Packet Size of the new connection; the message is removed from the session.
   * @throws {MqttPacketSerializeError} if PUBLISH cannot be encoded. Nothing is sent.
   * @throws {SessionLostError} QoS 1 and 2: if the broker did not keep the session when reconnecting before the flow completed.
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
   *   contentType: 'application/json',
   * };
   * await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_MOST_ONCE }, pubProperties);
   * ```
   */
  public publish(
    topic: string,
    payload: string | Uint8Array,
    options?: PublishOptions,
    properties?: MqttProperties.UserPublishProperties,
  ): Promise<PublishResult> {
    const deferred = createRequestDeferred<PublishResult>();
    this.sendPublish(topic, payload, options, properties, deferred).catch((err) => deferred.reject(err));
    return deferred.promise;
  }

  /** Sends PUBLISH for publish(). The flow settles `deferred` (right away for QoS 0). */
  private async sendPublish(
    topic: string,
    payload: string | Uint8Array,
    options: PublishOptions | undefined,
    properties: MqttProperties.UserPublishProperties | undefined,
    deferred: Deferred<PublishResult>,
  ): Promise<void> {
    if (this.connectionState !== 'online') {
      throw new StateIsNotOnlineError('publish');
    }

    const dup = options?.dup ?? false;
    const qos = options?.qos ?? Mqtt.QoS.AT_MOST_ONCE;
    const retain = options?.retain ?? false;
    // Check the topic given by the caller: with a topic alias, the client itself sends an empty Topic Name.
    validatePublish(topic, qos, dup, properties, this.protocolVersion);

    const buffer: Uint8Array = (typeof payload === 'string') ? MqttUtils.stringToBytes(payload) : payload;

    const finished = await this.waitForPublishTurn();
    try {
      // The connection may have been closed while waiting.
      if (this.connectionState !== 'online') {
        throw new StateIsNotOnlineError('publish');
      }
      // Checked here, not before waiting for the turn: the connection may have been closed and opened again meanwhile,
      // and the PUBLISH is sent on the current one.
      validatePublishCapabilities(qos, retain, this.brokerCapabilities);

      if (qos !== Mqtt.QoS.AT_MOST_ONCE) {
        // Do not send more QoS 1 / QoS 2 PUBLISH packets than the Receive Maximum of the broker allows [MQTT-3.3.4-7]:
        // wait until an acknowledgment ends one. The turn is kept, so the publish() calls after this one wait too, in order.
        const connectionOpen = this.connectionOpen();
        await this.session.waitForSendQuota(connectionOpen);
        // The connection may have been closed while waiting.
        if (!connectionOpen()) {
          throw new StateIsNotOnlineError('publish');
        }
      }

      const packetId = qos === Mqtt.QoS.AT_MOST_ONCE ? 0 : await this.session.acquirePublishPacketId();
      // Without a topic alias: it is set right before writing.
      const packet: PublishPacket = {
        type: 'publish',
        topic,
        payload: buffer,
        dup,
        retain,
        qos,
        packetId,
        // a copy: the caller may change or reuse the object while the packet is kept in the session
        properties: properties && { ...properties },
      };

      let bytes: Uint8Array | undefined;
      if (qos !== Mqtt.QoS.AT_MOST_ONCE) {
        // The session keeps the packet with its Topic Name and without a topic alias, which is valid only on the current
        // connection, to resend it after reconnecting. Encode it in that form before storing it: a packet that cannot be
        // encoded or is too large must not stay there to be resent.
        try {
          bytes = this.encodePacket(packet);
          const storeMaximum = this.session.maximumStoredPacketSize;
          if (storeMaximum !== undefined && bytes.length > storeMaximum) {
            throw new PacketTooLargeError(`PUBLISH is ${bytes.length} bytes, larger than the ${storeMaximum} bytes the session store can keep`);
          }
          await this.session.storePublish(packet, deferred);
        } catch (err) {
          // Not stored, so not sent either.
          this.session.releasePacketId(packetId);
          throw err;
        }
      }

      // No await from here until the packet is written (see encodePublishToWrite()).
      const [sending, sendingBytes] = this.encodePublishToWrite(packet, bytes);
      await this.sendPacket(sending, sendingBytes);
      if (qos === Mqtt.QoS.AT_MOST_ONCE) {
        deferred.resolve({ result: 0, reason: '' });
      }
    } finally {
      finished();
    }
  }

  /**
   * Waits for the turn of a publish() call: until the PUBLISH of every earlier call has been written or has failed.
   * publish() calls are processed one at a time, in the order of the calls. Otherwise a PUBLISH could overtake
   * an earlier one, e.g. a QoS 0 PUBLISH does not wait for the session store as QoS 1 and 2 do.
   * @returns a function to call when the PUBLISH of this call has been written or has failed: the next call starts then.
   */
  private async waitForPublishTurn(): Promise<() => void> {
    const previous = this.publishQueue;
    const finished = new Deferred<void>();
    this.publishQueue = finished.promise;
    await previous;
    return () => finished.resolve();
  }

  /**
   * Returns a function that tells whether the connection that is online now is still open. Work that waits on behalf of
   * that connection, e.g. for its send quota, checks it: after a reconnect the client is online again, but on another
   * connection.
   */
  private connectionOpen(): () => boolean {
    const closedConnections = this.closedConnections;
    return () => this.connectionState === 'online' && this.closedConnections === closedConnections;
  }

  /**
   * Sets the topic alias of the connection, if topic aliases are used, and encodes PUBLISH to write it.
   *
   * Call it right before writing, with no await in between. A topic alias is then resolved in the order the packets
   * are written, so it is sent without the Topic Name only after the PUBLISH that registers it (Topic Name and
   * Topic Alias) has been written.
   *
   * A PUBLISH that is too large only because it registers a new alias is sent without the alias,
   * and the alias is released: the broker never receives it.
   * @param packet PUBLISH with its Topic Name and without a topic alias.
   * @param bytes `packet` already encoded, if any.
   * @returns the packet to write and its bytes.
   * @throws {PacketTooLargeError}
   * @throws {MqttPacketSerializeError} if the packet cannot be encoded for another reason.
   */
  private encodePublishToWrite(packet: PublishPacket, bytes?: Uint8Array): [PublishPacket, Uint8Array] {
    const topicAliasManager = this.topicAliasManagerAboutSend;
    if (topicAliasManager) {
      const [generated, topicAlias] = topicAliasManager.getTopicId(packet.topic);
      const aliased: PublishPacket = {
        ...packet,
        topic: generated ? packet.topic : '',
        properties: { ...packet.properties, topicAlias },
      };
      try {
        return [aliased, this.encodePacket(aliased)];
      } catch (err) {
        if (generated) {
          topicAliasManager.releaseTopic(packet.topic);
        }
        // An alias already registered makes the packet smaller, with an empty Topic Name: it does not fit without the alias either.
        if (!generated || !(err instanceof PacketTooLargeError)) {
          throw err;
        }
        this.log('PUBLISH is too large with a new topic alias, sending it without the alias', err);
      }
    }
    return [packet, bytes ?? this.encodePacket(packet)];
  }

  /**
   * Subscribes to a topic filter and waits for SUBACK.
   * A rejection of an ignored promise does not terminate the process; await the promise to handle failures.
   * @param topicFilter topic name or topic filter
   * @param qos QoS level. Defaults to `Mqtt.QoS.AT_MOST_ONCE`.
   * @param properties MQTT 5.0 SUBSCRIBE properties ({@link MqttProperties.SubscribeProperties}).
   * @returns the reason codes of SUBACK ({@link SubscribeResults}).
   * @throws {StateIsNotOnlineError} if the client is not connected.
   * @throws {InvalidTopicFilterError} if a topic filter is invalid. Nothing is sent.
   * @throws {InvalidArgumentError} if no topic filter is given, or a QoS, Retain Handling or No Local is invalid. Nothing is sent.
   * @throws {InvalidPropertyError} if a property, e.g. the Subscription Identifier, is invalid. Nothing is sent.
   * @throws {WildcardSubscriptionsNotSupportedError} if a topic filter has a wildcard and the broker does not support them. Nothing is sent.
   * @throws {SharedSubscriptionsNotSupportedError} if a topic filter is a shared subscription and the broker does not support them. Nothing is sent.
   * @throws {SubscriptionIdentifiersNotSupportedError} if a Subscription Identifier is set and the broker does not support them. Nothing is sent.
   * @throws {PacketTooLargeError} if SUBSCRIBE is larger than the Maximum Packet Size of the broker or than MQTT allows. Nothing is sent.
   * @throws {ConnectionClosed} if the connection is closed before SUBACK is received.
   * @example
   * ```ts
   * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.subscribe('topicA', Mqtt.QoS.AT_MOST_ONCE);
   * ```
   */
  public subscribe(
    topicFilter: string,
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults>;

  /**
   * Subscribes to multiple topic filters with one SUBSCRIBE packet and waits for SUBACK.
   * A rejection of an ignored promise does not terminate the process; await the promise to handle failures.
   * @param topicFilters topic names or topic filters
   * @param qos QoS level. Defaults to `Mqtt.QoS.AT_MOST_ONCE`.
   * @param properties MQTT 5.0 SUBSCRIBE properties ({@link MqttProperties.SubscribeProperties}).
   * @returns the reason codes of SUBACK ({@link SubscribeResults}).
   * @throws {StateIsNotOnlineError} if the client is not connected.
   * @throws {InvalidTopicFilterError} if a topic filter is invalid. Nothing is sent.
   * @throws {InvalidArgumentError} if no topic filter is given, or a QoS, Retain Handling or No Local is invalid. Nothing is sent.
   * @throws {InvalidPropertyError} if a property, e.g. the Subscription Identifier, is invalid. Nothing is sent.
   * @throws {WildcardSubscriptionsNotSupportedError} if a topic filter has a wildcard and the broker does not support them. Nothing is sent.
   * @throws {SharedSubscriptionsNotSupportedError} if a topic filter is a shared subscription and the broker does not support them. Nothing is sent.
   * @throws {SubscriptionIdentifiersNotSupportedError} if a Subscription Identifier is set and the broker does not support them. Nothing is sent.
   * @throws {PacketTooLargeError} if SUBSCRIBE is larger than the Maximum Packet Size of the broker or than MQTT allows. Nothing is sent.
   * @throws {ConnectionClosed} if the connection is closed before SUBACK is received.
   * @example
   * ```ts
   * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.subscribe(['topicA', 'topicB'], Mqtt.QoS.AT_MOST_ONCE);
   * ```
   */
  public subscribe(
    topicFilters: string[],
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults>;

  /**
   * Subscribes to a topic filter with MQTT 5.0 subscription options and waits for SUBACK.
   * A rejection of an ignored promise does not terminate the process; await the promise to handle failures.
   * @param subscription topic filter and subscription options ({@link SubscriptionOption}). Its `qos` takes precedence over the `qos` argument.
   * @param qos QoS level. Defaults to `Mqtt.QoS.AT_MOST_ONCE`.
   * @param properties MQTT 5.0 SUBSCRIBE properties ({@link MqttProperties.SubscribeProperties}).
   * @returns the reason codes of SUBACK ({@link SubscribeResults}).
   * @throws {StateIsNotOnlineError} if the client is not connected.
   * @throws {InvalidTopicFilterError} if a topic filter is invalid. Nothing is sent.
   * @throws {InvalidArgumentError} if no topic filter is given, or a QoS, Retain Handling or No Local is invalid. Nothing is sent.
   * @throws {InvalidPropertyError} if a property, e.g. the Subscription Identifier, is invalid. Nothing is sent.
   * @throws {WildcardSubscriptionsNotSupportedError} if a topic filter has a wildcard and the broker does not support them. Nothing is sent.
   * @throws {SharedSubscriptionsNotSupportedError} if a topic filter is a shared subscription and the broker does not support them. Nothing is sent.
   * @throws {SubscriptionIdentifiersNotSupportedError} if a Subscription Identifier is set and the broker does not support them. Nothing is sent.
   * @throws {PacketTooLargeError} if SUBSCRIBE is larger than the Maximum Packet Size of the broker or than MQTT allows. Nothing is sent.
   * @throws {ConnectionClosed} if the connection is closed before SUBACK is received.
   * @example
   * ```ts
   * import { Mqtt, MqttClient } from '@ymjacky/mqtt5';
   *
   * const client = new MqttClient();
   *
   * await client.subscribe({ topicFilter: 'topicA', qos: Mqtt.QoS.AT_MOST_ONCE, retainHandling: Mqtt.RetainHandling.DoNotSend, retainAsPublished: true, noLocal: true });
   * ```
   */
  public subscribe(
    subscription: SubscriptionOption,
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults>;

  /**
   * Subscribes to multiple topic filters with subscription options with one SUBSCRIBE packet and waits for SUBACK.
   * A rejection of an ignored promise does not terminate the process; await the promise to handle failures.
   * @param subscriptions topic filters and subscription options ({@link SubscriptionOption}). Their `qos` takes precedence over the `qos` argument.
   * @param qos QoS level. Defaults to `Mqtt.QoS.AT_MOST_ONCE`.
   * @param properties MQTT 5.0 SUBSCRIBE properties ({@link MqttProperties.SubscribeProperties}).
   * @returns the reason codes of SUBACK ({@link SubscribeResults}).
   * @throws {StateIsNotOnlineError} if the client is not connected.
   * @throws {InvalidTopicFilterError} if a topic filter is invalid. Nothing is sent.
   * @throws {InvalidArgumentError} if no topic filter is given, or a QoS, Retain Handling or No Local is invalid. Nothing is sent.
   * @throws {InvalidPropertyError} if a property, e.g. the Subscription Identifier, is invalid. Nothing is sent.
   * @throws {WildcardSubscriptionsNotSupportedError} if a topic filter has a wildcard and the broker does not support them. Nothing is sent.
   * @throws {SharedSubscriptionsNotSupportedError} if a topic filter is a shared subscription and the broker does not support them. Nothing is sent.
   * @throws {SubscriptionIdentifiersNotSupportedError} if a Subscription Identifier is set and the broker does not support them. Nothing is sent.
   * @throws {PacketTooLargeError} if SUBSCRIBE is larger than the Maximum Packet Size of the broker or than MQTT allows. Nothing is sent.
   * @throws {ConnectionClosed} if the connection is closed before SUBACK is received.
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
  public subscribe(
    subscriptions: SubscriptionOption[],
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults>;

  /**
   * Subscribes to one or more topic filters and waits for SUBACK.
   */
  public subscribe(
    input: SubscriptionOption | string | (SubscriptionOption | string)[],
    qos?: Mqtt.QoS,
    properties?: MqttProperties.SubscribeProperties,
  ): Promise<SubscribeResults> {
    const deferred = createRequestDeferred<SubscribeResults>();
    this.sendSubscribe(input, qos, properties, deferred).catch((err) => deferred.reject(err));
    return deferred.promise;
  }

  /** Sends SUBSCRIBE for subscribe(). SUBACK settles `deferred`. */
  private async sendSubscribe(
    input: SubscriptionOption | string | (SubscriptionOption | string)[],
    qos: Mqtt.QoS | undefined,
    properties: MqttProperties.SubscribeProperties | undefined,
    deferred: Deferred<SubscribeResults>,
  ): Promise<void> {
    if (this.connectionState !== 'online') {
      throw new StateIsNotOnlineError('subscribe');
    }

    const arr = Array.isArray(input) ? input : [input];
    const subs = arr.map<SubscriptionOption>((sub) => {
      return (typeof sub === 'object')
        ? {
          topicFilter: sub.topicFilter,
          qos: sub.qos ?? qos ?? Mqtt.QoS.AT_MOST_ONCE,
          retainHandling: sub.retainHandling,
          retainAsPublished: sub.retainAsPublished,
          noLocal: sub.noLocal,
        }
        : { topicFilter: sub, qos: qos ?? Mqtt.QoS.AT_MOST_ONCE };
    });
    validateSubscribe(subs, properties, this.protocolVersion);
    validateSubscribeCapabilities(subs, properties, this.brokerCapabilities);

    const packet: SubscribePacket = {
      type: 'subscribe',
      packetId: await this.session.acquirePacketId(),
      subscriptions: subs,
      properties: properties,
    };
    await this.session.storeSubscribe(packet, deferred);
    try {
      await this.sendPacket(packet);
    } catch (err) {
      this.session.discardSubscribeRequest(packet.packetId);
      throw err;
    }
  }

  /**
   * Unsubscribes from a topic filter and waits for UNSUBACK.
   * A rejection of an ignored promise does not terminate the process; await the promise to handle failures.
   * @param topicFilter topic name or topic filter
   * @param properties MQTT 5.0 UNSUBSCRIBE properties ({@link MqttProperties.UnsubscribeProperties}).
   * @returns the reason codes of UNSUBACK ({@link UnsubscribeResults}).
   * @throws {StateIsNotOnlineError} if the client is not connected.
   * @throws {InvalidTopicFilterError} if a topic filter is invalid. Nothing is sent.
   * @throws {InvalidArgumentError} if no topic filter is given. Nothing is sent.
   * @throws {InvalidPropertyError} if a property is invalid. Nothing is sent.
   * @throws {PacketTooLargeError} if UNSUBSCRIBE is larger than the Maximum Packet Size of the broker or than MQTT allows. Nothing is sent.
   * @throws {ConnectionClosed} if the connection is closed before UNSUBACK is received.
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
  public unsubscribe(topicFilter: string, properties?: MqttProperties.UnsubscribeProperties): Promise<UnsubscribeResults>;

  /**
   * Unsubscribes from multiple topic filters with one UNSUBSCRIBE packet and waits for UNSUBACK.
   * A rejection of an ignored promise does not terminate the process; await the promise to handle failures.
   * @param topicFilters topic names or topic filters
   * @param properties MQTT 5.0 UNSUBSCRIBE properties ({@link MqttProperties.UnsubscribeProperties}).
   * @returns the reason codes of UNSUBACK ({@link UnsubscribeResults}).
   * @throws {StateIsNotOnlineError} if the client is not connected.
   * @throws {InvalidTopicFilterError} if a topic filter is invalid. Nothing is sent.
   * @throws {InvalidArgumentError} if no topic filter is given. Nothing is sent.
   * @throws {InvalidPropertyError} if a property is invalid. Nothing is sent.
   * @throws {PacketTooLargeError} if UNSUBSCRIBE is larger than the Maximum Packet Size of the broker or than MQTT allows. Nothing is sent.
   * @throws {ConnectionClosed} if the connection is closed before UNSUBACK is received.
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
  public unsubscribe(topicFilters: string[], properties?: MqttProperties.UnsubscribeProperties): Promise<UnsubscribeResults>;

  /**
   * Unsubscribes from one or more topic filters and waits for UNSUBACK.
   */
  public unsubscribe(
    input: string | string[],
    properties?: MqttProperties.UnsubscribeProperties,
  ): Promise<UnsubscribeResults> {
    const deferred = createRequestDeferred<UnsubscribeResults>();
    this.sendUnsubscribe(input, properties, deferred).catch((err) => deferred.reject(err));
    return deferred.promise;
  }

  /** Sends UNSUBSCRIBE for unsubscribe(). UNSUBACK settles `deferred`. */
  private async sendUnsubscribe(
    input: string | string[],
    properties: MqttProperties.UnsubscribeProperties | undefined,
    deferred: Deferred<UnsubscribeResults>,
  ): Promise<void> {
    if (this.connectionState !== 'online') {
      throw new StateIsNotOnlineError('unsubscribe');
    }

    const unsubs = Array.isArray(input) ? input : [input];
    validateUnsubscribe(unsubs, properties, this.protocolVersion);

    const packet: UnsubscribePacket = {
      type: 'unsubscribe',
      packetId: await this.session.acquirePacketId(),
      topicFilters: unsubs,
      properties,
    };

    await this.session.storeUnsubscribe(packet, deferred);
    try {
      await this.sendPacket(packet);
    } catch (err) {
      this.session.discardSubscribeRequest(packet.packetId);
      throw err;
    }
  }

  /**
   * Disconnects from the broker.
   *
   * Normally sends DISCONNECT and waits for the connection to close (closes it after `disconnectTimeoutMS`).
   * DISCONNECT is sent after the PUBLISH packets of the publish() calls made before, so they are not lost;
   * their QoS 1 and 2 flows may not complete before the connection closes.
   * Nothing is sent after DISCONNECT: until the connection is closed, publish(), subscribe() and unsubscribe() reject with
   * `StateIsNotOnlineError` as when the client is not connected, and received messages are not acknowledged
   * (the broker sends QoS 1 and 2 messages again after reconnecting, if it keeps the session).
   * With `force`, closes the connection without sending DISCONNECT, so the broker publishes the will message.
   * Resolves immediately if the client is not connected.
   * While connect() is in progress, waits for it and then disconnects; if connect() fails, resolves, as the client is
   * offline then. With `force`, gives up connect() at once instead: connect() rejects with `ConnectionClosed`.
   * If a disconnect is already in progress, waits for the same close without sending DISCONNECT again;
   * with `force`, closes the connection now instead of waiting for the broker. `properties` of this call are ignored.
   * The Reason String and User Properties are left out if they make DISCONNECT larger than the Maximum Packet Size of the broker.
   * If a property is invalid, or DISCONNECT cannot be encoded, the promise rejects, nothing is sent and the connection stays open.
   *
   * @param force `true` to close without sending DISCONNECT.
   * @param properties MQTT 5.0 DISCONNECT properties ({@link MqttProperties.DisconnectProperties}). A Session Expiry Interval
   * other than 0 can be set only when the Session Expiry Interval of CONNECT was not 0 (and not absent).
   * @throws {InvalidPropertyError} if a property is invalid, e.g. a Session Expiry Interval other than 0 when that of CONNECT
   * was 0 or absent: the broker would not treat DISCONNECT as valid, and would publish the will message. Nothing is sent.
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
   * // The Session Expiry Interval can be changed in DISCONNECT because CONNECT has one other than 0.
   * await client.connect({ properties: { sessionExpiryInterval: 3600 } });
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
      if (force && (this.connectionState === 'online' || this.connectionState === 'disconnecting')) {
        // Do not wait for the broker or disconnectTimeoutMS to close the connection.
        await this.close();
      } else if (force && this.connectionState === 'connecting') {
        // Do not wait for the connect() in progress.
        this.abortConnect?.(new ConnectionClosed());
      }
      return waitForClose.promise;
    }

    const deferred = new Deferred<void>();
    this.waitForClose = deferred;

    if (this.connectionState === 'connecting') {
      if (force) {
        // Give up the connect() in progress: it rejects with ConnectionClosed, and detectClosed() resolves this call.
        this.log('A disconnect request was accepted while connecting: giving up connect()');
        this.abortConnect?.(new ConnectionClosed());
        return deferred.promise;
      }
      this.log('A disconnect request was accepted while connecting: waiting for connect()');
      try {
        await this.unresolvedConnect?.promise;
      } catch {
        // connect() failed: there is no connection to close, and the client is offline, which is what was asked for.
        // The error is reported by connect().
      }
    }

    if (this.connectionState === 'offline') {
      if (this.waitForClose === deferred) {
        this.waitForClose = undefined;
      }
      deferred.resolve();
    } else {
      try {
        if (force) {
          await this.doDisconnect(true);
        } else {
          // Checked before waiting for the publish() calls made before: if a property is invalid, nothing is sent and the
          // connection stays open. The rules depend on the CONNECT of the connection, which is known now.
          validateDisconnect(properties, this.connectProperties, this.protocolVersion);
          // Nothing may be sent after DISCONNECT [MQTT-3.14.4-1]. Take a turn in the publish queue: the messages of the
          // publish() calls made before are sent first, and the calls made after wait until DISCONNECT is sent, and reject.
          const publishTurnFinished = await this.waitForPublishTurn();
          try {
            await this.doDisconnect(false, undefined, properties);
          } finally {
            publishTurnFinished();
          }
        }
      } catch (err) {
        // DISCONNECT was not sent (e.g. a property cannot be encoded), so the connection may stay open.
        // Do not leave this and later calls waiting for a close that may not come.
        if (this.waitForClose === deferred) {
          this.waitForClose = undefined;
        }
        deferred.resolve();
        throw err;
      }
    }

    return deferred.promise;
  }

  /**
   * Closes the connection when `force` is true, otherwise sends DISCONNECT and waits for the broker to close it.
   * From DISCONNECT on, the client is `disconnecting`: it sends nothing more, and publish(), subscribe() and unsubscribe() reject.
   * @throws if DISCONNECT cannot be encoded. Nothing is sent then, and the client stays online.
   * @ignore
   */
  protected async doDisconnect(
    force: boolean = false,
    reasonCode?: Mqtt.ReasonCode,
    properties?: MqttProperties.Properties,
  ): Promise<void> {
    if (force) {
      if (this.connectionState === 'online' || this.connectionState === 'disconnecting') {
        await this.close();
      }
      return;
    }
    if (this.connectionState !== 'online') {
      // Not connected, or DISCONNECT has been sent already.
      return;
    }

    const disconnectPacket: DisconnectPacket = {
      type: 'disconnect',
      ...(reasonCode !== undefined && { reasonCode }),
      ...(properties && { properties }),
    };
    const bytes = this.encodePacket(disconnectPacket);

    this.connectionState = 'disconnecting';
    this.stopKeepAliveTimer();
    this.stopPingrespTimer();
    // Started before writing: the connection is closed in time also when the write does not complete.
    this.startDisconnectTimer();
    try {
      await this.sendPacket(disconnectPacket, bytes);
    } catch (err) {
      // The connection does not work any more: close it instead of waiting for the broker to do it.
      this.log('DISCONNECT could not be written, closing the connection', err);
      await this.close();
    }
  }

  /**
   * Sends AUTH (MQTT 5.0 enhanced authentication). Receive AUTH from the broker with the `auth` event.
   * The returned promise resolves when AUTH is sent.
   * A rejection of an ignored promise does not terminate the process; await the promise to handle failures.
   * @param reasonCode a {@link Mqtt.ReasonCode}, e.g. `Mqtt.ReasonCode.ContinueAuthentication` or `Mqtt.ReasonCode.ReAuthenticate`.
   * @param properties AUTH properties ({@link MqttProperties.AuthProperties}), such as `authenticationMethod` and `authenticationData`.
   * The Reason String and User Properties are left out if they make AUTH larger than the Maximum Packet Size of the broker.
   * @throws {SendPacketError} if the client is not connected.
   * @throws {PacketTooLargeError} if AUTH is larger than the Maximum Packet Size of the broker even without the Reason String
   * and User Properties. Nothing is sent.
   */
  public auth(
    reasonCode?: Mqtt.ReasonCode,
    properties?: MqttProperties.AuthProperties,
  ): Promise<void> {
    const deferred = createRequestDeferred<void>();
    const packet: AuthPacket = {
      type: 'auth',
      reasonCode,
      properties,
    };
    this.sendPacket(packet).then(() => deferred.resolve(), (err) => deferred.reject(err));
    return deferred.promise;
  }

  /**
   * Writes bytes to the connection that is open, and settles when they have been written.
   * @throws {SendPacketError} if no connection has been opened.
   * @ignore
   */
  protected abstract write(bytes: Uint8Array): Promise<void>;

  /**
   * Closes the transport connection.
   * @ignore
   */
  protected abstract close(): Promise<void>;

  /**
   * Handles a malformed packet per protocol version: closes the connection (MQTT 3.1.1)
   * or sends DISCONNECT with the MalformedPacket reason code (MQTT 5.0).
   * @ignore
   */
  protected async handleMalformedPacket(error: Error): Promise<void> {
    try {
      this.log('handling malformed packet', error);
      // Note: We don't send PUBACK/PUBREC/AUTH responses for malformed packets
      // because we cannot trust the packet type or content in malformed data
      await this.disconnectWithError(Mqtt.ReasonCode.MalformedPacket);
    } catch (handlingError) {
      // If we can't even send error responses, just log and close
      this.log('Error while handling malformed packet:', handlingError);
    }
  }

  /**
   * Handles a packet that can be read but is a Protocol Error, e.g. a property that is included more than once:
   * sends DISCONNECT with the ProtocolError reason code (MQTT 5.0 4.13), or closes the connection (MQTT 3.1.1).
   */
  private async handleProtocolViolation(error: Error): Promise<void> {
    try {
      this.log('handling a packet that is a protocol error', error);
      await this.disconnectWithError(Mqtt.ReasonCode.ProtocolError);
    } catch (handlingError) {
      this.log('Error while handling a packet that is a protocol error:', handlingError);
    }
  }

  /**
   * Handles a packet larger than the Maximum Packet Size sent in CONNECT, which the broker must not send [MQTT-3.1.2-24]:
   * sends DISCONNECT with the PacketTooLarge reason code (MQTT 5.0 3.1.2.11.4). The packet is not received.
   */
  private async handlePacketTooLarge(error: Error): Promise<void> {
    try {
      this.log('handling a packet larger than the Maximum Packet Size', error);
      await this.disconnectWithError(Mqtt.ReasonCode.PacketTooLarge);
    } catch (handlingError) {
      this.log('Error while handling a packet larger than the Maximum Packet Size:', handlingError);
    }
  }

  /**
   * Ends the connection because of an error: sends DISCONNECT with `reasonCode` (MQTT 5.0),
   * or closes the connection (MQTT 3.1.1). The broker publishes the Will Message.
   */
  private async disconnectWithError(reasonCode: Mqtt.ReasonCode): Promise<void> {
    if (this.protocolVersion === Mqtt.ProtocolVersion.MQTT_V3_1_1) {
      // MQTT v3.1.1: DISCONNECT has no reason code and unconditionally signals a
      // clean disconnect, which also causes the broker to discard the Will message.
      // Since this is an abnormal condition, close the connection directly instead of
      // sending a misleading DISCONNECT.
      this.log('Closing connection (v3.1.1) because of an error');
      await this.close();
    } else {
      this.log(`Sending DISCONNECT (v5.0) with reason code ${reasonCode}`);
      await this.doDisconnect(false, reasonCode);
    }
  }

  /**
   * Decode the bytes of a single complete MQTT packet and dispatch it.
   * Called by subclasses once a packet has been framed off the transport.
   *
   * Decoding and dispatching are done before the method returns, so packets are processed in the order this method is
   * called, also when the caller does not wait for the returned promise. A malformed packet, or one that is a Protocol
   * Error, is handled per protocol version, and the returned promise resolves when that handling completes. It rejects
   * with any other error.
   * @ignore
   */
  protected async handleReceivedBytes(receiveBytes: Uint8Array): Promise<void> {
    this.log('receive bytes', receiveBytes);

    let packet: AnyPacket;
    try {
      packet = MqttPackets.decode(receiveBytes, this.protocolVersion);
    } catch (decodeError) {
      if (!(decodeError instanceof MqttPackets.MqttPacketsError.MqttPacketParseError)) {
        // Not caused by malformed data from the peer; treat as a fatal/unexpected error.
        throw decodeError;
      }

      if (decodeError.cause instanceof MqttUtils.MqttUtilsError.ProtocolViolationError) {
        this.log(`Packet that is a protocol error received: ${decodeError.cause.message}`);
        this.log(`Raw bytes (first 20): ${receiveBytes.slice(0, 20)}`);
        await this.handleProtocolViolation(decodeError);
        return;
      }

      this.log(`Malformed packet received: ${decodeError.message}`);
      this.log(`Raw bytes (first 20): ${receiveBytes.slice(0, 20)}`);

      // Send appropriate response based on protocol version
      await this.handleMalformedPacket(decodeError);
      return;
    }

    this.log('receive packet', packet);
    this.packetReceived(packet);
  }

  /**
   * Creates the buffer that splits the bytes received on a new connection into packets. With MQTT 5.0, a packet larger than
   * the Maximum Packet Size sent in CONNECT is not received: the buffer throws, and handleFramingError() ends the connection.
   * Called by subclasses when they open a connection, after CONNECT has been encoded.
   * @ignore
   */
  protected createFrameBuffer(): MqttStream.MqttFrameBuffer {
    // MQTT 3.1.1 CONNECT has no properties: the broker does not know of a limit.
    const maximumPacketSize = this.protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1 ? this.connectProperties?.maximumPacketSize : undefined;
    return new MqttStream.MqttFrameBuffer(maximumPacketSize);
  }

  /**
   * Handle an error raised while framing packets off the transport.
   *
   * A MalformedPacketError means the byte stream framing is desynchronized
   * (e.g. an invalid Remaining Length), and a PacketTooLargeToReceiveError that
   * the next packet is larger than the Maximum Packet Size of CONNECT. Both are
   * handled per protocol version and the returned promise resolves when that
   * handling completes. Subclasses must stop interpreting further bytes on the
   * connection afterwards. The returned promise rejects with any other error,
   * which is not caused by data from the peer.
   * @ignore
   */
  protected async handleFramingError(streamError: unknown): Promise<void> {
    if (streamError instanceof MqttStream.PacketTooLargeToReceiveError) {
      this.log(`Packet too large received (framing error): ${streamError.message}`);
      await this.handlePacketTooLarge(streamError);
      return;
    }
    if (!(streamError instanceof MalformedPacketError)) {
      throw streamError;
    }

    this.log(`Malformed packet received (framing error): ${streamError.message}`);
    await this.handleMalformedPacket(streamError);
  }

  /**
   * Called by subclasses when the connection is closed: stops the timers and emits the `closed` event.
   * @ignore
   */
  protected detectClosed(): void {
    this.log('connection closed.');
    // A connect() that has not settled yet ends with this connection. Taken before the `closed` event is emitted:
    // a listener may call connect() again.
    const pendingConnect = this.unresolvedConnect;
    const refusedConnack = this.refusedConnack;
    const connectFailure = this.connectFailure ?? new ConnectionClosed();
    this.unresolvedConnect = undefined;
    this.refusedConnack = undefined;
    this.abortConnect = undefined;
    this.connectionState = 'offline';
    this.closedConnections++;
    this.stopConnectTimer();
    this.stopDisconnectTimer();
    this.stopKeepAliveTimer();
    this.stopPingrespTimer();

    // SUBACK and UNSUBACK will not arrive: SUBSCRIBE and UNSUBSCRIBE are not resent after reconnecting.
    this.session.abortSubscribeRequests();
    // A publish() or the resending waiting for the send quota stops waiting: the connection is closed.
    this.session.wakeSendQuotaWaiters();

    if (this.waitForClose) {
      this.waitForClose.resolve();
      this.waitForClose = undefined;
    }

    this.eventTarget.dispatchEvent(
      createCustomEvent('closed', {}),
    );

    // Settled after the client is offline, so that connect() can be called again right away.
    if (refusedConnack) {
      pendingConnect?.resolve(refusedConnack);
    } else {
      pendingConnect?.reject(connectFailure);
    }
  }

  /**
   * Dispatch a received packet to its handler.
   *
   * Handlers run one at a time in the order packets were received, so a
   * handler awaiting e.g. a store never lets a later packet overtake it. A
   * failure inside a handler is logged instead of becoming an unhandled
   * rejection. A packet that a broker must not send is a protocol error,
   * which ends the connection.
   * @ignore
   */
  protected packetReceived(packet: AnyPacket): void {
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
        // CONNECT, SUBSCRIBE, UNSUBSCRIBE and PINGREQ are sent by a client only.
        handle = () => this.handleUnexpectedPacket(packet);
        break;
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
  private async handleConnack(packet: ConnackPacket): Promise<void> {
    const pendingConnect = this.unresolvedConnect;
    if (this.connectionState !== 'connecting' || this.connectFailure || !pendingConnect) {
      // No connect() is waiting for it, e.g. it has timed out and the connection is being closed.
      this.log('CONNACK is ignored: connect() is not waiting for it', packet);
      return;
    }
    this.stopConnectTimer();

    const accepted = this.protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1
      ? packet.reasonCode === Mqtt.ReasonCode.Success
      : packet.returnCode === Mqtt.V3_1_1_ConnectReturnCode.ConnectionAccepted;
    if (!accepted) {
      this.log(`connection refused by the broker. reasonCode:${packet.reasonCode} returnCode:${packet.returnCode}`);
      // The client does not become online, and does not wait for the broker to close the connection.
      // connect() resolves with this CONNACK when the connection is closed (detectClosed()): the client is offline then,
      // so connect() can be called again right away.
      this.refusedConnack = packet;
      this.eventTarget.dispatchEvent(
        createCustomEvent('connack', { detail: packet }),
      );
      await this.close();
      return;
    }

    this.connectionState = 'online';
    // What the broker accepts is set together with the state, with no await in between: publish(), subscribe() and
    // unsubscribe() can be called from now on, and check it. A property that is absent means that it is supported;
    // MQTT 3.1.1 has none of these properties.
    this.brokerCapabilities = brokerCapabilitiesOf(packet.properties);
    this.maximumPacketSizeAboutSend = packet.properties?.maximumPacketSize;
    // publish() can be called from now on. Take a turn in the publish queue before any await: the calls wait until
    // the session and the settings of the connection are updated and the packets kept in the session are resent.
    // Otherwise a new PUBLISH could be written before the resent ones, or get the packet ID of a stored packet
    // that is not registered yet, when the store has packets of a previous process.
    const publishTurn = this.waitForPublishTurn();
    // False once the connection has been closed, which settles connect(): then nothing is done for this CONNACK any more,
    // as connect() may have been called again.
    const connectPending = () => this.unresolvedConnect === pendingConnect;

    let resendTargets: ResendTarget[] | undefined;
    const publishTurnFinished = await publishTurn;
    try {
      resendTargets = await this.startSession(packet, connectPending);
    } catch (err) {
      if (connectPending()) {
        // The session cannot be used as it is, e.g. the store could not be cleared or read: do not go on with this connection.
        // connect() rejects with the error when the connection is closed (detectClosed()).
        this.log('cannot update the session on CONNACK, ending the connection', err);
        this.connectFailure = err instanceof Error ? err : new Error(String(err));
        await this.disconnectWithError(Mqtt.ReasonCode.UnspecifiedError);
      } else {
        this.log('error after the connection of the CONNACK was closed:', err);
      }
    } finally {
      // On success, the turn is kept for the resending below.
      if (!resendTargets) {
        publishTurnFinished();
      }
    }
    if (!resendTargets) {
      return;
    }
    // Taken before connect() resolves and the `connack` event is emitted: the resending belongs to this connection only.
    const connectionOpen = this.connectionOpen();

    this.unresolvedConnect = undefined;
    pendingConnect.resolve(packet);

    this.eventTarget.dispatchEvent(
      createCustomEvent('connack', { detail: packet }),
    );

    this.startKeepAliveTimer();

    // The packets kept in the session are resent after connect() has resolved, not before: a PUBLISH may have to wait for
    // the send quota, which only the acknowledgments handled after this CONNACK give back. The turn is kept until they have
    // been sent, so the publish() calls made meanwhile are sent after them.
    this.resendInOrder(resendTargets, connectionOpen)
      .catch((err) => this.log('error while resending the packets kept in the session:', err))
      .finally(publishTurnFinished);
  }

  /**
   * Updates the session and the settings of the connection from a CONNACK that accepts the connection,
   * and reads the packets kept in the session to resend.
   * @param connectPending whether connect() is still waiting: false once the connection has been closed.
   * @returns the packets to resend, in the order they were stored; undefined if the connection was closed meanwhile.
   */
  private async startSession(packet: ConnackPacket, connectPending: () => boolean): Promise<ResendTarget[] | undefined> {
    if (!connectPending()) {
      return undefined;
    }
    // A new connection starts with the whole send quota of the Receive Maximum of the broker (65,535 if absent). Reset here,
    // with the turn of the publish queue: no publish() of the previous connection is sending any more.
    this.session.resetSendQuota(packet.properties?.receiveMaximum);
    // server generates clientId
    if (packet.properties?.assignedClientIdentifier) {
      this.clientId = packet.properties.assignedClientIdentifier;
    }
    if (!packet.sessionPresent) {
      await this.session.clearAllStores(this.clientId);
      if (!connectPending()) {
        return undefined;
      }
    }

    // The Server Keep Alive replaces the Keep Alive sent in CONNECT for this connection, even when it is higher or 0.
    this.currentKeepAlive = packet.properties?.serverKeepAlive ?? this.keepAlive;

    // Topic aliases are valid per connection, and an absent Topic Alias Maximum means 0 (no aliases allowed).
    const topicAliasMaximum = Math.min(this.topicAliasMaximumAboutSend ?? 0, packet.properties?.topicAliasMaximum ?? 0);
    this.topicAliasManagerAboutSend = topicAliasMaximum > 0 ? new TopicAliasManager(topicAliasMaximum) : undefined;

    return this.readResendTargets(connectPending);
  }

  /**
   * Reads the PUBLISH and PUBREL packets kept in the session, to resend them on the connection that has just been
   * established, and encodes them. Done before connect() resolves, so that connect() rejects when the store cannot be read.
   * A packet that cannot be sent on this connection, e.g. larger than the Maximum Packet Size of the broker,
   * is removed from the session, and its publish() rejects with the error.
   * @param connectPending whether the connection is still the one to resend on: false once it has been closed.
   * @returns the packets to resend and their bytes, in the order they were stored; undefined if the connection was closed meanwhile.
   */
  private async readResendTargets(connectPending: () => boolean): Promise<ResendTarget[] | undefined> {
    const targets: ResendTarget[] = [];
    const unsendable: { packetId: number; err: Error }[] = [];
    for await (const packet of this.session.resendTargets()) {
      if (!connectPending()) {
        return undefined;
      }
      try {
        targets.push({ packet, bytes: this.encodePacket(packet) });
      } catch (err) {
        this.log(`can't resend ${packet.type} packet, removing it from the session`, packet, err);
        unsendable.push({ packetId: packet.packetId!, err: err as Error });
      }
    }
    if (!connectPending()) {
      return undefined;
    }
    // Removed after the iteration: an OutgoingStore does not have to support removing packets while iterating.
    for (const { packetId, err } of unsendable) {
      await this.session.discardPublishFlow(packetId, err);
    }
    return connectPending() ? targets : undefined;
  }

  /**
   * Resends the packets kept in the session, in the order they were stored [MQTT-4.6.0-1], after connect() has resolved.
   * A PUBLISH waits for the send quota of the Receive Maximum of the broker, as publish() does [MQTT-3.3.4-7]: the
   * acknowledgments of the packets resent before it give it back. A PUBREL is not limited, but its flow uses the quota
   * until PUBCOMP.
   * Stops when the connection is closed: the packets that are left stay in the session, to be resent after reconnecting.
   * @param connectionOpen whether the connection to resend on is still open.
   */
  private async resendInOrder(targets: ResendTarget[], connectionOpen: () => boolean): Promise<void> {
    for (const { packet, bytes } of targets) {
      if (packet.type === 'publish') {
        await this.session.waitForSendQuota(connectionOpen);
      }
      if (!connectionOpen()) {
        return;
      }
      // False if the flow has ended meanwhile: then the packet is not resent.
      if (this.session.useSendQuota(packet.packetId!)) {
        this.sendPacketInBackground(packet, bytes);
      }
    }
  }

  /** Handles PUBLISH: resolves the topic alias, sends PUBACK / PUBREC per QoS and emits the `publish` event. */
  private async handlePublish(packet: PublishPacket): Promise<void> {
    { // resolve topic alias
      if (packet.properties?.topicAlias) {
        if (packet.topic === '') {
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
      // A PUBLISH with DUP whose packet ID is stored is a message that has been emitted already: the broker sends it
      // again when it has not received PUBREC, e.g. the connection was closed. It is answered again, and not emitted again.
      const emitMessage = !packet.dup ||
        !(await this.incomingStore.has(packet.packetId!));

      if (emitMessage) {
        await this.incomingStore.store(packet.packetId!);
      }

      this.sendPacketInBackground(
        {
          type: 'pubrec',
          packetId: packet.packetId!,
        },
      );

      if (emitMessage) {
        this.eventTarget.dispatchEvent(
          createCustomEvent('publish', { detail: packet }),
        );
      }
    }
  }

  /**
   * Ends the flow of a sent PUBLISH on its acknowledgment (PUBACK, PUBCOMP, or PUBREC with an error Reason Code),
   * and resolves its publish() with the Reason Code.
   * If the packet cannot be removed from the store, the acknowledgment is handled as not received: the connection is
   * closed, and the stored packet is resent after reconnecting, to be acknowledged again. publish() keeps waiting.
   */
  private async completePublishFlow(packet: PubackPacket | PubrecPacket | PubcompPacket): Promise<void> {
    let deferred: Deferred<PublishResult> | undefined;
    try {
      deferred = await this.session.endPublishFlow(packet.packetId);
    } catch (err) {
      this.log(`cannot remove the flow from the store on ${packet.type}, closing the connection to continue it after reconnecting`, packet, err);
      await this.disconnectWithError(Mqtt.ReasonCode.UnspecifiedError);
      return;
    }
    if (packet.reasonCode) {
      deferred?.resolve({ result: packet.reasonCode, reason: packet.properties?.reasonString });
    } else {
      deferred?.resolve({ result: Mqtt.ReasonCode.Success });
    }
  }

  /** Handles PUBACK: completes a QoS 1 publish. */
  private async handlePuback(packet: PubackPacket): Promise<void> {
    if (await this.session.packetIdInUse(packet.packetId)) {
      await this.completePublishFlow(packet);
    } else {
      this.log(`Unknown packetId received, ignoring it. (packetId:${packet.packetId})`, 'puback');
    }
  }

  /** Handles PUBREC: sends PUBREL for a QoS 2 publish. */
  private async handlePubrec(packet: PubrecPacket): Promise<void> {
    if (await this.session.packetIdInUse(packet.packetId)) {
      // MUST send a PUBREL packet when it receives a PUBREC packet from the receiver with a Reason Code value less than 0x80.
      // This PUBREL packet MUST contain the same Packet Identifier as the original PUBLISH packet
      // see: https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901237
      if (
        packet.reasonCode && packet.reasonCode >= Mqtt.ReasonCode.UnspecifiedError // UnspecifiedError: 128
      ) {
        await this.completePublishFlow(packet);
        return;
      }

      const pubrel: PubrelPacket = {
        type: 'pubrel',
        packetId: packet.packetId,
      };

      // Store PUBREL before sending it, as PUBLISH is. It replaces the stored PUBLISH, which must not be resent
      // after PUBREL has been sent [MQTT-4.3.3-6], and the flow cannot complete before it is stored.
      try {
        await this.session.storePubrel(pubrel);
      } catch (err) {
        // PUBREL is not sent. The stored PUBLISH is resent after reconnecting, the broker answers it with PUBREC again,
        // and storing PUBREL is tried again. Nothing is resent while the connection is open, so close it.
        // publish() keeps waiting for the flow.
        this.log('cannot store PUBREL, closing the connection to continue the flow after reconnecting', pubrel, err);
        await this.disconnectWithError(Mqtt.ReasonCode.UnspecifiedError);
        return;
      }
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
  private async handlePubrel(packet: PubrelPacket): Promise<void> {
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
  private async handlePubcomp(packet: PubcompPacket): Promise<void> {
    if (await this.session.packetIdInUse(packet.packetId)) {
      await this.completePublishFlow(packet);
    } else {
      this.log(`Unknown packetId received, ignoring it. (packetId:${packet.packetId})`, 'pubcomp');
    }
  }

  /** Handles SUBACK: resolves `subscribe()`. */
  private async handleSuback(packet: SubackPacket): Promise<void> {
    if (await this.session.packetIdInUse(packet.packetId)) {
      const rvList = packet.reasonCodes ? packet.reasonCodes : packet.returnCodes;

      // Take the deferred before releasing the packet ID: a subscribe() that gets the ID again must not lose its own.
      const deferred = this.session.getSubscribeDeferred(packet.packetId);
      this.session.releasePacketId(packet.packetId);
      if (deferred) {
        const reason = packet.properties?.reasonString;
        deferred.resolve({ reasons: rvList!, reason });
      }
    } else {
      this.log(`Unknown packetId received, ignoring it. (packetId:${packet.packetId})`, 'suback');
    }
  }

  /** Handles UNSUBACK: resolves `unsubscribe()`. */
  private async handleUnsuback(packet: UnsubackPacket): Promise<void> {
    if (await this.session.packetIdInUse(packet.packetId)) {
      // Take the deferred before releasing the packet ID: an unsubscribe() that gets the ID again must not lose its own.
      const deferred = this.session.getUnsubscribeDeferred(packet.packetId);
      this.session.releasePacketId(packet.packetId);
      if (deferred) {
        if (packet.reasonCodes) {
          const reason = packet.properties?.reasonString;
          deferred.resolve({ reasonCodes: packet.reasonCodes, reason });
        } else {
          deferred.resolve({});
        }
      }
    } else {
      this.log(`Unknown packetId received, ignoring it. (packetId:${packet.packetId})`, 'unsuback');
    }
  }

  /** Handles PINGRESP: stops the PINGRESP timeout. */
  private handlePingresp(_packet: PingrespPacket): void {
    this.stopPingrespTimer();
  }

  /**
   * Handles DISCONNECT from the broker: emits the `disconnect` event and closes the connection.
   * The event is emitted first, so before `closed`: a `closed` listener, e.g. one that reconnects, knows why the broker disconnected.
   */
  private async handleDisconnect(packet: DisconnectPacket): Promise<void> {
    this.eventTarget.dispatchEvent(
      createCustomEvent('disconnect', { detail: packet }),
    );
    await this.close();
  }

  /** Handles AUTH: emits the `auth` event. */
  private handleAuth(packet: AuthPacket): void {
    this.eventTarget.dispatchEvent(
      createCustomEvent('auth', { detail: packet }),
    );
  }

  /**
   * Handles a packet that only a client sends (CONNECT, SUBSCRIBE, UNSUBSCRIBE, PINGREQ): a protocol error.
   * Ends the connection as for a malformed packet, with the ProtocolError reason code (MQTT 5.0).
   */
  private async handleUnexpectedPacket(packet: AnyPacket): Promise<void> {
    this.log(`${packet.type} packet must not be sent by a broker, ending the connection`, packet);
    await this.disconnectWithError(Mqtt.ReasonCode.ProtocolError);
  }

  /** Closes the connection if the broker does not close it within `disconnectTimeoutMS` after DISCONNECT. */
  private startDisconnectTimer(): void {
    this.startTimer(
      'disconnect',
      () => {
        this.close();
      },
      this.disconnectTimeout,
    );
  }
  /** Stops the timer started by startDisconnectTimer(). */
  private stopDisconnectTimer(): void {
    if (this.timerExists('disconnect')) {
      this.stopTimer('disconnect');
    }
  }

  /**
   * Gives up connect() if CONNACK is not received within `connectTimeoutMS`: aborts the opening of the connection,
   * or closes the connection. connect() rejects with ConnectTimeout when the client is offline again (detectClosed()).
   */
  private startConnectTimer(abortConnect: (reason: Error) => void): void {
    this.startTimer(
      'connect',
      () => {
        this.log('CONNACK was not received within connectTimeoutMS');
        abortConnect(new ConnectTimeout());
      },
      this.connectTimeout,
    );
  }
  /** Stops the timer started by startConnectTimer(). */
  private stopConnectTimer(): void {
    if (this.timerExists('connect')) {
      this.stopTimer('connect');
    }
  }

  /** Sends PINGREQ when nothing is sent within the keep alive interval. */
  private startKeepAliveTimer(): void {
    if (!this.currentKeepAlive) {
      return;
    }

    this.startTimer(
      'keepAlive',
      async () => {
        try {
          await this.sendPacket({ type: 'pingreq' });
        } catch (err) {
          // Nobody awaits this callback: a rejection would be unhandled, which terminates the process.
          // The connection does not work any more, so close it instead of waiting for PINGRESP.
          this.log('PINGREQ could not be sent, closing the connection', err);
          await this.close().catch((closeError) => this.log('failed to close the connection:', closeError));
          return;
        }
        // The connection may have been closed while PINGREQ was written.
        if (this.connectionState === 'online') {
          this.startPingrespTimer();
        }
      },
      this.currentKeepAlive * 1000,
    );
  }
  /** Stops the timer started by startKeepAliveTimer(). */
  private stopKeepAliveTimer(): void {
    if (this.timerExists('keepAlive')) {
      this.stopTimer('keepAlive');
    }
  }

  /**
   * Disconnects if PINGRESP is not received within `pingrespTimeoutMS`.
   * The timer of an earlier PINGREQ that is not answered yet keeps running: restarted on every PINGREQ, it would never
   * expire when `pingrespTimeoutMS` is not shorter than the keep alive interval.
   */
  private startPingrespTimer(): void {
    if (this.timerExists('pingrespTimeout')) {
      return;
    }
    this.startTimer('pingrespTimeout', () => {
      this.log('PINGRESP was not received within pingrespTimeoutMS');
      // Nobody awaits this callback: a rejection must not be left unhandled.
      this.disconnect(true).catch((err) => this.log('failed to close the connection:', err));
    }, this.pingrespTimeoutMs);
  }
  /** Stops the timer started by startPingrespTimer(). */
  private stopPingrespTimer(): void {
    if (this.timerExists('pingrespTimeout')) {
      this.stopTimer('pingrespTimeout');
    }
  }

  /** Starts the named timer, replacing the running one with the same name. */
  private startTimer(
    name: string,
    cb: (...args: unknown[]) => void,
    delay: number,
  ): void {
    if (this.timerExists(name)) {
      this.stopTimer(name);
    }

    this.timers[name] = setTimeout(() => {
      delete this.timers[name];
      cb();
    }, delay);
  }

  /** Stops the named timer. */
  private stopTimer(name: string): void {
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
   * | Event        | `event.detail`     | When                                                             |
   * | ------------ | ------------------ | ---------------------------------------------------------------- |
   * | `publish`    | `PublishPacket`    | A message is received.                                           |
   * | `connack`    | `ConnackPacket`    | CONNACK is received.                                             |
   * | `disconnect` | `DisconnectPacket` | The broker sends DISCONNECT (MQTT 5.0). Emitted before `closed`. |
   * | `auth`       | `AuthPacket`       | The broker sends AUTH (MQTT 5.0 enhanced authentication).        |
   * | `closed`     | -                  | The connection is closed, for any reason.                        |
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

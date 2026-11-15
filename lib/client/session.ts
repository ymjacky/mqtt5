import { IdProvider, MqttPackets } from '../mod.ts';
import { MemoryStore, OutgoingStore } from '../mqtt_store/mod.ts';
import { Deferred } from './promise.ts';
import { ConnectionClosed, SessionLostError } from './error.ts';
import { PublishResult, SubscribeResults, UnsubscribeResults } from './client_types.ts';

export class Session {
  private sessionId: string;

  private packetIdProvider: IdProvider.ReuseIdProvider;
  private inflightPublish: Map<number, Deferred<PublishResult>>;
  private inflightSubscribe: Map<number, Deferred<SubscribeResults>>;
  private inflightUnsubscribe: Map<number, Deferred<UnsubscribeResults>>;

  private outgoingStore: OutgoingStore;

  constructor(sessionId: string, outgoingStore?: OutgoingStore) {
    this.sessionId = sessionId;
    this.packetIdProvider = new IdProvider.ReuseIdProvider(1, 65535); // packetId range is 1 to 65535
    this.outgoingStore = outgoingStore || new MemoryStore();
    this.inflightPublish = new Map<number, Deferred<PublishResult>>();
    this.inflightSubscribe = new Map<number, Deferred<SubscribeResults>>();
    this.inflightUnsubscribe = new Map<number, Deferred<UnsubscribeResults>>();
  }

  public getSessionId() {
    return this.sessionId;
  }

  public async acquirePacketId() {
    return await this.packetIdProvider.acquire();
  }

  public async clearAllStores(newSessionId?: string) {
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    await this.outgoingStore.clear();

    // The PUBLISH flows waiting for an acknowledgment will never complete without the session.
    for (const deferred of this.inflightPublish.values()) {
      deferred.reject(new SessionLostError());
    }
    this.inflightPublish.clear();
    this.inflightSubscribe.clear();
    this.inflightUnsubscribe.clear();
    this.packetIdProvider.clear();
  }

  /**
   * Rejects the SUBSCRIBE and UNSUBSCRIBE requests waiting for an acknowledgment and releases their packet IDs.
   * Called when the connection is closed: unlike PUBLISH and PUBREL, they are not resent after reconnecting.
   */
  public abortSubscribeRequests() {
    for (const [packetId, deferred] of [...this.inflightSubscribe, ...this.inflightUnsubscribe]) {
      deferred.reject(new ConnectionClosed());
      this.packetIdProvider.release(packetId);
    }
    this.inflightSubscribe.clear();
    this.inflightUnsubscribe.clear();
  }

  /** Releases a packet ID that was acquired for a packet that is not sent. */
  public releasePacketId(packetId: number) {
    this.packetIdProvider.release(packetId);
  }

  /**
   * Removes the stored PUBLISH or PUBREL of a flow that cannot be resent, releases its packet ID
   * and rejects its publish() with `reason`.
   */
  public async discardPublishFlow(packetId: number, reason: Error) {
    await this.outgoingStore.discard(packetId);
    this.packetIdProvider.release(packetId);
    this.getPublishDeferred(packetId)?.reject(reason);
  }

  /** Removes a SUBSCRIBE or UNSUBSCRIBE that could not be sent, and releases its packet ID. */
  public discardSubscribeRequest(packetId: number) {
    this.inflightSubscribe.delete(packetId);
    this.inflightUnsubscribe.delete(packetId);
    this.packetIdProvider.release(packetId);
  }

  public async packetIdInUse(packetId: number) {
    return await this.packetIdProvider.inUse(packetId);
  }

  public async discard(
    packet:
      | MqttPackets.PubackPacket
      | MqttPackets.PubrecPacket
      | MqttPackets.PubcompPacket
      | MqttPackets.SubackPacket
      | MqttPackets.UnsubackPacket,
  ) {
    await this.packetIdProvider.release(packet.packetId);
    if (
      packet.type === 'puback' || packet.type === 'pubrec' ||
      packet.type === 'pubcomp'
    ) {
      await this.outgoingStore.discard(packet.packetId);
    }
  }

  public async *resendTargets(): AsyncIterable<MqttPackets.PublishPacket | MqttPackets.PubrelPacket> {
    for await (const packet of this.outgoingStore.resendIterator()) {
      if (packet.type === 'publish') {
        packet.dup = true;
      }
      if (packet.packetId) {
        this.packetIdProvider.registerIfNotInUse(packet.packetId);
      }
      yield packet;
    }
  }

  /**
   * Stores PUBLISH to resend it after reconnecting, and the deferred of its flow.
   * @param packet PUBLISH with its Topic Name and without a topic alias, which is valid only on the current connection.
   */
  public async storePublish(
    packet: MqttPackets.PublishPacket,
    deferred: Deferred<PublishResult>,
  ) {
    this.inflightPublish.set(packet.packetId!, deferred);
    return await this.outgoingStore.store(packet);
  }

  public async storePubrel(packet: MqttPackets.PubrelPacket) {
    return await this.outgoingStore.store(packet);
  }

  public getPublishDeferred(packetId: number) {
    const deferred = this.inflightPublish.get(packetId);
    this.inflightPublish.delete(packetId);
    return deferred;
  }

  public storeSubscribe(
    packet: MqttPackets.SubscribePacket,
    deferred: Deferred<SubscribeResults>,
  ) {
    this.inflightSubscribe.set(packet.packetId, deferred);
  }
  public getSubscribeDeferred(packetId: number) {
    const deferred = this.inflightSubscribe.get(packetId);
    this.inflightSubscribe.delete(packetId);
    return deferred;
  }

  public storeUnsubscribe(
    packet: MqttPackets.UnsubscribePacket,
    deferred: Deferred<UnsubscribeResults>,
  ) {
    this.inflightUnsubscribe.set(packet.packetId, deferred);
  }
  public getUnsubscribeDeferred(packetId: number) {
    const deferred = this.inflightUnsubscribe.get(packetId);
    this.inflightUnsubscribe.delete(packetId);
    return deferred;
  }

  public async publishInflightCount() {
    return await this.outgoingStore.count();
  }
}

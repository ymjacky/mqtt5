import { IdProvider, MqttPackets } from '../mod.ts';
import { MemoryStore, OutgoingStore } from '../mqtt_store/mod.ts';
import { Deferred } from './promise.ts';
import { ConnectionClosed, SessionLostError } from './error.ts';
import { PublishResult, SubscribeResults, UnsubscribeResults } from './client_types.ts';

// The Receive Maximum of a CONNACK that has none (MQTT 5.0 3.2.2.3.2), and of MQTT 3.1.1, which has no flow control.
const defaultReceiveMaximum = 65535;

export class Session {
  private sessionId: string;

  private packetIdProvider: IdProvider.ReuseIdProvider;
  private inflightPublish: Map<number, Deferred<PublishResult>>;
  private inflightSubscribe: Map<number, Deferred<SubscribeResults>>;
  private inflightUnsubscribe: Map<number, Deferred<UnsubscribeResults>>;

  private outgoingStore: OutgoingStore;

  // The packet IDs of the QoS 1 / QoS 2 flows that use the send quota of the current connection (MQTT 5.0 4.9): their PUBLISH
  // has been sent on it, or is about to be, and no PUBACK, PUBCOMP, or PUBREC with an error Reason Code has been received for
  // them. At most `receiveMaximum` PUBLISH packets may be in flight at a time [MQTT-3.3.4-7]. Each connection starts with the
  // whole quota: a flow kept in the session uses it again when its packet is resent on the connection.
  private quotaFlows = new Set<number>();
  // The Receive Maximum of the broker for the current connection.
  private receiveMaximum = defaultReceiveMaximum;
  // The publish() calls and the resending that wait for a flow to complete (see waitForSendQuota()).
  private sendQuotaWaiters: Deferred<void>[] = [];

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

  /** The size in bytes of the largest packet the store can keep, if it has a limit. */
  public get maximumStoredPacketSize(): number | undefined {
    return this.outgoingStore.maximumPacketSize;
  }

  public async acquirePacketId() {
    return await this.packetIdProvider.acquire();
  }

  /**
   * Acquires the packet ID of a QoS 1 / QoS 2 PUBLISH, which is sent on the current connection right after. Its flow uses
   * the send quota of the connection until it completes, or until the packet ID is released.
   */
  public async acquirePublishPacketId() {
    const packetId = await this.packetIdProvider.acquire();
    this.quotaFlows.add(packetId);
    return packetId;
  }

  /**
   * Starts the send quota of the connection that has just been established: no flow uses it yet (MQTT 5.0 4.9).
   * @param receiveMaximum the Receive Maximum of CONNACK. 65,535 if absent. 0 is a Protocol Error of the broker: it is
   * treated as absent, as it would stop publishing for good.
   */
  public resetSendQuota(receiveMaximum: number | undefined) {
    this.receiveMaximum = receiveMaximum ? receiveMaximum : defaultReceiveMaximum;
    this.quotaFlows.clear();
    this.wakeSendQuotaWaiters();
  }

  /**
   * Counts a flow kept in the session against the send quota of the current connection, when its packet is resent on it.
   * A PUBREL is counted too: the broker keeps the flow in flight until it sends PUBCOMP.
   * @returns false if the flow has ended meanwhile, e.g. the broker has acknowledged it: its packet must not be resent then.
   */
  public useSendQuota(packetId: number): boolean {
    if (!this.packetIdProvider.inUse(packetId)) {
      return false;
    }
    this.quotaFlows.add(packetId);
    return true;
  }

  /**
   * Waits until fewer than Receive Maximum flows use the send quota of the connection, so that one more QoS 1 / QoS 2 PUBLISH
   * can be sent [MQTT-3.3.4-7]. The PUBACK, PUBCOMP or PUBREC with an error Reason Code that ends a flow lets it go on.
   * It returns at once when the connection is closed, and the caller has to check that: the flows that are left are resent
   * after reconnecting, and nothing may be sent on a connection that is closed.
   * @param connectionOpen whether the connection is still open. It is checked again each time the wait ends.
   */
  public async waitForSendQuota(connectionOpen: () => boolean) {
    while (connectionOpen() && this.quotaFlows.size >= this.receiveMaximum) {
      const waiter = new Deferred<void>();
      this.sendQuotaWaiters.push(waiter);
      await waiter.promise;
    }
  }

  /** Ends the wait in waitForSendQuota(): the waiting calls check again whether they can go on. */
  public wakeSendQuotaWaiters() {
    const waiters = this.sendQuotaWaiters;
    this.sendQuotaWaiters = [];
    for (const waiter of waiters) {
      waiter.resolve();
    }
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
    this.quotaFlows.clear();
    this.wakeSendQuotaWaiters();
  }

  /**
   * Releases a packet ID. If its flow used the send quota of the connection, it no longer does, and a waiting publish()
   * or resend may go on.
   */
  private release(packetId: number) {
    this.packetIdProvider.release(packetId);
    if (this.quotaFlows.delete(packetId)) {
      this.wakeSendQuotaWaiters();
    }
  }

  /**
   * Rejects the SUBSCRIBE and UNSUBSCRIBE requests waiting for an acknowledgment and releases their packet IDs.
   * Called when the connection is closed: unlike PUBLISH and PUBREL, they are not resent after reconnecting.
   */
  public abortSubscribeRequests() {
    for (const [packetId, deferred] of [...this.inflightSubscribe, ...this.inflightUnsubscribe]) {
      deferred.reject(new ConnectionClosed());
      this.release(packetId);
    }
    this.inflightSubscribe.clear();
    this.inflightUnsubscribe.clear();
  }

  /** Releases a packet ID that was acquired for a packet that is not sent. */
  public releasePacketId(packetId: number) {
    this.release(packetId);
  }

  /**
   * Removes the stored PUBLISH or PUBREL of a flow that cannot be resent, releases its packet ID
   * and rejects its publish() with `reason`.
   */
  public async discardPublishFlow(packetId: number, reason: Error) {
    await this.outgoingStore.discard(packetId);
    this.release(packetId);
    this.getPublishDeferred(packetId)?.reject(reason);
  }

  /** Removes a SUBSCRIBE or UNSUBSCRIBE that could not be sent, and releases its packet ID. */
  public discardSubscribeRequest(packetId: number) {
    this.inflightSubscribe.delete(packetId);
    this.inflightUnsubscribe.delete(packetId);
    this.release(packetId);
  }

  public async packetIdInUse(packetId: number) {
    return await this.packetIdProvider.inUse(packetId);
  }

  /**
   * Ends the flow of a sent PUBLISH (PUBACK, PUBCOMP, or PUBREC with an error Reason Code): removes its packet from
   * the store, then releases the packet ID.
   * The ID is released last: until then no publish() can get it, so this flow cannot remove the packet of another
   * publish() from the store, nor take its deferred.
   * If the store fails, nothing changes, as if the acknowledgment had not been received.
   * @returns the deferred of the publish() of the flow, if it is waiting.
   */
  public async endPublishFlow(packetId: number): Promise<Deferred<PublishResult> | undefined> {
    await this.outgoingStore.discard(packetId);
    const deferred = this.getPublishDeferred(packetId);
    this.release(packetId);
    return deferred;
  }

  /**
   * Iterates over the stored PUBLISH and PUBREL packets to resend after reconnecting, and registers their packet IDs as in use.
   * They use the send quota of the connection only when they are resent: see useSendQuota().
   */
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
   * If the store fails, the deferred is not kept; the caller still has to release the packet ID.
   * @param packet PUBLISH with its Topic Name and without a topic alias, which is valid only on the current connection.
   */
  public async storePublish(
    packet: MqttPackets.PublishPacket,
    deferred: Deferred<PublishResult>,
  ) {
    this.inflightPublish.set(packet.packetId!, deferred);
    try {
      await this.outgoingStore.store(packet);
    } catch (err) {
      this.inflightPublish.delete(packet.packetId!);
      throw err;
    }
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

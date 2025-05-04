import { IdProvider, MqttPackets } from '../mod.ts';
import { MemoryStore, OutgoingStore } from '../mqtt_store/mod.ts';
import { Deferred } from './promise.ts';
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

  public async aquirePacketId() {
    return await this.packetIdProvider.aquire();
  }

  public async clearAllStores(newSessionId?: string) {
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    await this.outgoingStore.clear();
    this.inflightPublish.clear();
    this.inflightSubscribe.clear();
    this.inflightUnsubscribe.clear();
    this.packetIdProvider.clear();
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

  public async storePublish(
    packet: MqttPackets.PublishPacket,
    deferred: Deferred<PublishResult>,
    omittedTopic?: string,
  ) {
    this.inflightPublish.set(packet.packetId!, deferred);

    if (omittedTopic) {
      const copiedPacket = { ...packet };
      if (packet.properties) {
        copiedPacket.properties = { ...packet.properties };
        delete copiedPacket?.properties?.topicAlias;
      }

      // Restore omitted topics and then register them
      copiedPacket.topic = omittedTopic;
      return await this.outgoingStore.store(copiedPacket);
    } else {
      return await this.outgoingStore.store(packet);
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

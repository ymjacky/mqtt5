import { LruCache } from '../cache/mod.ts';
import { ReuseIdProvider } from '../id_provider/mod.ts';

/**
 * Assigns topic aliases to the topics of sent PUBLISH packets, on one connection.
 * The methods are synchronous: the client resolves the alias right before it writes PUBLISH, with no await in between,
 * so the aliases follow the order in which the packets are written.
 */
export class TopicAliasManager {
  private topicIdProvider: ReuseIdProvider;
  private topicAliasMap: LruCache<string, number>;

  constructor(topicAliasMaximum: number) {
    this.topicIdProvider = new ReuseIdProvider(1, topicAliasMaximum);
    this.topicAliasMap = new LruCache<string, number>(topicAliasMaximum);
  }

  public capacity() {
    return this.topicAliasMap.capacity();
  }

  private isFull() {
    return this.topicAliasMap.size() == this.topicAliasMap.capacity();
  }

  /**
   * Returns the topic alias of the topic. A topic without one gets a new alias,
   * replacing the least used topic when all aliases are in use.
   * @returns whether the alias is new, and the alias.
   * A new alias must be sent with the Topic Name; it can be sent without it after that PUBLISH has been written.
   */
  public getTopicId(topic: string): [boolean, number] {
    const topicId = this.topicAliasMap.get(topic);
    if (topicId) {
      return [false, topicId];
    }
    return [true, this.registerTopic(topic)];
  }

  private registerTopic(topic: string) {
    if (this.isFull()) {
      const lruTopic = this.topicAliasMap.lruKey();
      if (lruTopic) {
        const tid = this.topicAliasMap.get(lruTopic);
        if (tid) {
          this.topicIdProvider.release(tid);
        }
        this.topicAliasMap.delete(lruTopic);
      }
    }

    const topicId = this.topicIdProvider.acquire();
    this.topicAliasMap.set(topic, topicId);
    return topicId;
  }

  /** Removes the topic alias of the topic, e.g. when the PUBLISH that registers it is not sent. */
  public releaseTopic(topic: string) {
    if (this.topicAliasMap.has(topic)) {
      const topicId = this.topicAliasMap.get(topic);
      if (topicId) {
        this.topicIdProvider.release(topicId);
        this.topicAliasMap.delete(topic);
      }
    }
  }
}

import { LruCache } from '../cache/mod.ts';
import { ReuseIdProvider } from '../id_provider/mod.ts';

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

  public getTopicId(topic: string) {
    if (this.topicAliasMap.has(topic)) {
      return this.topicAliasMap.get(topic);
    } else {
      return undefined;
    }
  }

  public async registerTopic(topic: string) {
    if (this.topicAliasMap.has(topic)) {
      const tid = this.topicAliasMap.get(topic);
      if (tid) {
        this.topicIdProvider.release(tid);
      }
      const topicId = await this.aquireTopicId();
      this.topicAliasMap.set(topic, topicId);
      return topicId;
    } else {
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

      const topicId = await this.aquireTopicId();
      this.topicAliasMap.set(topic, topicId);
      return topicId;
    }
  }

  private releaseYounger(): void {
  }

  public releaseTopic(topic: string) {
    if (this.topicAliasMap.has(topic)) {
      const topicId = this.topicAliasMap.get(topic);
      if (topicId) {
        this.topicIdProvider.release(topicId);
        this.topicAliasMap.delete(topic);
      }
    }
  }

  private async aquireTopicId() {
    return await this.topicIdProvider.aquire();
  }
}

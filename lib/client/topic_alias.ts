import { LruCache } from '../cache/mod.ts';
import { ReuseIdProvider } from '../id_provider/mod.ts';
import { Deferred } from './promise.ts';

export class TopicAliasManager {
  private topicIdProvider: ReuseIdProvider;
  private topicAliasMap: LruCache<string, number>;
  private deferred?: Deferred<void>;

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

  public async getTopicId(topic: string): Promise<[boolean, number]> {
    if (this.deferred) {
      await this.deferred.promise;
    } else {
      this.deferred = new Deferred<void>();
    }

    let topicId = this.topicAliasMap.get(topic);
    let generated = false;
    if (!topicId) {
      topicId = await this.registerTopic(topic);
      generated = true;
    }
    this.deferred.resolve();
    return [generated, topicId];
  }

  private async registerTopic(topic: string) {
    if (this.topicAliasMap.has(topic)) {
      const tid = this.topicAliasMap.get(topic);
      if (tid) {
        this.topicIdProvider.release(tid);
      }
      const topicId = await this.acquireTopicId();
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

      const topicId = await this.acquireTopicId();
      this.topicAliasMap.set(topic, topicId);
      return topicId;
    }
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

  private async acquireTopicId() {
    return await this.topicIdProvider.acquire();
  }
}

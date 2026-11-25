import { LruCache } from '../cache/mod.ts';

/**
 * Assigns topic aliases to the topics of sent PUBLISH packets, on one connection.
 * The methods are synchronous: the client resolves the alias right before it writes PUBLISH, with no await in between,
 * so the aliases follow the order in which the packets are written.
 */
export class TopicAliasManager {
  /** The alias of each topic that has one. */
  readonly #topicAliasMap: LruCache<string, number>;
  /** Aliases given back by releaseTopic(), used again before new ones. */
  readonly #releasedTopicIds: number[] = [];
  /** The lowest alias not given yet. The aliases are 1 to the Topic Alias Maximum. */
  #nextTopicId = 1;

  constructor(topicAliasMaximum: number) {
    this.#topicAliasMap = new LruCache<string, number>(topicAliasMaximum);
  }

  /** The Topic Alias Maximum: the aliases are 1 to it. */
  get capacity(): number {
    return this.#topicAliasMap.capacity;
  }

  /**
   * Returns the topic alias of the topic. A topic without one gets a new alias,
   * replacing the least recently used topic when all aliases are in use.
   * @returns whether the alias is new, and the alias.
   * A new alias must be sent with the Topic Name; it can be sent without it after that PUBLISH has been written.
   */
  getTopicId(topic: string): [boolean, number] {
    const topicId = this.#topicAliasMap.get(topic);
    if (topicId !== undefined) {
      return [false, topicId];
    }
    const newTopicId = this.freeTopicId();
    // When all aliases are in use, this replaces the least recently used topic, whose alias freeTopicId() returned.
    this.#topicAliasMap.set(topic, newTopicId);
    return [true, newTopicId];
  }

  /** Returns an alias that no topic has, or the alias of the least recently used topic when all aliases are in use. */
  private freeTopicId(): number {
    const released = this.#releasedTopicIds.pop();
    if (released !== undefined) {
      return released;
    }
    if (this.#nextTopicId <= this.#topicAliasMap.capacity) {
      return this.#nextTopicId++;
    }
    const [, lruTopicId] = this.#topicAliasMap.entries().next().value as [string, number];
    return lruTopicId;
  }

  /** Removes the topic alias of the topic, e.g. when the PUBLISH that registers it is not sent. */
  releaseTopic(topic: string): void {
    const topicId = this.#topicAliasMap.get(topic);
    if (topicId !== undefined) {
      this.#topicAliasMap.delete(topic);
      this.#releasedTopicIds.push(topicId);
    }
  }
}

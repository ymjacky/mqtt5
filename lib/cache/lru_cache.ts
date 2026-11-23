/**
 * A least recently used (LRU) cache.
 * When the cache is full, setting a new key removes the least recently used entry.
 *
 * `set()` and `get()` make the key the most recently used one; `has()`, `keys()`, `values()`, `entries()` and the
 * iterator do not. The entries are iterated from the least recently used to the most recently used.
 */
export class LruCache<K, V> {
  readonly #capacity: number;
  readonly #maxAge: number;
  // A Map iterates in insertion order: a key is moved to the end when it is used, so the first key is the least recently used.
  readonly #values = new Map<K, V>();
  /** How many times each key has been read since it was set. */
  readonly #reads = new Map<K, number>();

  /**
   * Creates an empty cache.
   * @param capacity the maximum number of entries, a positive integer.
   * @param maxAge an entry is removed when it has been read this many times since it was set. 1 or more; no limit by default.
   * @throws {RangeError} if `capacity` or `maxAge` is out of range.
   */
  constructor(capacity: number, maxAge: number = Infinity) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`capacity must be a positive integer: ${capacity}`);
    }
    if (!(maxAge >= 1)) {
      throw new RangeError(`maxAge must be 1 or more: ${maxAge}`);
    }
    this.#capacity = capacity;
    this.#maxAge = maxAge;
  }

  /** Iterates over the `[key, value]` entries, from the least recently used. */
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.#values.entries();
  }

  /** Returns the maximum number of entries. */
  public capacity(): number {
    return this.#capacity;
  }

  /** Returns the least recently used key, removed next when the cache is full, or `undefined` if the cache is empty. */
  public lruKey(): K | undefined {
    return this.#values.keys().next().value;
  }

  /**
   * Sets a value, and makes the key the most recently used one. Setting a key again starts counting its reads again.
   * If the key is new and the cache is full, removes the least recently used entry.
   */
  public set(key: K, value: V): void {
    this.#values.delete(key);
    this.#values.set(key, value);
    this.#reads.set(key, 0);
    if (this.#values.size > this.#capacity) {
      this.delete(this.#values.keys().next().value as K);
    }
  }

  /**
   * Returns the value for the key, or `undefined` if it is not cached, and makes the key the most recently used one.
   * When this is the `maxAge`th read since the key was set, returns the value and removes the entry.
   */
  public get(key: K): V | undefined {
    if (!this.#values.has(key)) {
      return undefined;
    }
    const value = this.#values.get(key) as V;
    const reads = (this.#reads.get(key) ?? 0) + 1;
    this.#values.delete(key);
    if (reads >= this.#maxAge) {
      this.#reads.delete(key);
    } else {
      this.#values.set(key, value);
      this.#reads.set(key, reads);
    }
    return value;
  }

  /** Removes all entries. */
  public clear(): void {
    this.#values.clear();
    this.#reads.clear();
  }

  /** Removes the entry for the key. Returns `true` if it existed. */
  public delete(key: K): boolean {
    this.#reads.delete(key);
    return this.#values.delete(key);
  }

  /** Returns the number of entries. */
  public size(): number {
    return this.#values.size;
  }

  /** Returns whether the key is cached. */
  public has(key: K): boolean {
    return this.#values.has(key);
  }

  /** Iterates over the keys, from the least recently used. */
  public keys(): IterableIterator<K> {
    return this.#values.keys();
  }

  /** Iterates over the values, from the least recently used. */
  public values(): IterableIterator<V> {
    return this.#values.values();
  }

  /** Iterates over the `[key, value]` entries, from the least recently used. */
  public entries(): IterableIterator<[K, V]> {
    return this.#values.entries();
  }
}

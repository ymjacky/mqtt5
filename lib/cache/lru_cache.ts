/**
 * A least recently used (LRU) cache.
 * When the cache is full, setting a new key removes the least recently used entry.
 */
export class LruCache<K, V> {
  private _capacity: number;
  private _maxAge: number;
  private _values: Map<K, V>;
  private _ages: Map<K, number>;

  /**
   * Creates an empty cache.
   * @param capacity the maximum number of entries.
   * @param maxAge an entry is removed when it has been read this many times since it was set.
   */
  constructor(capacity: number, maxAge: number = Number.MAX_VALUE) {
    this._capacity = capacity;
    this._maxAge = maxAge;
    this._values = new Map<K, V>();
    this._ages = new Map<K, number>();
  }

  /** Iterates over the `[key, value]` entries. */
  *[Symbol.iterator](): IterableIterator<[K, V]> {
    for (const val of this._values.entries()) {
      yield val;
    }
  }

  /** Returns the maximum number of entries. */
  public capacity(): number {
    return this._capacity;
  }

  /** Returns the key removed next when the cache is full, or `undefined` if the cache is empty. */
  public lruKey(): K | undefined {
    const sortedByValueAsc = new Map([...this._ages].sort((a, b) => a[1] - b[1]));
    const firstEntry = sortedByValueAsc.keys().next();
    const key = firstEntry.value;
    return key;
  }

  /** Sets a value. If the cache is full, removes the entry returned by `lruKey()` first. */
  public set(key: K, value: V): void {
    if (!this._values.has(key)) {
      if (this._ages.size == this._capacity) {
        const key = this.lruKey();
        if (key) this.delete(key);
      }
    }
    this._values.set(key, value);
    this._ages.set(key, 1);
  }

  /** Returns the value for the key, or `undefined` if it is not cached. */
  public get(key: K): V | undefined {
    const value = this._values.get(key);
    if (value) {
      let age = this._ages.get(key);
      if (age) {
        age++;
        if (age > this._maxAge) {
          this._values.delete(key);
          this._ages.delete(key);
        } else {
          this._ages.set(key, age);
        }
      } else {
        this._ages.set(key, 1);
      }
    }
    return value;
  }
  /** Removes all entries. */
  public clear(): void {
    this._ages.clear();
    this._values.clear();
  }
  /** Removes the entry for the key. Returns `true` if it existed. */
  public delete(key: K): boolean {
    this._ages.delete(key);
    return this._values.delete(key);
  }

  /** Returns the number of entries. */
  public size(): number {
    return this._values.size;
  }

  /** Returns whether the key is cached. */
  public has(key: K): boolean {
    return this._values.has(key);
  }

  /** Iterates over the keys. */
  public keys(): IterableIterator<K> {
    return this._values.keys();
  }
  /** Iterates over the values. */
  public values(): IterableIterator<V> {
    return this._values.values();
  }

  /** Iterates over the `[key, value]` entries. */
  public entries(): IterableIterator<[K, V]> {
    return this._values.entries();
  }
}

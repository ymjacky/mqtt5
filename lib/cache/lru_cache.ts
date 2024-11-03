// least recentry used cache
export class LruCache<K, V> {
  private _capacity: number;
  private _maxAge: number;
  private _values: Map<K, V>;
  private _ages: Map<K, number>;

  constructor(capacity: number, maxAge: number = Number.MAX_VALUE) {
    this._capacity = capacity;
    this._maxAge = maxAge;
    this._values = new Map<K, V>();
    this._ages = new Map<K, number>();
  }

  *[Symbol.iterator](): IterableIterator<[K, V]> {
    for (const val of this._values.entries()) {
      yield val;
    }
  }

  public capacity(): number {
    return this._capacity;
  }

  public lruKey(): K | undefined {
    const sortedByValueAsc = new Map([...this._ages].sort((a, b) => a[1] - b[1]));
    const firstEntry = sortedByValueAsc.keys().next();
    const key = firstEntry.value;
    return key;
  }

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
  public clear(): void {
    this._ages.clear();
    this._values.clear();
  }
  public delete(key: K): boolean {
    this._ages.delete(key);
    return this._values.delete(key);
  }

  public size(): number {
    return this._values.size;
  }

  public has(key: K): boolean {
    return this._values.has(key);
  }

  public keys(): IterableIterator<K> {
    return this._values.keys();
  }
  public values(): IterableIterator<V> {
    return this._values.values();
  }

  public entries(): IterableIterator<[K, V]> {
    return this._values.entries();
  }
}

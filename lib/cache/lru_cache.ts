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

  *[Symbol.iterator]() {
    for (const val of this._values.entries()) {
      yield val;
    }
  }

  public capacity() {
    return this._capacity;
  }

  public lruKey() {
    const sortedByValueAsc = new Map([...this._ages].sort((a, b) => a[1] - b[1]));
    const firstEntry = sortedByValueAsc.keys().next();
    const key: K = firstEntry.value;
    return key;
  }

  public set(key: K, value: V) {
    if (!this._values.has(key)) {
      if (this._ages.size == this._capacity) {
        this.delete(this.lruKey());
      }
    }
    this._values.set(key, value);
    this._ages.set(key, 1);
  }

  public get(key: K) {
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
  public clear() {
    this._ages.clear();
    this._values.clear();
  }
  public delete(key: K) {
    this._ages.delete(key);
    return this._values.delete(key);
  }

  public size() {
    return this._values.size;
  }

  public has(key: K) {
    return this._values.has(key);
  }

  public keys() {
    return this._values.keys();
  }
  public values() {
    return this._values.values();
  }

  public entries() {
    return this._values.entries();
  }
}

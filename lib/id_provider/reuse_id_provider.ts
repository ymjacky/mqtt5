export class ReuseIdProvider {
  private _start: number;
  private _end: number;

  private _use: Array<number> = [];
  private _reuse: Array<number> = [];
  private _reusable: Array<number> = [];

  private _next: number;

  constructor(start: number, end: number) {
    if (start >= end) {
      throw new Error('Invalid argument');
    }
    this._start = start;
    this._end = end;

    this._use = [];
    this._reuse = [];
    this._reusable = [];
    this._next = this._start;
  }

  public clear() {
    this._use = [];
    this._reuse = [];
    this._reusable = [];
    this._next = this._start;
  }

  public aquire(): number {
    let id = this._reusable.shift(); // remove first entry
    if (id) { // found
      this._reuse.push(id);
    } else {
      if (this._next > this._end) {
        throw new Error(
          'Unable to obtain ID because the limit has been reached',
        );
      }
      id = this._next++;
      this._use.push(id);
    }
    return id;
  }

  public release(id: number): boolean {
    let index = this._reuse.findIndex((v) => v === id);
    if (index >= 0) { // found
      this._reuse.splice(index, 1); // delete

      if (id === this._next - 1) {
        this._next = id;
      } else {
        this._reusable.push(id);
      }
      return true;
    }

    index = this._use.findIndex((v) => v === id);
    if (index >= 0) { // found
      this._use.splice(index, 1); // delete

      if (id === this._next - 1) {
        this._next = id; // _nextを戻す
      } else {
        this._reusable.push(id);
      }
      return true;
    }

    return false;
  }

  public inUse(id: number) {
    return this._reuse.includes(id) || this._use.includes(id);
  }

  public registerIfNotInUse(id: number): boolean {
    if (!this.inUse(id)) {
      if (this._next <= id) {
        this._next = id + 1;
      }
      this._use.push(id);
      return true;
    }
    return false;
  }
}

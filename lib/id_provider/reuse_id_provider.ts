import { PacketIdsExhaustedError } from './error.ts';

/**
 * Hands out the IDs from `start` to `end`, reusing the released ones first so that the IDs stay small.
 *
 * A burst of requests widens the range of the IDs in use. Once the burst is over, the range narrows again: releasing
 * the highest ID lowers the next new ID down to the highest ID that is still in use.
 */
export class ReuseIdProvider {
  readonly #start: number;
  readonly #end: number;

  // Every ID below #next is either in #inUse or in #reusable, never in both.
  // An ID at or above #next is free, unless registerIfNotInUse() has put it in #inUse.
  readonly #inUse = new Set<number>();
  // The released IDs below #next, in the order they were released: the one released first is reused first.
  readonly #reusable = new Set<number>();
  #next: number;

  constructor(start: number, end: number) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) {
      throw new RangeError(`start (${start}) and end (${end}) must be integers, and start must be less than end`);
    }
    this.#start = start;
    this.#end = end;
    this.#next = start;
  }

  clear(): void {
    this.#inUse.clear();
    this.#reusable.clear();
    this.#next = this.#start;
  }

  /**
   * Hands out a free ID.
   * @throws {PacketIdsExhaustedError} if all the IDs are in use.
   */
  acquire(): number {
    const reusable = this.#reusable.values().next();
    if (!reusable.done) {
      const id = reusable.value;
      this.#reusable.delete(id);
      this.#inUse.add(id);
      return id;
    }

    // registerIfNotInUse() may have put IDs at or above #next in use: skip them.
    while (this.#next <= this.#end && this.#inUse.has(this.#next)) {
      this.#next++;
    }
    if (this.#next > this.#end) {
      throw new PacketIdsExhaustedError(`all the IDs from ${this.#start} to ${this.#end} are in use`);
    }
    const id = this.#next++;
    this.#inUse.add(id);
    return id;
  }

  release(id: number): boolean {
    if (!this.#inUse.delete(id)) {
      return false;
    }
    if (id === this.#next - 1) {
      // The highest ID below #next: lower #next past it, and past the released IDs right below it.
      this.#next = id;
      while (this.#next > this.#start && this.#reusable.delete(this.#next - 1)) {
        this.#next--;
      }
    } else if (id < this.#next) {
      this.#reusable.add(id);
    }
    // An ID at or above #next is free as soon as it is out of #inUse.
    return true;
  }

  inUse(id: number): boolean {
    return this.#inUse.has(id);
  }

  /**
   * Marks an ID as in use, e.g. the packet ID of a stored packet that is resent after reconnecting.
   * The IDs below it that are not in use stay free: acquire() still hands them out.
   * @returns false if the ID is already in use, or out of the range.
   */
  registerIfNotInUse(id: number): boolean {
    if (!Number.isInteger(id) || id < this.#start || id > this.#end || this.#inUse.has(id)) {
      return false;
    }
    this.#reusable.delete(id);
    this.#inUse.add(id);
    return true;
  }
}

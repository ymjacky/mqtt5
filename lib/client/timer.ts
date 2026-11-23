/**
 * A timer that runs one callback at a time: starting it again replaces the callback that has not run yet.
 */
export class Timer {
  #id?: ReturnType<typeof setTimeout>;

  /** Runs `callback` after `ms` milliseconds, instead of the callback started before if that has not run yet. */
  start(ms: number, callback: () => void): void {
    this.stop();
    this.#id = setTimeout(() => {
      this.#id = undefined;
      callback();
    }, ms);
  }

  /** Stops the timer, so that the callback does not run. Does nothing if the timer is not running. */
  stop(): void {
    clearTimeout(this.#id);
    this.#id = undefined;
  }

  /** Whether the callback is waiting to run. */
  get running(): boolean {
    return this.#id !== undefined;
  }
}

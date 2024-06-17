export type PublishResult = {
  result: number;
  reason?: string;
};

export type SubscribeResults = {
  reasons: number[];
  reason?: string;
};

export type UnsubscribeResults = {
  reasonCodes?: number[];
  reason?: string;
};

export class Deferred<T> {
  promise: Promise<T>;
  resolve!: (val: T) => void;
  reject!: (err: Error) => void;

  constructor() {
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    this.promise = promise;
    this.resolve = resolve;
    this.reject = reject;
  }
}

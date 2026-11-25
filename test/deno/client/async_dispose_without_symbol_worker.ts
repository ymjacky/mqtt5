// Run as a Worker by async_dispose_test.ts: loads the library where `Symbol.asyncDispose` does not exist, as in Safari,
// and reports what the client classes got. A Worker loads the modules again, in its own global scope.

const RealSymbol = Symbol;
const asyncDispose = Symbol.asyncDispose;

// `Symbol.asyncDispose` cannot be removed (the property is not configurable), and Deno defines it even when V8 does not.
// So the global `Symbol` is replaced with one that has no `asyncDispose`, before the library is loaded. The proxy wraps
// an empty function, not `Symbol` itself: a proxy must return the real value of a property that is not configurable.
globalThis.Symbol = new Proxy((() => {}) as unknown as SymbolConstructor, {
  get: (_target, key) => key === 'asyncDispose' ? undefined : Reflect.get(RealSymbol, key),
  has: (_target, key) => key !== 'asyncDispose' && Reflect.has(RealSymbol, key),
  apply: (_target, _thisArg, args: [string?]) => RealSymbol(...args),
});

const { MqttClient, WebSocketMqttClient } = await import('../../../deno/mod.ts');

// What the library would get without its check: a method written in the class as `[Symbol.asyncDispose]()`.
class WithoutCheck {
  async [Symbol.asyncDispose](): Promise<void> {}
}

const port = self as unknown as { postMessage(message: unknown): void };
port.postMessage({
  symbol: typeof Symbol.asyncDispose,
  // A method named "undefined".
  namedUndefined: {
    withoutCheck: 'undefined' in WithoutCheck.prototype,
    mqttClient: 'undefined' in MqttClient.prototype,
    webSocketMqttClient: 'undefined' in WebSocketMqttClient.prototype,
  },
  // A method under the real symbol, which the library cannot know of there.
  asyncDispose: {
    mqttClient: asyncDispose in MqttClient.prototype,
    webSocketMqttClient: asyncDispose in WebSocketMqttClient.prototype,
  },
});

import { KvOutgoingStore, Mqtt, MqttClient } from '../../../deno/mod.ts';
import { BaseMqttClient } from '../../../lib/client/base_mqtt_client.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertRejects } from '@std/assert';

// `await using` disconnects the client when the scope is left ([Symbol.asyncDispose]()).

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

/** A broker that accepts the connection, records the packets that end it, and closes the connection on DISCONNECT. */
function recordingBroker() {
  const broker = new TestBroker();
  const received: string[] = [];
  broker.listen();
  broker.on('connect', (event) => {
    const packet = event.detail;
    broker.sendConnack(packet.clientId, false, packet.protocolVersion);
  });
  broker.on('disconnect', () => {
    received.push('DISCONNECT');
    broker.closeConnectionFromBroker('cid');
  });
  return { broker, received };
}

Deno.test({ name: '@async dispose', only: false }, async (context) => {
  await context.step('leaving the scope sends DISCONNECT, and waits for the connection to close', async () => {
    const b = recordingBroker();
    try {
      const events: string[] = [];
      {
        await using client = new MqttClient({ clientId: 'cid', logger });
        client.on('closed', () => {
          events.push('closed');
        });
        await client.connect();
        events.push('connected');
      }
      events.push('scope left');

      assertEquals(b.received, ['DISCONNECT']);
      assertEquals(events, ['connected', 'closed', 'scope left']);
    } finally {
      await b.broker.destroy();
    }
  });

  await context.step('an error thrown in the scope disconnects the client, and is thrown as it is', async () => {
    const b = recordingBroker();
    try {
      const events: string[] = [];
      const error = await assertRejects(
        async () => {
          await using client = new MqttClient({ clientId: 'cid', logger });
          client.on('closed', () => {
            events.push('closed');
          });
          await client.connect();
          throw new Error('failure in the scope');
        },
        Error,
        'failure in the scope',
      );

      // Not a SuppressedError: disconnecting did not fail.
      assertEquals(error.constructor, Error);
      assertEquals(b.received, ['DISCONNECT']);
      assertEquals(events, ['closed']);
    } finally {
      await b.broker.destroy();
    }
  });

  await context.step('a client that is not connected: leaving the scope does nothing', async () => {
    {
      await using _client = new MqttClient({ clientId: 'cid', logger });
    }

    // connect() fails: its error is thrown as it is, not a SuppressedError.
    const listener = Deno.listen({ port: 0, transport: 'tcp' });
    const { port } = listener.addr as Deno.NetAddr;
    listener.close();
    await assertRejects(async () => {
      await using client = new MqttClient({ url: new URL(`mqtt://127.0.0.1:${port}`), clientId: 'cid', logger });
      await client.connect();
    }, Deno.errors.ConnectionRefused);
  });

  await context.step('Deno KV declared before the client is closed after the client has disconnected', async () => {
    const b = recordingBroker();
    const kv = await Deno.openKv(':memory:');
    const events: string[] = [];
    // Records when `using` closes the database. `using` reads the method when the database is declared.
    const disposeKv = kv[Symbol.dispose].bind(kv);
    Object.defineProperty(kv, Symbol.dispose, {
      value: () => {
        events.push('kv closed');
        disposeKv();
      },
    });
    try {
      {
        using store = kv;
        await using client = new MqttClient({ clientId: 'cid', logger, clean: false, outgoingStore: new KvOutgoingStore(store) });
        client.on('closed', () => {
          events.push('client closed');
        });
        await client.connect({ properties: { sessionExpiryInterval: 3600 } });
        await client.publish('topicA', 'A', { qos: Mqtt.QoS.AT_MOST_ONCE });
      }

      assertEquals(b.received, ['DISCONNECT']);
      assertEquals(events, ['client closed', 'kv closed']);
      await assertRejects(() => kv.get(['x'])); // the database is closed
    } finally {
      await b.broker.destroy();
    }
  });

  await context.step('the method is not enumerable, as a method written in the class', () => {
    const descriptor = Object.getOwnPropertyDescriptor(BaseMqttClient.prototype, Symbol.asyncDispose);
    assertEquals(typeof descriptor?.value, 'function');
    assertEquals({ ...descriptor, value: undefined }, { value: undefined, writable: true, enumerable: false, configurable: true });
    assertEquals('undefined' in BaseMqttClient.prototype, false);
  });

  await context.step('where the runtime has no Symbol.asyncDispose, as Safari, the method is not added', async () => {
    const worker = new Worker(new URL('./async_dispose_without_symbol_worker.ts', import.meta.url), { type: 'module' });
    try {
      const report = await new Promise((resolve, reject) => {
        worker.onmessage = (event) => resolve(event.data);
        worker.onerror = (event) => {
          event.preventDefault();
          reject(new Error(event.message));
        };
      });

      assertEquals(report, {
        symbol: 'undefined',
        namedUndefined: {
          // Without the check, a method named "undefined" would be added: the Worker does reproduce the missing symbol.
          withoutCheck: true,
          mqttClient: false,
          webSocketMqttClient: false,
        },
        asyncDispose: { mqttClient: false, webSocketMqttClient: false },
      });
    } finally {
      worker.terminate();
    }
  });
}); // @async dispose

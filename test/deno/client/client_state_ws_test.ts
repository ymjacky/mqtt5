import { WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assertEquals } from '@std/assert';

// client.state and client.closed with a WebSocket connection.

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

// Whether the promise has settled `ms` from now.
async function stateOf(promise: Promise<unknown>, ms = 50): Promise<'resolved' | 'rejected' | 'pending'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Promise<'pending'>((resolve) => {
    timer = setTimeout(() => resolve('pending'), ms);
  });
  try {
    return await Promise.race([promise.then(() => 'resolved' as const, () => 'rejected' as const), pending]);
  } finally {
    clearTimeout(timer);
  }
}

// Rejects if the promise does not settle within `ms`, instead of letting the test hang.
async function settleWithin<T>(promise: Promise<T>, label: string, ms = 1000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

Deno.test({ name: '@client state ws', only: false }, async (context) => {
  await context.step(
    'state and closed follow the connection, until the broker closes it',
    async () => {
      const broker = new TestWsBroker();
      const client = new WebSocketMqttClient({ url: new URL('ws://127.0.0.1:3000/'), clientId: 'cid', logger: logger });
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        assertEquals(client.state, 'offline');
        assertEquals(await stateOf(client.closed, 0), 'resolved');

        const connecting = client.connect();
        assertEquals(client.state, 'connecting');
        const closed = client.closed;
        await settleWithin(connecting, 'connect()');
        assertEquals(client.state, 'online');
        assertEquals(await stateOf(closed), 'pending');

        await broker.closeConnectionFromBroker('cid');
        await settleWithin(closed, 'client.closed');
        assertEquals(client.state, 'offline');
      } finally {
        await client.disconnect({ force: true });
        await broker.destroy();
      }
    },
  );
}); // @client state ws

import { WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assertEquals, assertRejects } from '@std/assert';

// `await using` disconnects the client when the scope is left ([Symbol.asyncDispose]()).

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

/** A broker that accepts the connection, records the packets that end it, and closes the connection on DISCONNECT. */
function recordingBroker() {
  const broker = new TestWsBroker();
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

function wsClient(): WebSocketMqttClient {
  return new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger });
}

Deno.test({ name: '@async dispose ws', only: false }, async (context) => {
  await context.step('leaving the scope sends DISCONNECT, and waits for the connection to close', async () => {
    const b = recordingBroker();
    try {
      const events: string[] = [];
      {
        await using client = wsClient();
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
          await using client = wsClient();
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
}); // @async dispose ws

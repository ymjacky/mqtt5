import { ClientErrors, MqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertRejects } from '@std/assert';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

/** The methods whose options are an object since 0.3.0, called as from JavaScript: without the type check. */
type Untyped = Record<'publish' | 'disconnect' | 'subscribe' | 'unsubscribe', (...args: unknown[]) => Promise<unknown>>;

Deno.test({ name: '@options argument: the arguments before 0.3.0 are rejected', only: false }, async (context) => {
  /**
   * Runs `test` with a connected client, called without the type check. The broker records the type of the packets it
   * receives after CONNECT.
   */
  async function withClient(test: (client: Untyped, received: string[]) => Promise<void>) {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      broker.listen();
      broker.on('connect', (event) => {
        const packet = event.detail;
        broker.sendConnack(packet.clientId, false, packet.protocolVersion);
      });
      const received: string[] = [];
      for (const type of ['publish', 'subscribe', 'unsubscribe', 'disconnect'] as const) {
        broker.on(type, () => {
          received.push(type);
        });
      }
      await client.connect();
      await test(client as unknown as Untyped, received);
    } finally {
      await client.disconnect({ force: true });
      await broker.destroy();
    }
  }

  /** Publishes a QoS 0 message with valid arguments, and waits until the broker has received it. */
  async function publishValid(client: Untyped, received: string[]): Promise<void> {
    const count = received.length;
    // undefined options, as the third of three arguments, are accepted.
    await client.publish('topicA', 'valid', undefined);
    while (received.length === count) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  await context.step('disconnect(true) and disconnect(false, properties): the options are not an object', async () => {
    await withClient(async (client, received) => {
      await assertRejects(() => client.disconnect(true), ClientErrors.InvalidArgumentError, 'disconnect() takes its options as an object');
      await assertRejects(
        () => client.disconnect(false, { reasonString: 'bye' }),
        ClientErrors.InvalidArgumentError,
        'disconnect() takes its options as an object',
      );
      await assertRejects(
        () => client.disconnect({ reasonString: 'bye' }, { reasonString: 'bye' }),
        ClientErrors.InvalidArgumentError,
        'disconnect() takes at most 1 argument (got 2)',
      );

      // Nothing was sent, and the connection stays open.
      await publishValid(client, received);
      assertEquals(received, ['publish']);
    });
  });

  await context.step('subscribe() with a QoS, or with the properties as a third argument', async () => {
    await withClient(async (client, received) => {
      await assertRejects(() => client.subscribe('topicA', 1), ClientErrors.InvalidArgumentError, 'subscribe() takes its options as an object');
      await assertRejects(
        () => client.subscribe('topicA', 1, { subscriptionIdentifier: 1 }),
        ClientErrors.InvalidArgumentError,
        'subscribe() takes its options as an object',
      );
      await assertRejects(
        () => client.subscribe(['topicA'], undefined, { subscriptionIdentifier: 1 }),
        ClientErrors.InvalidArgumentError,
        'subscribe() takes at most 2 arguments (got 3)',
      );
      // Neither null nor an array is an options object.
      await assertRejects(() => client.subscribe('topicA', null), ClientErrors.InvalidArgumentError, 'subscribe() takes its options as an object');
      await assertRejects(() => client.subscribe('topicA', []), ClientErrors.InvalidArgumentError, 'subscribe() takes its options as an object');

      await publishValid(client, received);
      assertEquals(received, ['publish']);
    });
  });

  await context.step('publish() with the properties as a fourth argument', async () => {
    await withClient(async (client, received) => {
      await assertRejects(
        () => client.publish('topicA', 'x', { qos: 1 }, { contentType: 'text/plain' }),
        ClientErrors.InvalidArgumentError,
        'publish() takes at most 3 arguments (got 4)',
      );
      await assertRejects(
        () => client.publish('topicA', 'x', undefined, { contentType: 'text/plain' }),
        ClientErrors.InvalidArgumentError,
        'publish() takes at most 3 arguments (got 4)',
      );
      await assertRejects(() => client.publish('topicA', 'x', 1), ClientErrors.InvalidArgumentError, 'publish() takes its options as an object');

      await publishValid(client, received);
      assertEquals(received, ['publish']);
    });
  });

  await context.step('unsubscribe() with the properties as its second argument', async () => {
    await withClient(async (client, received) => {
      await assertRejects(
        () => client.unsubscribe('topicA', { userProperties: [{ key: 'k', val: 'v' }] }),
        ClientErrors.InvalidArgumentError,
        'got userProperties in the options',
      );
      await assertRejects(
        () => client.unsubscribe('topicA', 'x'),
        ClientErrors.InvalidArgumentError,
        'unsubscribe() takes its options as an object',
      );
      await assertRejects(
        () => client.unsubscribe('topicA', {}, {}),
        ClientErrors.InvalidArgumentError,
        'unsubscribe() takes at most 2 arguments (got 3)',
      );

      await publishValid(client, received);
      assertEquals(received, ['publish']);
    });
  });

  await context.step('the arguments are checked first: also while not connected', async () => {
    const client = new MqttClient({ clientId: 'cid', logger }) as unknown as Untyped;
    // disconnect() resolves at once while not connected, but not with these arguments.
    await assertRejects(() => client.disconnect(true), ClientErrors.InvalidArgumentError, 'disconnect() takes its options as an object');
    // The others would reject with StateIsNotOnlineError.
    await assertRejects(() => client.subscribe('topicA', 1), ClientErrors.InvalidArgumentError);
    await assertRejects(() => client.publish('topicA', 'x', {}, {}), ClientErrors.InvalidArgumentError);
    await assertRejects(() => client.unsubscribe('topicA', { userProperties: [] }), ClientErrors.InvalidArgumentError);
  });
}); // @options argument: the arguments before 0.3.0 are rejected

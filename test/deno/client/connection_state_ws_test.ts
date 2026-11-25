import { ClientErrors, Mqtt, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { acceptWebSocket, connackBytes, RawServer, waitUntil, webSocketFrame } from '../broker/raw_server.ts';
import { assert, assertEquals, assertRejects } from '@std/assert';

// How the client behaves when the connection is refused, is lost or has to be ended.

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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

Deno.test({ name: '@connection state ws: packets a broker must not send', only: false }, async (context) => {
  for (
    const [version, protocolVersion, expected] of [
      ['v5.0 sends DISCONNECT with the ProtocolError reason code', Mqtt.ProtocolVersion.MqttV5, [`DISCONNECT ${Mqtt.ReasonCode.ProtocolError}`]],
      ['v3.1.1 closes without sending DISCONNECT', Mqtt.ProtocolVersion.MqttV3_1_1, []],
    ] as const
  ) {
    await context.step(
      `PINGREQ from the broker ends the connection, without an uncaught error: ${version}`,
      async () => {
        const broker = new TestWsBroker();
        const client = new WebSocketMqttClient({
          url: new URL('ws://127.0.0.1:3000/'),
          clientId: 'cid',
          logger: logger,
          protocolVersion,
          disconnectTimeoutMS: 200,
        });
        // An error thrown from the message handler of the WebSocket would be an uncaught error, which terminates the process.
        const uncaught: string[] = [];
        const onError = (event: ErrorEvent) => {
          event.preventDefault();
          uncaught.push(String(event.error));
        };
        globalThis.addEventListener('error', onError);
        try {
          broker.listen();
          broker.on('connect', (event) => {
            const packet = event.detail;
            broker.sendConnack(packet.clientId, false, packet.protocolVersion);
          });
          // The broker does not close the connection on DISCONNECT: the client closes it after disconnectTimeoutMS.
          const seenByBroker: string[] = [];
          broker.on('disconnect', (event) => {
            seenByBroker.push(`DISCONNECT ${event.detail.reasonCode}`);
          });
          const closed = Promise.withResolvers<void>();
          client.on('closed', () => closed.resolve());

          await client.connect();
          broker.sendRawBytes('cid', new Uint8Array([0xc0, 0x00])); // PINGREQ

          const result = await settleWithin(closed.promise, "the 'closed' event of the client").catch((err) => err);
          assertEquals(uncaught, []);
          assertEquals(result, undefined);
          assertEquals(seenByBroker, [...expected]);
        } finally {
          globalThis.removeEventListener('error', onError);
          await client.disconnect(true);
          await broker.destroy();
        }
      },
    );
  }
}); // @connection state ws: packets a broker must not send

Deno.test({ name: '@connection state ws: DISCONNECT from the broker', only: false }, async (context) => {
  await context.step(
    "'disconnect' is emitted before 'closed'",
    async () => {
      const broker = new TestWsBroker();
      const client = new WebSocketMqttClient({ url: new URL('ws://127.0.0.1:3000/'), clientId: 'cid', logger: logger });
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        const events: string[] = [];
        const closed = Promise.withResolvers<void>();
        client.on('disconnect', (event) => {
          events.push(`disconnect ${event.detail.reasonCode}`);
        });
        client.on('closed', () => {
          events.push('closed');
          closed.resolve();
        });

        await client.connect();
        await broker.sendDisconnect('cid', Mqtt.ReasonCode.SessionTakenOver);
        await settleWithin(closed.promise, "the 'closed' event");
        await delay(50);

        assertEquals(events, [`disconnect ${Mqtt.ReasonCode.SessionTakenOver}`, 'closed']);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @connection state ws: DISCONNECT from the broker

Deno.test({ name: '@connection state ws: connection refused by the broker', only: false }, async (context) => {
  await context.step(
    'after a CONNACK that refuses the connection, the client is offline and connect() can be called again right away',
    async () => {
      const broker = new TestWsBroker();
      const client = new WebSocketMqttClient({ url: new URL('ws://127.0.0.1:3000/'), clientId: 'cid', logger: logger });
      try {
        broker.listen();
        // Refuses the first time, and does not close the connection (a broker has to, but may be slow to).
        let connects = 0;
        broker.on('connect', (event) => {
          const packet = event.detail;
          const reasonCode = ++connects === 1 ? Mqtt.ReasonCode.NotAuthorized : Mqtt.ReasonCode.Success;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion, reasonCode);
        });
        const events: string[] = [];
        client.on('connack', () => {
          events.push('connack');
        });
        client.on('closed', () => {
          events.push('closed');
        });

        const refused = await settleWithin(client.connect(), 'connect()');
        events.push('connect() resolved');
        assertEquals(refused.reasonCode, Mqtt.ReasonCode.NotAuthorized);
        assertEquals(events, ['connack', 'closed', 'connect() resolved']);
        await assertRejects(() => client.publish('topicA', 'x'), ClientErrors.StateIsNotOnlineError);

        const connack = await settleWithin(client.connect(), 'the second connect()');
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
        assertEquals(await client.publish('topicA', 'x'), { result: 0, reason: '' });
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    },
  );
}); // @connection state ws: connection refused by the broker

Deno.test({ name: '@connection state ws: disconnect() while connecting', only: false }, async (context) => {
  await context.step(
    'disconnect(true) gives up a connect() that waits for CONNACK at once, and resolves',
    async () => {
      const broker = new TestWsBroker();
      const client = new WebSocketMqttClient({ url: new URL('ws://127.0.0.1:3000/'), clientId: 'cid', logger: logger, connectTimeoutMS: 5000 });
      try {
        broker.listen();
        // The broker never answers CONNECT.
        const connectReceived = Promise.withResolvers<void>();
        broker.on('connect', () => connectReceived.resolve());

        const connecting = client.connect();
        await settleWithin(connectReceived.promise, 'CONNECT');

        // Not after connectTimeoutMS, and not rejected with the error of connect().
        await settleWithin(client.disconnect(true), 'disconnect(true)', 500);
        await assertRejects(() => settleWithin(connecting, 'connect()'), ClientErrors.ConnectionClosed);
        await assertRejects(() => client.publish('topicA', 'x'), ClientErrors.StateIsNotOnlineError);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    },
  );
}); // @connection state ws: disconnect() while connecting

// The peer has become unreachable while the TCP connection is still open: it answers nothing, not even the Close frame
// of the WebSocket closing handshake.
Deno.test({ name: '@connection state ws: a peer that does not answer', only: false }, async (context) => {
  await context.step(
    'connect() rejects with ConnectTimeout when CONNACK is not received, and the client can connect again',
    async () => {
      const server = new RawServer({ port: 3997 });
      const client = new WebSocketMqttClient({ url: new URL('ws://127.0.0.1:3997/'), clientId: 'cid', logger: logger, connectTimeoutMS: 200 });
      try {
        let closedCount = 0;
        client.on('closed', () => {
          closedCount++;
        });

        const connecting = client.connect();
        const first = await server.connection(0);
        const handshakeLength = await acceptWebSocket(first);
        await waitUntil(() => first.received.length > handshakeLength, 'CONNECT');
        // do not reply CONNACK

        await assertRejects(() => settleWithin(connecting, 'connect()', 2000), ClientErrors.ConnectTimeout);
        assertEquals(closedCount, 1);

        // The client is offline: it can connect again right away, while the first connection is still open.
        assert(!first.isClosed);
        const reconnecting = client.connect();
        const second = await server.connection(1);
        const secondHandshakeLength = await acceptWebSocket(second);
        await waitUntil(() => second.received.length > secondHandshakeLength, 'CONNECT on the second connection');
        await second.send(webSocketFrame(connackBytes()));
        const connack = await settleWithin(reconnecting, 'the second connect()');
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);

        // The first connection ends now: the client does not take it for the end of the second one.
        first.close();
        await first.closed;
        await delay(100);
        assertEquals(closedCount, 1);
        assertEquals(await client.publish('topicA', 'x'), { result: 0, reason: '' });

        // disconnect(true) does not wait for the peer either.
        await settleWithin(client.disconnect(true), 'disconnect(true)', 2000);
        assertEquals(closedCount, 2);
      } finally {
        await server.close();
        await delay(50);
      }
    },
  );

  await context.step(
    'the connection is closed when PINGRESP is not received',
    async () => {
      const server = new RawServer({ port: 3997 });
      const client = new WebSocketMqttClient({
        url: new URL('ws://127.0.0.1:3997/'),
        clientId: 'cid',
        logger: logger,
        keepAlive: 1,
        pingrespTimeoutMS: 200,
      });
      try {
        const closed = Promise.withResolvers<void>();
        client.on('closed', () => closed.resolve());

        const connecting = client.connect();
        const connection = await server.connection(0);
        const handshakeLength = await acceptWebSocket(connection);
        await waitUntil(() => connection.received.length > handshakeLength, 'CONNECT');
        await connection.send(webSocketFrame(connackBytes()));
        const connack = await settleWithin(connecting, 'connect()');
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
        const connected = connection.received.length;

        // PINGREQ after 1 s, given up 200 ms later.
        await settleWithin(closed.promise, "the 'closed' event", 3000);
        assert(connection.received.length > connected, 'PINGREQ was not sent before closing');
      } finally {
        await server.close();
        await delay(50);
      }
    },
  );
}); // @connection state ws: a peer that does not answer

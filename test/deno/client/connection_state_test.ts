import { ClientErrors, Mqtt, MqttClient, MqttPackets, Store } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { connackBytes, RawServer, waitUntil } from '../broker/raw_server.ts';
import { assert, assertEquals, assertRejects } from 'std/assert/mod.ts';

// How the client behaves when the connection is refused, cannot be established, is lost or has to be ended.

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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

// A client whose connection opens, but on which CONNECT cannot be written, e.g. the broker resets the connection
// right after accepting it.
class ConnectWriteFailingClient extends MqttClient {
  failNextConnect = false;
  protected override async open(signal: AbortSignal): Promise<void> {
    await super.open(signal);
    if (this.failNextConnect) {
      this.failNextConnect = false;
      this.write = () => {
        throw new Error('write failed');
      };
    }
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

Deno.test({ name: '@connection state: keep alive', only: false }, async (context) => {
  await context.step(
    'the connection is closed when PINGRESP is not received, also when pingrespTimeoutMS is longer than the keep alive interval',
    async () => {
      const broker = new TestBroker();
      // PINGREQ every second, PINGRESP awaited for 1.5 s: the next PINGREQ is sent while the first is not answered.
      const client = new MqttClient({ clientId: 'cid', logger: logger, keepAlive: 1, pingrespTimeoutMS: 1500 });
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });
        let pingreqCount = 0;
        broker.on('pingreq', () => {
          // do not reply PINGRESP
          pingreqCount++;
        });
        const closed = Promise.withResolvers<void>();
        client.on('closed', () => closed.resolve());

        await client.connect();
        const start = Date.now();
        await settleWithin(closed.promise, 'the connection without PINGRESP', 4500);
        const elapsed = Date.now() - start;

        // The first PINGREQ is sent after 1 s and given up 1.5 s later; a second one is sent in between.
        assert(elapsed >= 2400 && elapsed < 3400, `closed after ${elapsed} ms`);
        assertEquals(pingreqCount, 2);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    },
  );
}); // @connection state: keep alive

Deno.test({ name: '@connection state: packets a broker must not send', only: false }, async (context) => {
  for (
    const [version, protocolVersion, expected] of [
      ['v5.0 sends DISCONNECT with the ProtocolError reason code', Mqtt.ProtocolVersion.MQTT_V5, [`DISCONNECT ${Mqtt.ReasonCode.ProtocolError}`, 'closed']],
      ['v3.1.1 closes without sending DISCONNECT', Mqtt.ProtocolVersion.MQTT_V3_1_1, ['closed']],
    ] as const
  ) {
    await context.step(
      `PINGREQ from the broker ends the connection: ${version}`,
      async () => {
        const broker = new TestBroker();
        const client = new MqttClient({ clientId: 'cid', logger: logger, protocolVersion, disconnectTimeoutMS: 200 });
        try {
          broker.listen();
          broker.on('connect', (event) => {
            const packet = event.detail;
            broker.sendConnack(packet.clientId, false, packet.protocolVersion);
          });
          // The broker does not close the connection on DISCONNECT: the client closes it after disconnectTimeoutMS.
          const seenByBroker: string[] = [];
          const closedAtBroker = Promise.withResolvers<void>();
          broker.on('disconnect', (event) => {
            seenByBroker.push(`DISCONNECT ${event.detail.reasonCode}`);
          });
          broker.on('closed', () => {
            seenByBroker.push('closed');
            closedAtBroker.resolve();
          });
          const closed = Promise.withResolvers<void>();
          client.on('closed', () => closed.resolve());

          await client.connect();
          await broker.sendRawBytes('cid', new Uint8Array([0xc0, 0x00])); // PINGREQ

          await settleWithin(closed.promise, "the 'closed' event of the client");
          // The socket is not left open.
          await settleWithin(closedAtBroker.promise, 'the connection seen by the broker');
          assertEquals(seenByBroker, [...expected]);
        } finally {
          await broker.destroy();
        }
      },
    );
  }
}); // @connection state: packets a broker must not send

Deno.test({ name: '@connection state: connection refused by the broker', only: false }, async (context) => {
  for (
    const [version, protocolVersion, refusal] of [
      ['v5.0', Mqtt.ProtocolVersion.MQTT_V5, Mqtt.ReasonCode.NotAuthorized],
      ['v3.1.1', Mqtt.ProtocolVersion.MQTT_V3_1_1, Mqtt.V3_1_1_ConnectReturnCode.NotAuthorized],
    ] as const
  ) {
    await context.step(
      `after a CONNACK that refuses the connection, the client is not online and closes the connection itself (${version})`,
      async () => {
        const broker = new TestBroker();
        const client = new MqttClient({ clientId: 'cid', logger: logger, protocolVersion });
        try {
          broker.listen();
          // Refuses, and does not close the connection (a broker has to, but may be slow to).
          broker.on('connect', (event) => {
            const packet = event.detail;
            broker.sendConnack(packet.clientId, false, packet.protocolVersion, refusal);
          });
          const seenByBroker: string[] = [];
          broker.on('publish', () => {
            seenByBroker.push('PUBLISH');
          });
          broker.on('disconnect', () => {
            seenByBroker.push('DISCONNECT');
          });
          broker.on('closed', () => {
            seenByBroker.push('closed');
          });
          const events: string[] = [];
          client.on('connack', () => {
            events.push('connack');
          });
          client.on('closed', () => {
            events.push('closed');
          });

          const connack = await settleWithin(client.connect(), 'connect()');
          events.push('connect() resolved');
          assertEquals(connack.reasonCode ?? connack.returnCode, refusal);

          // connect() resolves when the connection is closed: the client is offline.
          assertEquals(events, ['connack', 'closed', 'connect() resolved']);
          await assertRejects(() => client.publish('topicA', 'x'), ClientErrors.StateIsNotOnlineError);
          await waitUntil(() => seenByBroker.length > 0, 'the close of the refused connection');
          assertEquals(seenByBroker, ['closed']);
        } finally {
          await client.disconnect(true);
          await broker.destroy();
        }
      },
    );
  }

  await context.step(
    'after a CONNACK that refuses the connection, connect() can be called again right away',
    async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger: logger });
      try {
        broker.listen();
        let connects = 0;
        broker.on('connect', async (event) => {
          const packet = event.detail;
          if (++connects === 1) {
            await broker.sendConnack(packet.clientId, false, packet.protocolVersion, Mqtt.ReasonCode.NotAuthorized);
            await broker.closeConnectionFromBroker(packet.clientId);
          } else {
            broker.sendConnack(packet.clientId, false, packet.protocolVersion);
          }
        });

        const refused = await client.connect();
        assertEquals(refused.reasonCode, Mqtt.ReasonCode.NotAuthorized);

        // e.g. with other credentials. Not StateIsNotOfflineError.
        const connack = await settleWithin(client.connect(), 'the second connect()');
        assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
        assertEquals(await client.publish('topicA', 'x'), { result: 0, reason: '' });
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    },
  );
}); // @connection state: connection refused by the broker

Deno.test({ name: '@connection state: connect() failures', only: false }, async (context) => {
  await context.step(
    "TLS: a certificate that is not trusted rejects connect() with the TLS error, and 'closed' is emitted once",
    async () => {
      const server = new RawServer({ port: 8883, tls: true });
      // No caCerts: the certificate of the test server is not trusted.
      const client = new MqttClient({ url: new URL('mqtts://127.0.0.1:8883'), clientId: 'cid', logger: logger });
      try {
        let closedCount = 0;
        client.on('closed', () => {
          closedCount++;
        });

        // Not ConnectionClosed, which would look like a failure worth retrying.
        await assertRejects(() => settleWithin(client.connect(), 'connect()'), Deno.errors.InvalidData, 'certificate');
        await delay(100);
        assertEquals(closedCount, 1);

        // The connection is not left open.
        const connection = await server.connection(0);
        await settleWithin(connection.closed, 'the connection whose TLS handshake failed');
      } finally {
        await server.close();
      }
    },
  );

  await context.step(
    'when CONNECT cannot be written, the opened connection is closed',
    async () => {
      const server = new RawServer({ port: 1883 });
      const client = new ConnectWriteFailingClient({ clientId: 'cid', logger: logger });
      try {
        let closedCount = 0;
        client.on('closed', () => {
          closedCount++;
        });

        client.failNextConnect = true;
        await assertRejects(() => client.connect(), Error, 'write failed');
        assertEquals(closedCount, 1);

        const connection = await server.connection(0);
        await settleWithin(connection.closed, 'the connection on which CONNECT could not be written');
        assertEquals(closedCount, 1);
      } finally {
        await server.close();
      }
    },
  );

  await context.step(
    'a connection on which CONNECT could not be written does not affect the next connection',
    async () => {
      const server = new RawServer({ port: 1883 });
      const client = new ConnectWriteFailingClient({ clientId: 'cid', logger: logger });
      try {
        const events: string[] = [];
        client.on('closed', () => {
          events.push('closed');
        });

        client.failNextConnect = true;
        await assertRejects(() => client.connect(), Error, 'write failed');
        const first = await server.connection(0);

        // Connect again right away.
        const connecting = client.connect();
        const second = await server.connection(1);
        await waitUntil(() => second.received.length > 0, 'CONNECT on the second connection');
        await second.send(connackBytes());
        await settleWithin(connecting, 'the second connect()');
        events.push('connected');

        await first.closed;
        await delay(100);

        // Still online.
        assertEquals(events, ['closed', 'connected']);
        const received = second.received.length;
        assertEquals(await client.publish('topicA', 'x'), { result: 0, reason: '' });
        await waitUntil(() => second.received.length > received, 'PUBLISH on the second connection');
      } finally {
        await client.disconnect(true);
        await server.close();
      }
    },
  );
}); // @connection state: connect() failures

Deno.test({ name: '@connection state: session store while CONNACK is handled', only: false }, async (context) => {
  // Fails once.
  let failures = 0;
  class FailingClearStore extends Store.MemoryStore {
    override clear(): Promise<void> {
      return failures++ === 0 ? Promise.reject(new Error('store failed')) : super.clear();
    }
  }
  class FailingResendStore extends Store.MemoryStore {
    override async *resendIterator(): AsyncIterableIterator<MqttPackets.PublishPacket | MqttPackets.PubrelPacket> {
      if (failures++ === 0) {
        throw new Error('store failed');
      }
      yield* super.resendIterator();
    }
  }

  for (
    const [operation, sessionPresent, createStore] of [
      ['clearing the store (Session Present 0)', false, () => new FailingClearStore()],
      ['reading the packets to resend (Session Present 1)', true, () => new FailingResendStore()],
    ] as const
  ) {
    await context.step(
      `a failure of the store when ${operation} rejects connect() and ends the connection`,
      async () => {
        failures = 0;
        const broker = new TestBroker();
        const client = new MqttClient({ clientId: 'cid', logger: logger, clean: false, outgoingStore: createStore(), disconnectTimeoutMS: 100 });
        try {
          broker.listen();
          broker.on('connect', (event) => {
            const packet = event.detail;
            broker.sendConnack(packet.clientId, sessionPresent, packet.protocolVersion);
          });
          // The broker does not close the connection on DISCONNECT: the client closes it after disconnectTimeoutMS.
          const seenByBroker: string[] = [];
          broker.on('disconnect', (event) => {
            seenByBroker.push(`DISCONNECT ${event.detail.reasonCode}`);
          });
          broker.on('closed', () => {
            seenByBroker.push('closed');
          });
          const events: string[] = [];
          client.on('connack', () => {
            events.push('connack');
          });
          client.on('closed', () => {
            events.push('closed');
          });

          await assertRejects(() => settleWithin(client.connect(), 'connect()'), Error, 'store failed');
          assertEquals(events, ['closed']);
          await waitUntil(() => seenByBroker.includes('closed'), 'the close of the connection');
          assertEquals(seenByBroker, [`DISCONNECT ${Mqtt.ReasonCode.UnspecifiedError}`, 'closed']);

          // The client is offline: it can connect again, and the store works this time.
          const connack = await settleWithin(client.connect(), 'the second connect()');
          assertEquals(connack.reasonCode, Mqtt.ReasonCode.Success);
          assertEquals(events, ['closed', 'connack']);
        } finally {
          await client.disconnect(true);
          await broker.destroy();
        }
      },
    );
  }

  await context.step(
    'a connection closed while its CONNACK is handled does not resolve the connect() of the next connection',
    async () => {
      // clear() takes time, as with a store on a database, and completes when the test says so.
      class GatedClearStore extends Store.MemoryStore {
        clearing = Promise.withResolvers<void>();
        gate = Promise.withResolvers<void>();
        override async clear(): Promise<void> {
          this.clearing.resolve();
          await this.gate.promise;
          await super.clear();
        }
      }

      const server = new RawServer({ port: 1883 });
      const store = new GatedClearStore();
      const client = new MqttClient({ clientId: 'cid', logger: logger, outgoingStore: store });
      let closedCount = 0;
      try {
        // Reconnects when the connection is closed.
        let reconnecting: Promise<MqttPackets.ConnackPacket> | undefined;
        client.on('closed', () => {
          if (++closedCount === 1) {
            reconnecting = client.connect();
          }
        });
        let connackCount = 0;
        client.on('connack', () => {
          connackCount++;
        });

        const connecting = client.connect();
        const first = await server.connection(0);
        await waitUntil(() => first.received.length > 0, 'CONNECT on the first connection');
        await first.send(connackBytes());
        // The client is clearing the store for the CONNACK when the connection is closed.
        await settleWithin(store.clearing.promise, 'clear()');
        first.close();

        // The first connect() ends with its connection.
        await assertRejects(() => settleWithin(connecting, 'the first connect()'), ClientErrors.ConnectionClosed);

        // The client reconnects; the broker has not answered the second CONNECT yet.
        const second = await server.connection(1);
        await waitUntil(() => second.received.length > 0, 'CONNECT on the second connection');
        assert(reconnecting);
        const connectLength = second.received.length;

        // clear() completes now: the CONNACK of the first connection does not answer the second connect(),
        // and nothing is sent for it on the second connection.
        store.gate.resolve();
        assertEquals(await stateOf(reconnecting, 200), 'pending');
        assertEquals(connackCount, 0);
        assertEquals(second.received.length, connectLength);

        // The second connect() is answered by its own CONNACK.
        await second.send(connackBytes(true));
        assertEquals((await settleWithin(reconnecting, 'the second connect()')).sessionPresent, true);
        assertEquals(connackCount, 1);
      } finally {
        store.gate.resolve();
        await client.disconnect(true);
        await server.close();
      }
    },
  );
}); // @connection state: session store while CONNACK is handled

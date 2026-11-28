import { ClientErrors, Mqtt, MqttClient, MqttPackets, Store } from '../../../deno/mod.ts';
import * as MqttStream from '../../../lib/mqtt_stream_utils/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { connackBytes, type RawConnection, RawServer, waitUntil } from '../broker/raw_server.ts';
import { assert, assertEquals, assertRejects } from '@std/assert';

// client.state and client.closed: what the client tells about its connection.

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

// The types of the MQTT 5.0 packets that the client has sent on a raw connection, e.g. ['connect', 'publish'].
function receivedPacketTypes(connection: RawConnection): string[] {
  const frames = new MqttStream.MqttFrameBuffer();
  frames.append(connection.received);
  const types: string[] = [];
  for (let bytes = frames.takePacket(); bytes; bytes = frames.takePacket()) {
    types.push(MqttPackets.decode(bytes, Mqtt.ProtocolVersion.MqttV5).type);
  }
  return types;
}

// An outgoing store whose clear() takes time, as with a store on a database, and completes when the test says so.
class GatedClearStore extends Store.MemoryStore {
  clearing = Promise.withResolvers<void>();
  gate = Promise.withResolvers<void>();
  override async clear(): Promise<void> {
    this.clearing.resolve();
    await this.gate.promise;
    await super.clear();
  }
}

Deno.test({ name: '@client state: state', only: false }, async (context) => {
  await context.step(
    'state follows connect() and disconnect(): offline, connecting, online, disconnecting, offline',
    async () => {
      const server = new RawServer({ port: 1883 });
      const client = new MqttClient({ clientId: 'cid', logger: logger, connectTimeoutMS: 5000, disconnectTimeoutMS: 5000 });
      try {
        assertEquals(client.state, 'offline');

        const connecting = client.connect();
        // Set before connect() returns.
        assertEquals(client.state, 'connecting');
        const connection = await server.connection(0);
        await waitUntil(() => connection.received.length > 0, 'CONNECT');
        assertEquals(client.state, 'connecting');

        await connection.send(connackBytes());
        await settleWithin(connecting, 'connect()');
        assertEquals(client.state, 'online');

        // The server does not close the connection on DISCONNECT: the client stays disconnecting until it is closed.
        const disconnecting = client.disconnect();
        await waitUntil(() => receivedPacketTypes(connection).includes('disconnect'), 'DISCONNECT');
        assertEquals(client.state, 'disconnecting');
        assertEquals(await stateOf(disconnecting), 'pending');
        assertEquals(client.state, 'disconnecting');

        connection.close();
        await settleWithin(disconnecting, 'disconnect()');
        assertEquals(client.state, 'offline');
      } finally {
        await client.disconnect({ force: true });
        await server.close();
      }
    },
  );

  await context.step(
    'state is online while connect() still updates the session, and publish() called meanwhile waits for the update',
    async () => {
      const store = new GatedClearStore();
      const server = new RawServer({ port: 1883 });
      const client = new MqttClient({ clientId: 'cid', logger: logger, outgoingStore: store });
      try {
        const connecting = client.connect();
        const connection = await server.connection(0);
        await waitUntil(() => connection.received.length > 0, 'CONNECT');
        // Session Present 0: the client clears the store before connect() resolves.
        await connection.send(connackBytes());
        await settleWithin(store.clearing.promise, 'clear() of the store');

        assertEquals(client.state, 'online');
        assertEquals(await stateOf(connecting), 'pending');
        // Not StateIsNotOnlineError: it waits.
        const publishing = client.publish('topicA', 'x');
        assertEquals(await stateOf(publishing), 'pending');
        assertEquals(receivedPacketTypes(connection), ['connect']);

        store.gate.resolve();
        await settleWithin(connecting, 'connect()');
        assertEquals((await settleWithin(publishing, 'publish()')).result, Mqtt.ReasonCode.Success);
        await waitUntil(() => receivedPacketTypes(connection).length > 1, 'PUBLISH');
        assertEquals(receivedPacketTypes(connection), ['connect', 'publish']);
        assertEquals(client.state, 'online');
      } finally {
        store.gate.resolve();
        await client.disconnect({ force: true });
        await server.close();
      }
    },
  );

  for (
    const [label, protocolVersion, returnValue, expected] of [
      ['accepted (v5.0)', Mqtt.ProtocolVersion.MqttV5, Mqtt.ReasonCode.Success, ['connack: online']],
      ['refused (v5.0)', Mqtt.ProtocolVersion.MqttV5, Mqtt.ReasonCode.NotAuthorized, ['connack: connecting', 'closed: offline']],
      ['refused (v3.1.1)', Mqtt.ProtocolVersion.MqttV3_1_1, Mqtt.V3_1_1_ConnectReturnCode.NotAuthorized, ['connack: connecting', 'closed: offline']],
    ] as const
  ) {
    await context.step(
      `in a connack listener, state is online only when the broker has accepted the connection: ${label}`,
      async () => {
        const broker = new TestBroker();
        const client = new MqttClient({ clientId: 'cid', logger: logger, protocolVersion });
        try {
          broker.listen();
          broker.on('connect', (event) => {
            const packet = event.detail;
            broker.sendConnack(packet.clientId, false, packet.protocolVersion, returnValue);
          });
          const seen: string[] = [];
          client.on('connack', () => {
            seen.push(`connack: ${client.state}`);
          });
          client.on('closed', () => {
            seen.push(`closed: ${client.state}`);
          });

          const connack = await settleWithin(client.connect(), 'connect()');
          assertEquals(connack.reasonCode ?? connack.returnCode, returnValue);
          assertEquals(seen, [...expected]);
          assertEquals(client.state, returnValue === 0 ? 'online' : 'offline');
        } finally {
          await client.disconnect({ force: true });
          await broker.destroy();
        }
      },
    );
  }

  await context.step(
    'state is offline again when connect() fails',
    async () => {
      // Nothing listens on the port: the connection cannot be opened.
      const client = new MqttClient({ clientId: 'cid', logger: logger });
      const connecting = client.connect();
      assertEquals(client.state, 'connecting');
      await assertRejects(() => settleWithin(connecting, 'connect()'), Deno.errors.ConnectionRefused);
      assertEquals(client.state, 'offline');
    },
  );
}); // @client state: state

Deno.test({ name: '@client state: closed', only: false }, async (context) => {
  await context.step(
    'closed is resolved while the client is offline',
    async () => {
      const client = new MqttClient({ clientId: 'cid', logger: logger });
      assertEquals(await stateOf(client.closed, 0), 'resolved');
    },
  );

  await context.step(
    'closed resolves when the connection is closed, after the closed listeners have run, and is resolved when read afterwards',
    async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger: logger });
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await settleWithin(client.connect(), 'connect()');
        const closed = client.closed;
        // The same promise while the connection lasts.
        assert(client.closed === closed);
        assertEquals(await stateOf(closed), 'pending');

        const seen: string[] = [];
        client.on('closed', () => {
          seen.push(`closed event: ${client.state}`);
        });
        closed.then(() => {
          seen.push(`closed resolved: ${client.state}`);
        });
        await broker.closeConnectionFromBroker('cid');
        await settleWithin(closed, 'client.closed');
        assertEquals(seen, ['closed event: offline', 'closed resolved: offline']);

        // Read after the connection has been closed: not missed.
        assertEquals(await stateOf(client.closed, 0), 'resolved');
      } finally {
        await client.disconnect({ force: true });
        await broker.destroy();
      }
    },
  );

  await context.step(
    'each connection has its own closed promise',
    async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger: logger });
      try {
        broker.listen();
        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await settleWithin(client.connect(), 'connect()');
        const first = client.closed;
        await settleWithin(client.disconnect({ force: true }), 'disconnect({ force: true })');
        assertEquals(await stateOf(first, 0), 'resolved');

        await settleWithin(client.connect(), 'the second connect()');
        const second = client.closed;
        assert(second !== first);
        assertEquals(await stateOf(second), 'pending');

        await settleWithin(client.disconnect({ force: true }), 'the second disconnect({ force: true })');
        assertEquals(await stateOf(second, 0), 'resolved');
      } finally {
        await client.disconnect({ force: true });
        await broker.destroy();
      }
    },
  );

  await context.step(
    'closed read while connecting resolves when the connection cannot be opened',
    async () => {
      // Nothing listens on the port.
      const client = new MqttClient({ clientId: 'cid', logger: logger });
      const connecting = client.connect();
      const closed = client.closed;
      await assertRejects(() => settleWithin(connecting, 'connect()'), Deno.errors.ConnectionRefused);
      assertEquals(await stateOf(closed, 0), 'resolved');
    },
  );

  await context.step(
    'closed read while connecting resolves when CONNACK does not arrive within connectTimeoutMS',
    async () => {
      // Accepts the connection and never answers CONNECT.
      const server = new RawServer({ port: 1883 });
      const client = new MqttClient({ clientId: 'cid', logger: logger, connectTimeoutMS: 200 });
      try {
        const connecting = client.connect();
        const closed = client.closed;
        await assertRejects(() => settleWithin(connecting, 'connect()'), ClientErrors.ConnectTimeout);
        assertEquals(await stateOf(closed, 0), 'resolved');
        assertEquals(client.state, 'offline');
      } finally {
        await client.disconnect({ force: true });
        await server.close();
      }
    },
  );
}); // @client state: closed

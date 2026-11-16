import { Mqtt, MqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assert, assertEquals } from 'std/assert/mod.ts';

// How the client behaves when the connection is lost or has to be ended.

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
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

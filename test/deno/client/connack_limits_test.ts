import { ClientErrors, Mqtt, MqttClient, MqttProperties } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { assertEquals, assertInstanceOf, assertRejects } from '@std/assert';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean | Promise<boolean>, label: string, ms = 2000) {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > ms) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await delay(10);
  }
}

const v5 = Mqtt.ProtocolVersion.MQTT_V5;

/**
 * A broker that records what it receives, e.g. `PUBLISH A`, `PUBLISH A dup retain`, `PUBREL 1` or `SUBSCRIBE a/b`.
 * It answers CONNACK, with the Session Present and the properties set by the test, and SUBACK; the test acknowledges
 * PUBLISH itself, with the packet ID the message (its payload) was last received with.
 */
function recordingBroker() {
  const broker = new TestBroker();
  const state = {
    broker,
    received: [] as string[],
    packetIds: new Map<string, number>(),
    sessionPresent: false,
    connackProperties: undefined as MqttProperties.Properties | undefined,
    puback(payload: string) {
      return broker.sendPuback('cid', state.packetIds.get(payload)!, v5);
    },
  };
  broker.listen();
  broker.on('connect', (event) => {
    const packet = event.detail;
    broker.sendConnack(packet.clientId, state.sessionPresent, packet.protocolVersion, Mqtt.ReasonCode.Success, state.connackProperties);
  });
  broker.on('publish', (event) => {
    const packet = event.detail;
    const payload = new TextDecoder().decode(packet.payload);
    state.received.push(`PUBLISH ${payload}${packet.dup ? ' dup' : ''}${packet.retain ? ' retain' : ''}`);
    if (packet.packetId) {
      state.packetIds.set(payload, packet.packetId);
    }
  });
  broker.on('pubrel', (event) => {
    state.received.push(`PUBREL ${event.detail.packetId}`);
  });
  broker.on('subscribe', (event) => {
    const packet = event.detail;
    state.received.push(`SUBSCRIBE ${packet.subscriptions.map((sub) => sub.topicFilter).join(' ')}`);
    broker.sendSuback('cid', packet.packetId, v5, packet.subscriptions.map(() => 0));
  });
  return state;
}

/** Resolves when the client emits the `closed` event next. */
function nextClose(client: MqttClient): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  const listener = () => {
    client.off('closed', listener);
    resolve();
  };
  client.on('closed', listener);
  return promise;
}

/** Checks that `received` is `expected` and stays so: nothing more is sent meanwhile. */
async function assertStays(received: string[], expected: string[]) {
  await delay(100);
  assertEquals(received, expected);
}

const qos0 = { qos: Mqtt.QoS.AT_MOST_ONCE };
const qos1 = { qos: Mqtt.QoS.AT_LEAST_ONCE };
const qos2 = { qos: Mqtt.QoS.EXACTLY_ONCE };

Deno.test({ name: '@CONNACK Receive Maximum', only: false }, async (context) => {
  await context.step('QoS 1: a PUBLISH waits for a PUBACK when Receive Maximum PUBLISH packets are in flight, in order', async () => {
    const b = recordingBroker();
    b.connackProperties = { receiveMaximum: 2 };
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      const publishing = ['A', 'B', 'C', 'D', 'E'].map((payload) => client.publish('topicA', payload, qos1));
      await waitFor(() => b.received.length === 2, 'the first 2 messages');
      await assertStays(b.received, ['PUBLISH A', 'PUBLISH B']);

      // [MQTT-3.3.4-7] each PUBACK lets one more PUBLISH go
      b.puback('A');
      await waitFor(() => b.received.length === 3, 'C after the PUBACK of A');
      await assertStays(b.received, ['PUBLISH A', 'PUBLISH B', 'PUBLISH C']);
      b.puback('B');
      await waitFor(() => b.received.length === 4, 'D after the PUBACK of B');
      b.puback('C');
      await waitFor(() => b.received.length === 5, 'E after the PUBACK of C');
      assertEquals(b.received, ['PUBLISH A', 'PUBLISH B', 'PUBLISH C', 'PUBLISH D', 'PUBLISH E']);
      b.puback('D');
      b.puback('E');
      for (const result of await Promise.all(publishing)) {
        assertEquals(result.result, Mqtt.ReasonCode.Success);
      }
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });

  await context.step('a QoS 0 PUBLISH called after a waiting QoS 1 PUBLISH waits too: the order of the calls is kept', async () => {
    const b = recordingBroker();
    b.connackProperties = { receiveMaximum: 1 };
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      const publishingA = client.publish('topicA', 'A', qos1);
      const publishingB = client.publish('topicA', 'B', qos1);
      const publishingC = client.publish('topicA', 'C', qos0);
      await waitFor(() => b.received.length === 1, 'A');
      await assertStays(b.received, ['PUBLISH A']);

      b.puback('A');
      await waitFor(() => b.received.length === 3, 'B and C after the PUBACK of A');
      assertEquals(b.received, ['PUBLISH A', 'PUBLISH B', 'PUBLISH C']);
      b.puback('B');
      await Promise.all([publishingA, publishingB, publishingC]);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });

  await context.step('QoS 2: the quota is given back on PUBCOMP, or on PUBREC with an error Reason Code, not on PUBREC', async () => {
    const b = recordingBroker();
    b.connackProperties = { receiveMaximum: 1 };
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      const publishingA = client.publish('topicA', 'A', qos2);
      const publishingB = client.publish('topicA', 'B', qos2);
      const publishingC = client.publish('topicA', 'C', qos2);
      await waitFor(() => b.received.length === 1, 'A');

      // PUBREC does not end the flow: PUBREL is sent, and B still waits.
      b.broker.sendPubrec('cid', b.packetIds.get('A')!, v5);
      await waitFor(() => b.received.length === 2, 'PUBREL of A');
      await assertStays(b.received, ['PUBLISH A', `PUBREL ${b.packetIds.get('A')}`]);

      b.broker.sendPubcomp('cid', b.packetIds.get('A')!, v5);
      await waitFor(() => b.received.length === 3, 'B after the PUBCOMP of A');
      assertEquals((await publishingA).result, Mqtt.ReasonCode.Success);

      // A PUBREC with an error Reason Code ends the flow.
      b.broker.sendPubrec('cid', b.packetIds.get('B')!, v5, Mqtt.ReasonCode.UnspecifiedError);
      assertEquals((await publishingB).result, Mqtt.ReasonCode.UnspecifiedError);
      await waitFor(() => b.received.length === 4, 'C after the error PUBREC of B');
      assertEquals(b.received.slice(2), ['PUBLISH B', 'PUBLISH C']);

      b.broker.sendPubrec('cid', b.packetIds.get('C')!, v5);
      await waitFor(() => b.received.length === 5, 'PUBREL of C');
      b.broker.sendPubcomp('cid', b.packetIds.get('C')!, v5);
      assertEquals((await publishingC).result, Mqtt.ReasonCode.Success);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });

  await context.step('a publish() waiting for the quota rejects when the connection is closed, and is not kept in the session', async () => {
    const b = recordingBroker();
    b.connackProperties = { receiveMaximum: 1 };
    const client = new MqttClient({ clientId: 'cid', logger, clean: false });
    try {
      await client.connect();
      client.publish('topicA', 'A', qos1);
      const publishingB = client.publish('topicA', 'B', qos1);
      await waitFor(() => b.received.length === 1, 'A');

      const closed = nextClose(client);
      await b.broker.closeConnectionFromBroker('cid');
      await closed;
      await assertRejects(() => publishingB, ClientErrors.StateIsNotOnlineError);
      // A was sent and stays in the session, to be resent; B was never sent and is not kept.
      assertEquals(await client.publishInflightCount(), 1);
      assertEquals(b.received, ['PUBLISH A']);
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });

  await context.step('without a Receive Maximum in CONNACK, 65,535 PUBLISH packets may be in flight: none waits', async () => {
    const b = recordingBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      const payloads = Array.from({ length: 30 }, (_, i) => `M${i}`);
      const publishing = payloads.map((payload) => client.publish('topicA', payload, qos1));
      await waitFor(() => b.received.length === payloads.length, 'every message without any PUBACK');
      for (const payload of payloads) {
        b.puback(payload);
      }
      await Promise.all(publishing);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });
});

Deno.test({ name: '@CONNACK Receive Maximum when resending after reconnecting', only: false }, async (context) => {
  await context.step(
    'the messages in flight are resent after connect() resolves, within the Receive Maximum of the new connection, before a new publish()',
    async () => {
      const b = recordingBroker();
      const client = new MqttClient({ clientId: 'cid', logger, clean: false });
      try {
        // The first connection has no limit: 5 messages are in flight when it is closed.
        await client.connect();
        const publishing = ['A', 'B', 'C', 'D', 'E'].map((payload) => client.publish('topicA', payload, qos1));
        await waitFor(() => b.received.length === 5, 'the messages of the first connection');
        const closed = nextClose(client);
        await b.broker.closeConnectionFromBroker('cid');
        await closed;

        // The new connection allows 2 at a time. connect() resolves although 3 messages are still to be resent.
        b.received.length = 0;
        b.sessionPresent = true;
        b.connackProperties = { receiveMaximum: 2 };
        await client.connect();
        const publishingF = client.publish('topicA', 'F', qos1);
        await waitFor(() => b.received.length === 2, 'the first 2 resent messages');
        await assertStays(b.received, ['PUBLISH A dup', 'PUBLISH B dup']);

        // [MQTT-4.6.0-1] the rest are resent in order as the earlier ones are acknowledged; F comes after them.
        b.puback('A');
        await waitFor(() => b.received.length === 3, 'C after the PUBACK of A');
        b.puback('B');
        await waitFor(() => b.received.length === 4, 'D after the PUBACK of B');
        b.puback('C');
        await waitFor(() => b.received.length === 5, 'E after the PUBACK of C');
        await assertStays(b.received, ['PUBLISH A dup', 'PUBLISH B dup', 'PUBLISH C dup', 'PUBLISH D dup', 'PUBLISH E dup']);
        b.puback('D');
        await waitFor(() => b.received.length === 6, 'F after the PUBACK of D');
        assertEquals(b.received.at(-1), 'PUBLISH F');

        b.puback('E');
        b.puback('F');
        for (const result of await Promise.all([...publishing, publishingF])) {
          assertEquals(result.result, Mqtt.ReasonCode.Success);
        }
        await client.disconnect();
      } finally {
        await client.disconnect(true);
        await b.broker.destroy();
      }
    },
  );

  await context.step('the resending stops when the connection is closed, and starts again in order on the next connection', async () => {
    const b = recordingBroker();
    const client = new MqttClient({ clientId: 'cid', logger, clean: false });
    try {
      await client.connect();
      const publishing = ['A', 'B', 'C'].map((payload) => client.publish('topicA', payload, qos1));
      await waitFor(() => b.received.length === 3, 'the messages of the first connection');
      let closed = nextClose(client);
      await b.broker.closeConnectionFromBroker('cid');
      await closed;

      // The second connection is closed while B and C wait for the quota.
      b.received.length = 0;
      b.sessionPresent = true;
      b.connackProperties = { receiveMaximum: 1 };
      await client.connect();
      await waitFor(() => b.received.length === 1, 'A on the second connection');
      closed = nextClose(client);
      await b.broker.closeConnectionFromBroker('cid');
      await closed;

      // The third connection resends from A, as A has not been acknowledged. The resending of the second connection
      // has stopped: after the PUBACK of A, only one B is sent.
      b.received.length = 0;
      await client.connect();
      await waitFor(() => b.received.length === 1, 'A on the third connection');
      assertEquals(b.received, ['PUBLISH A dup']);
      b.puback('A');
      await waitFor(() => b.received.length === 2, 'B after the PUBACK of A');
      await assertStays(b.received, ['PUBLISH A dup', 'PUBLISH B dup']);
      b.puback('B');
      await waitFor(() => b.received.length === 3, 'C after the PUBACK of B');
      assertEquals(b.received, ['PUBLISH A dup', 'PUBLISH B dup', 'PUBLISH C dup']);
      b.puback('C');
      await Promise.all(publishing);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });

  await context.step('a resent PUBREL uses the quota until PUBCOMP', async () => {
    const b = recordingBroker();
    const client = new MqttClient({ clientId: 'cid', logger, clean: false });
    try {
      await client.connect();
      // A (QoS 2) has got PUBREC: PUBREL is kept in the session. B (QoS 1) is in flight.
      const publishingA = client.publish('topicA', 'A', qos2);
      await waitFor(() => b.received.length === 1, 'A');
      b.broker.sendPubrec('cid', b.packetIds.get('A')!, v5);
      await waitFor(() => b.received.length === 2, 'PUBREL of A');
      const publishingB = client.publish('topicA', 'B', qos1);
      await waitFor(() => b.received.length === 3, 'B');
      const closed = nextClose(client);
      await b.broker.closeConnectionFromBroker('cid');
      await closed;

      b.received.length = 0;
      b.sessionPresent = true;
      b.connackProperties = { receiveMaximum: 1 };
      await client.connect();
      const pubrelA = `PUBREL ${b.packetIds.get('A')}`;
      await waitFor(() => b.received.length === 1, 'the resent PUBREL of A');
      await assertStays(b.received, [pubrelA]);

      b.broker.sendPubcomp('cid', b.packetIds.get('A')!, v5);
      assertEquals((await publishingA).result, Mqtt.ReasonCode.Success);
      await waitFor(() => b.received.length === 2, 'B after the PUBCOMP of A');
      assertEquals(b.received, [pubrelA, 'PUBLISH B dup']);
      b.puback('B');
      assertEquals((await publishingB).result, Mqtt.ReasonCode.Success);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });
});

Deno.test({ name: '@CONNACK Maximum QoS and Retain Available', only: false }, async (context) => {
  await context.step('a QoS higher than the Maximum QoS rejects with QoSNotSupportedError, and nothing is sent', async () => {
    const b = recordingBroker();
    b.connackProperties = { maximumQoS: Mqtt.QoS.AT_LEAST_ONCE };
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      // [MQTT-3.2.2-11]
      const err = await assertRejects(() => client.publish('topicA', 'A', qos2), ClientErrors.QoSNotSupportedError);
      assertInstanceOf(err, ClientErrors.NotSupportedByBrokerError);
      assertEquals(err.maximumQoS, Mqtt.QoS.AT_LEAST_ONCE);
      assertEquals(await client.publishInflightCount(), 0);

      const publishingB = client.publish('topicA', 'B', qos1);
      await waitFor(() => b.received.length === 1, 'B');
      b.puback('B');
      await publishingB;
      assertEquals(b.received, ['PUBLISH B']);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });

  await context.step('Maximum QoS 0: QoS 1 is rejected, QoS 0 is sent', async () => {
    const b = recordingBroker();
    b.connackProperties = { maximumQoS: Mqtt.QoS.AT_MOST_ONCE };
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      const err = await assertRejects(() => client.publish('topicA', 'A', qos1), ClientErrors.QoSNotSupportedError);
      assertEquals(err.maximumQoS, Mqtt.QoS.AT_MOST_ONCE);
      await client.publish('topicA', 'B', qos0);
      await waitFor(() => b.received.length === 1, 'B');
      assertEquals(b.received, ['PUBLISH B']);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });

  await context.step('retain rejects with RetainNotSupportedError when Retain Available is 0, and nothing is sent', async () => {
    const b = recordingBroker();
    b.connackProperties = { retainAvailable: false };
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      // [MQTT-3.2.2-14]
      const err = await assertRejects(() => client.publish('topicA', 'A', { ...qos0, retain: true }), ClientErrors.RetainNotSupportedError);
      assertInstanceOf(err, ClientErrors.NotSupportedByBrokerError);
      await assertRejects(() => client.publish('topicA', 'A', { ...qos1, retain: true }), ClientErrors.RetainNotSupportedError);
      assertEquals(await client.publishInflightCount(), 0);

      const publishingB = client.publish('topicA', 'B', qos1);
      await waitFor(() => b.received.length === 1, 'B');
      // The rejected QoS 1 PUBLISH did not keep a packet ID.
      assertEquals(b.packetIds.get('B'), 1);
      b.puback('B');
      await publishingB;
      assertEquals(b.received, ['PUBLISH B']);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });

  await context.step('the limits are those of the current connection', async () => {
    const b = recordingBroker();
    b.connackProperties = { maximumQoS: Mqtt.QoS.AT_MOST_ONCE, retainAvailable: false };
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      await assertRejects(() => client.publish('topicA', 'A', { ...qos2, retain: true }), ClientErrors.QoSNotSupportedError);
      const closed = nextClose(client);
      await b.broker.closeConnectionFromBroker('cid');
      await closed;

      // The next CONNACK has no limits.
      b.connackProperties = undefined;
      await client.connect();
      client.publish('topicA', 'A', { ...qos2, retain: true });
      await waitFor(() => b.received.length === 1, 'A on the second connection');
      assertEquals(b.received, ['PUBLISH A retain']);
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });
});

Deno.test({ name: '@CONNACK Wildcard, Shared and Subscription Identifiers Available', only: false }, async (context) => {
  await context.step('a topic filter with a wildcard rejects with WildcardSubscriptionsNotSupportedError, and nothing is sent', async () => {
    const b = recordingBroker();
    b.connackProperties = { wildcardSubscriptionAvailable: false };
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      const err = await assertRejects(() => client.subscribe('a/+'), ClientErrors.WildcardSubscriptionsNotSupportedError);
      assertInstanceOf(err, ClientErrors.NotSupportedByBrokerError);
      // One filter with a wildcard rejects the whole call.
      await assertRejects(() => client.subscribe(['a/b', 'a/#']), ClientErrors.WildcardSubscriptionsNotSupportedError);
      await client.subscribe('a/b');
      assertEquals(b.received, ['SUBSCRIBE a/b']);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });

  await context.step('a shared subscription rejects with SharedSubscriptionsNotSupportedError, and nothing is sent', async () => {
    const b = recordingBroker();
    b.connackProperties = { sharedSubscriptionAvailable: false };
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      const err = await assertRejects(() => client.subscribe('$share/group1/a'), ClientErrors.SharedSubscriptionsNotSupportedError);
      assertInstanceOf(err, ClientErrors.NotSupportedByBrokerError);
      await client.subscribe('a/+');
      assertEquals(b.received, ['SUBSCRIBE a/+']);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });

  await context.step('a Subscription Identifier rejects with SubscriptionIdentifiersNotSupportedError, and nothing is sent', async () => {
    const b = recordingBroker();
    b.connackProperties = { subscriptionIdentifiersAvailable: false };
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      const err = await assertRejects(
        () => client.subscribe('a', Mqtt.QoS.AT_MOST_ONCE, { subscriptionIdentifier: 1 }),
        ClientErrors.SubscriptionIdentifiersNotSupportedError,
      );
      assertInstanceOf(err, ClientErrors.NotSupportedByBrokerError);
      await client.subscribe('a', Mqtt.QoS.AT_MOST_ONCE);
      assertEquals(b.received, ['SUBSCRIBE a']);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });

  await context.step('all of them are supported when CONNACK does not say', async () => {
    const b = recordingBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      await client.connect();
      await client.subscribe('$share/group1/a/+', Mqtt.QoS.AT_MOST_ONCE, { subscriptionIdentifier: 1 });
      assertEquals(b.received, ['SUBSCRIBE $share/group1/a/+']);
      await client.disconnect();
    } finally {
      await client.disconnect(true);
      await b.broker.destroy();
    }
  });
});

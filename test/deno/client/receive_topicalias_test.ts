import { Mqtt, MqttClient, MqttPackets, type MqttProperties, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestBroker } from '../broker/test_broker.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assertEquals, fail } from '@std/assert';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

Deno.test({ name: '@receive topic alias', only: false }, async (context) => {
  await context.step(
    'receive publish with topic alias',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
          topicAliasMaximumAboutReceive: 3,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertEquals(packet.properties?.topicAliasMaximum, 3);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        client.on('publish', (event) => {
          const packet = event.detail;
          const message = new TextDecoder().decode(packet.payload);
          if (message === '1st') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 1);
          } else if (message === '2nd') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 1);
          } else {
            assertEquals(message, '3rd');
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 1);
            resolve();
          }
        });

        const properties: MqttProperties.PublishProperties = {
          topicAlias: 1,
        };
        broker.sendPublish(
          client.clientId,
          0,
          'topicA',
          Mqtt.ProtocolVersion.MqttV5,
          new TextEncoder().encode('1st'),
          Mqtt.QoS.AtMostOnce,
          false,
          false,
          properties,
        );

        broker.sendPublish(
          client.clientId,
          0,
          '',
          Mqtt.ProtocolVersion.MqttV5,
          new TextEncoder().encode('2nd'),
          Mqtt.QoS.AtMostOnce,
          false,
          false,
          properties,
        );

        broker.sendPublish(
          client.clientId,
          0,
          '',
          Mqtt.ProtocolVersion.MqttV5,
          new TextEncoder().encode('3rd'),
          Mqtt.QoS.AtMostOnce,
          false,
          false,
          properties,
        );

        await promise;
      } catch (err) {
        reject();
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );

  await context.step(
    'receive publish with topic alias, overwrite ',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestBroker();

      try {
        broker.listen();

        const client = new MqttClient({
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
          topicAliasMaximumAboutReceive: 3,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          assertEquals(packet.properties?.topicAliasMaximum, 3);
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        client.on('publish', (event) => {
          const packet = event.detail;
          const message = new TextDecoder().decode(packet.payload);
          if (message === '1st') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 1);
          } else if (message === '2nd') {
            assertEquals(packet.topic, 'topicB');
            assertEquals(packet.properties?.topicAlias, 1);
          } else if (message === '3rd') {
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 2);
          } else {
            assertEquals(message, '4th');
            assertEquals(packet.topic, 'topicA');
            assertEquals(packet.properties?.topicAlias, 2);
            resolve();
          }
        });

        broker.sendPublish(
          client.clientId,
          0,
          'topicA',
          Mqtt.ProtocolVersion.MqttV5,
          new TextEncoder().encode('1st'),
          Mqtt.QoS.AtMostOnce,
          false,
          false,
          { topicAlias: 1 },
        );

        broker.sendPublish(
          client.clientId,
          0,
          'topicB',
          Mqtt.ProtocolVersion.MqttV5,
          new TextEncoder().encode('2nd'),
          Mqtt.QoS.AtMostOnce,
          false,
          false,
          { topicAlias: 1 },
        );

        broker.sendPublish(
          client.clientId,
          0,
          'topicA',
          Mqtt.ProtocolVersion.MqttV5,
          new TextEncoder().encode('3rd'),
          Mqtt.QoS.AtMostOnce,
          false,
          false,
          { topicAlias: 2 },
        );

        broker.sendPublish(
          client.clientId,
          0,
          '',
          Mqtt.ProtocolVersion.MqttV5,
          new TextEncoder().encode('4th'),
          Mqtt.QoS.AtMostOnce,
          false,
          false,
          { topicAlias: 2 },
        );

        await promise;
      } catch (err) {
        reject();
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // topic alias

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, label: string, ms = 3000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await delay(10);
  }
}

/** The bytes of a QoS 1 PUBLISH from the broker (MQTT 5.0), with the Topic Alias `topicAlias` if it is given. */
function publish(topic: string, packetId: number, topicAlias?: number): Uint8Array {
  return MqttPackets.packetToBytes(
    {
      type: 'publish',
      topic,
      payload: new Uint8Array([0x78]),
      dup: false,
      retain: false,
      qos: Mqtt.QoS.AtLeastOnce,
      packetId,
      ...(topicAlias !== undefined && { properties: { topicAlias } }),
    },
    Mqtt.ProtocolVersion.MqttV5,
  );
}

/** A QoS 1 PUBLISH to 't' with packet ID 1 and the Topic Alias 0, which the encoder does not write. */
const publishWithTopicAliasZero = new Uint8Array([0x32, 0x0A, 0x00, 0x01, 0x74, 0x00, 0x01, 0x03, 0x23, 0x00, 0x00, 0x78]);

/**
 * What a client receives and what the broker gets back: the topics of `publish` events, the packet IDs of PUBACK and the
 * DISCONNECT Reason Codes. The broker answers CONNECT with CONNACK, and keeps the Topic Alias Maximum of each CONNECT.
 */
function record(client: MqttClient | WebSocketMqttClient, broker: TestBroker | TestWsBroker) {
  const recorded = {
    topics: [] as string[],
    pubacks: [] as number[],
    disconnects: [] as (number | undefined)[],
    connectTopicAliasMaximums: [] as (number | undefined)[],
    closed: false,
  };
  client.on('publish', (event) => {
    recorded.topics.push(event.detail.topic);
  });
  client.on('closed', () => {
    recorded.closed = true;
  });
  broker.on('puback', (event) => {
    recorded.pubacks.push(event.detail.packetId);
  });
  broker.on('disconnect', (event) => {
    recorded.disconnects.push(event.detail.reasonCode);
  });
  broker.on('connect', (event) => {
    const packet = event.detail;
    recorded.connectTopicAliasMaximums.push(packet.properties?.topicAliasMaximum);
    broker.sendConnack(packet.clientId, false, packet.protocolVersion);
  });
  return recorded;
}

Deno.test({ name: '@receive topic alias that is not valid', only: false }, async (context) => {
  await context.step(
    'a Topic Alias that has not been set, with an empty Topic Name: not delivered, no PUBACK, and DISCONNECT with Protocol Error',
    async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger, topicAliasMaximumAboutReceive: 3 });
      try {
        broker.listen();
        const recorded = record(client, broker);
        await client.connect();

        await broker.sendRawBytes('cid', publish('topic/ok', 1, 1));
        await waitFor(() => recorded.pubacks.length === 1, 'the PUBACK of the valid PUBLISH');

        await broker.sendRawBytes('cid', publish('', 2, 2));
        await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
        assertEquals(recorded.disconnects, [Mqtt.ReasonCode.ProtocolError]);
        assertEquals(recorded.topics, ['topic/ok']);
        assertEquals(recorded.pubacks, [1]);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    },
  );

  await context.step('a Topic Alias set on the previous connection is not set on the next one [MQTT-3.3.2-7]', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, topicAliasMaximumAboutReceive: 3 });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();
      await broker.sendRawBytes('cid', publish('topic/a', 1, 1));
      await waitFor(() => recorded.pubacks.length === 1, 'the PUBACK on the 1st connection');
      await client.disconnect();
      await waitFor(() => recorded.closed, 'the close of the 1st connection');

      recorded.closed = false;
      await client.connect();
      await broker.sendRawBytes('cid', publish('', 2, 1));
      await waitFor(() => recorded.disconnects.length === 2 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.NormalDisconnection, Mqtt.ReasonCode.ProtocolError]);
      assertEquals(recorded.topics, ['topic/a']);
      assertEquals(recorded.pubacks, [1]);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step(
    'a Topic Alias greater than the Topic Alias Maximum: not delivered, no PUBACK, and DISCONNECT with Topic Alias invalid',
    async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger, topicAliasMaximumAboutReceive: 3 });
      try {
        broker.listen();
        const recorded = record(client, broker);
        await client.connect();

        // The Topic Alias Maximum itself can be used.
        await broker.sendRawBytes('cid', publish('topic/ok', 1, 3));
        await broker.sendRawBytes('cid', publish('', 2, 3));
        await waitFor(() => recorded.pubacks.length === 2, 'the PUBACKs of the valid PUBLISHes');

        await broker.sendRawBytes('cid', publish('topic/b', 3, 4));
        await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
        assertEquals(recorded.disconnects, [Mqtt.ReasonCode.TopicAliasInvalid]);
        assertEquals(recorded.topics, ['topic/ok', 'topic/ok']);
        assertEquals(recorded.pubacks, [1, 2]);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    },
  );

  await context.step('a Topic Alias of 0: DISCONNECT with Topic Alias invalid [MQTT-3.3.2-8]', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger, topicAliasMaximumAboutReceive: 3 });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      await broker.sendRawBytes('cid', publishWithTopicAliasZero);
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.TopicAliasInvalid]);
      assertEquals(recorded.topics, []);
      assertEquals(recorded.pubacks, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  for (
    const [name, options] of [
      ['topicAliasMaximumAboutReceive is not set', {}],
      ['topicAliasMaximumAboutReceive is 0', { topicAliasMaximumAboutReceive: 0 }],
    ] as const
  ) {
    await context.step(`no Topic Alias Maximum is sent when ${name}: any Topic Alias is invalid [MQTT-3.1.2-27]`, async () => {
      const broker = new TestBroker();
      const client = new MqttClient({ clientId: 'cid', logger, ...options });
      try {
        broker.listen();
        const recorded = record(client, broker);
        await client.connect();
        assertEquals(recorded.connectTopicAliasMaximums, [undefined]);

        await broker.sendRawBytes('cid', publish('topic/a', 1, 1));
        await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
        assertEquals(recorded.disconnects, [Mqtt.ReasonCode.TopicAliasInvalid]);
        assertEquals(recorded.topics, []);
        assertEquals(recorded.pubacks, []);
      } finally {
        await client.disconnect(true);
        await broker.destroy();
      }
    });
  }

  await context.step('the Topic Alias Maximum in the CONNECT properties of connect() is the one checked', async () => {
    const broker = new TestBroker();
    const client = new MqttClient({ clientId: 'cid', logger });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect({ properties: { topicAliasMaximum: 2 } });
      assertEquals(recorded.connectTopicAliasMaximums, [2]);

      await broker.sendRawBytes('cid', publish('topic/a', 1, 2));
      await broker.sendRawBytes('cid', publish('', 2, 2));
      await waitFor(() => recorded.pubacks.length === 2, 'the PUBACKs of the valid PUBLISHes');

      await broker.sendRawBytes('cid', publish('topic/b', 3, 3));
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.TopicAliasInvalid]);
      assertEquals(recorded.topics, ['topic/a', 'topic/a']);
      assertEquals(recorded.pubacks, [1, 2]);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });

  await context.step('WebSocket: a Topic Alias that has not been set, with an empty Topic Name: DISCONNECT with Protocol Error', async () => {
    const broker = new TestWsBroker();
    const client = new WebSocketMqttClient({ clientId: 'cid', url: new URL('ws://127.0.0.1:3000/'), logger, topicAliasMaximumAboutReceive: 3 });
    try {
      broker.listen();
      const recorded = record(client, broker);
      await client.connect();

      broker.sendRawBytes('cid', publish('', 1, 1));
      await waitFor(() => recorded.disconnects.length === 1 && recorded.closed, 'DISCONNECT and the close');
      assertEquals(recorded.disconnects, [Mqtt.ReasonCode.ProtocolError]);
      assertEquals(recorded.topics, []);
      assertEquals(recorded.pubacks, []);
    } finally {
      await client.disconnect(true);
      await broker.destroy();
    }
  });
});

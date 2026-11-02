import { Mqtt, MqttPackets, WebSocketMqttClient } from '../../../deno/mod.ts';
import { TestWsBroker } from '../broker/test_ws_broker.ts';
import { assertEquals, fail } from 'std/assert/mod.ts';

function logger(msg: string, ...args: unknown[]): void {
  console.log('[Test Client]', msg, ...args);
}

function publishBytes(topic: string, payload: Uint8Array): Uint8Array {
  return MqttPackets.packetToBytes(
    {
      type: 'publish',
      topic,
      qos: Mqtt.QoS.AT_MOST_ONCE,
      dup: false,
      retain: false,
      payload,
    },
    Mqtt.ProtocolVersion.MQTT_V5,
  );
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let pos = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, pos);
    pos += chunk.length;
  }
  return bytes;
}

// MQTT packets are not aligned with WebSocket messages: one message may carry
// several packets, and one packet may be split across several messages.
// see: https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901285
Deno.test({ name: '@receive framing ws', only: false }, async (context) => {
  await context.step(
    'several packets in one message',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          url: new URL('ws://127.0.0.1:3000/'),
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        const received: string[] = [];
        client.on('publish', (event) => {
          const packet = event.detail;
          received.push(`${packet.topic}:${new TextDecoder().decode(packet.payload)}`);
          if (received.length === 3) {
            assertEquals(received, ['topicA:1st', 'topicB:2nd', 'topicC:3rd']);
            resolve();
          }
        });

        broker.sendRawBytes(
          client.getClientId(),
          concatBytes(
            publishBytes('topicA', new TextEncoder().encode('1st')),
            publishBytes('topicB', new TextEncoder().encode('2nd')),
            publishBytes('topicC', new TextEncoder().encode('3rd')),
          ),
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
    'one packet split across several messages',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          url: new URL('ws://127.0.0.1:3000/'),
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        // A payload over 127 bytes makes the Remaining Length 2 bytes long,
        // so the packet can also be split inside the Remaining Length.
        const payload = new Uint8Array(300).fill(0xAB);

        let count = 0;
        client.on('publish', (event) => {
          const packet = event.detail;
          count++;
          assertEquals(count, 1);
          assertEquals(packet.topic, 'topicA');
          assertEquals(packet.payload, payload);
          resolve();
        });

        const bytes = publishBytes('topicA', payload);
        broker.sendRawBytes(client.getClientId(), bytes.slice(0, 2)); // fixed header byte and 1st Remaining Length byte
        broker.sendRawBytes(client.getClientId(), bytes.slice(2, 10));
        broker.sendRawBytes(client.getClientId(), bytes.slice(10, 200));
        broker.sendRawBytes(client.getClientId(), bytes.slice(200));

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
    'packets split across messages at arbitrary positions',
    async () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();

      const broker = new TestWsBroker();

      try {
        broker.listen();

        const client = new WebSocketMqttClient({
          url: new URL('ws://127.0.0.1:3000/'),
          clientId: 'cid',
          logger: logger,
          clean: true,
          connectTimeoutMS: 10000,
          keepAlive: 10,
        });

        broker.on('connect', (event) => {
          const packet = event.detail;
          broker.sendConnack(packet.clientId, false, packet.protocolVersion);
        });

        await client.connect();

        const received: string[] = [];
        client.on('publish', (event) => {
          const packet = event.detail;
          received.push(`${packet.topic}:${new TextDecoder().decode(packet.payload)}`);
          if (received.length === 2) {
            assertEquals(received, ['topicA:1st', 'topicB:2nd']);
            resolve();
          }
        });

        // The 2nd message carries the end of the 1st packet and the start of the 2nd packet.
        const first = publishBytes('topicA', new TextEncoder().encode('1st'));
        const second = publishBytes('topicB', new TextEncoder().encode('2nd'));
        broker.sendRawBytes(client.getClientId(), first.slice(0, 5));
        broker.sendRawBytes(client.getClientId(), concatBytes(first.slice(5), second.slice(0, 3)));
        broker.sendRawBytes(client.getClientId(), second.slice(3));

        await promise;
      } catch (err) {
        reject();
        fail(`error occured: ${err}`);
      } finally {
        await broker.destroy();
      }
    },
  );
}); // @receive framing ws

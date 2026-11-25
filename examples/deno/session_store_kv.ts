import { KvOutgoingStore, Mqtt, MqttClient } from '@ymjacky/mqtt5';

// Keeps the QoS 1 / QoS 2 messages in flight in Deno KV, so that they are resent after the process restarts.
// Deno KV needs --unstable-kv:
//   deno run --unstable-kv --allow-net --allow-read --allow-write examples/deno/session_store_kv.ts

const logger = (msg: string, ...args: unknown[]) => {
  console.log('[Session store]', msg, ...args);
};

async function main() {
  // The application opens and closes the database. A path can be given: Deno.openKv('./session.sqlite').
  // `using` closes it when main() ends, also when an error is thrown.
  using kv = await Deno.openKv();

  // `await using` calls client.disconnect() when main() ends. What is declared later is disposed of first, so the
  // client disconnects before the database is closed: the client uses the store until then.
  await using client = new MqttClient({
    url: new URL('mqtt://127.0.0.1:1883'),
    // Required with the store: the broker finds the session by the Client Identifier, and the store keeps the
    // messages under it, so it has to be the same every time the process runs.
    clientId: 'sessionStoreA',
    clean: false, // continue the session of the previous run
    outgoingStore: new KvOutgoingStore(kv),
    protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
    keepAlive: 60,
  });

  // The broker keeps the session for an hour after the connection is closed.
  // The messages a previous run left in the store are resent right after connect() resolves, before the message of the
  // publish() below.
  const connack = await client.connect({ properties: { sessionExpiryInterval: 3600 } });
  if (connack.sessionPresent) {
    logger(`the session continues: ${await client.publishInflightCount()} message(s) of a previous run are resent`);
  } else {
    logger('a new session: the messages of a previous run, if any, are removed from the store');
  }

  // The message is stored before it is sent, and removed when the broker acknowledges it.
  // If the process ends in between, the next run resends it.
  const result = await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_LEAST_ONCE });
  logger('published', result);
} // client.disconnect(), then kv.close()

main();

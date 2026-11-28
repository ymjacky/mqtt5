import { ClientErrors, type ClientTypes, Mqtt, MqttClient } from '@ymjacky/mqtt5';

// Reconnects when the connection is closed by the broker (e.g. the broker restarts) or is lost.
// The session is kept, so QoS 1 / QoS 2 messages in flight are resent after reconnecting.

const logger = (msg: string, ...args: unknown[]) => {
  console.log('[Reconnect]', msg, ...args);
};

const maxRetries = 5; // retries after the first attempt
const retryIntervalMs = 10 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether connect() failed in a way that may go away when trying again: CONNACK did not arrive within
 * `connectTimeoutMS`, the connection was closed before CONNACK, or it could not be opened (e.g. the broker is not running).
 */
function isRetryable(err: unknown): boolean {
  return err instanceof ClientErrors.ConnectTimeout ||
    err instanceof ClientErrors.ConnectionClosed || // closed by the broker before CONNACK
    err instanceof Deno.errors.ConnectionRefused ||
    err instanceof Deno.errors.ConnectionReset ||
    err instanceof Deno.errors.ConnectionAborted ||
    err instanceof Deno.errors.TimedOut ||
    err instanceof Deno.errors.NetworkUnreachable;
}

/** Connects, retrying up to `maxRetries` times, `retryIntervalMs` apart. */
async function connectWithRetry(client: MqttClient, options: ClientTypes.ConnectOptions) {
  for (let retries = 0;; retries++) {
    try {
      return await client.connect(options);
    } catch (err) {
      if (!isRetryable(err) || retries >= maxRetries) {
        throw err;
      }
      logger(`connect failed: ${err}. Retrying in ${retryIntervalMs / 1000} s (${retries + 1}/${maxRetries})`);
      await sleep(retryIntervalMs);
    }
  }
}

async function main() {
  const client = new MqttClient({
    url: new URL('mqtt://127.0.0.1:1883'),
    clientId: 'reconnectClient', // a session belongs to a client ID, so use a fixed one
    logger: logger,
    clean: false, // keep the session
    protocolVersion: Mqtt.ProtocolVersion.MqttV5,
    keepAlive: 30,
  });

  const decoder = new TextDecoder();
  client.on('publish', (event) => {
    const packet = event.detail;
    logger(`topic: ${packet.topic}`, `message: ${decoder.decode(packet.payload)}`);
  });

  /** Connects, and subscribes if the broker has no session for this client: the subscriptions are part of the session. */
  async function start() {
    const connack = await connectWithRetry(client, {
      // The broker keeps the session for 300 s after the connection is closed.
      properties: { sessionExpiryInterval: 300 },
    });
    if (connack.reasonCode !== Mqtt.ReasonCode.Success) {
      throw new Error(`the broker refused the connection: reason code ${connack.reasonCode}`);
    }
    if (!connack.sessionPresent) {
      await client.subscribe('topicA', { qos: Mqtt.QoS.AtLeastOnce });
    }
  }

  // True while connected. A connect attempt that fails also emits `closed`; this is false then, so no reconnect starts.
  let online = false;
  // disconnect() was called: do not reconnect.
  let stopping = false;

  client.on('closed', async () => {
    if (!online || stopping) {
      return;
    }
    online = false;
    logger('connection closed, reconnecting');
    // Catch the errors in the listener: the client does not, and an uncaught one would terminate the process.
    try {
      await start();
      online = true;
      logger('reconnected');
    } catch (err) {
      logger('gave up reconnecting:', err);
      Deno.exit(1);
    }
  });

  await start();
  online = true;
  logger('connected');

  // Publish every 5 s while connected. When the connection is closed before PUBACK arrives,
  // the message is resent after reconnecting and the promise resolves then.
  let count = 0;
  const timer = setInterval(() => {
    if (!online) {
      return;
    }
    client.publish('topicA', `message ${++count}`, { qos: Mqtt.QoS.AtLeastOnce })
      .then((result) => logger(`published: reason code ${result.result}`))
      .catch((err) => logger('publish failed:', err)); // e.g. SessionLostError if the broker did not keep the session
  }, 5 * 1000);

  // Ctrl+C: disconnect without reconnecting.
  Deno.addSignalListener('SIGINT', async () => {
    stopping = true;
    clearInterval(timer);
    await client.disconnect();
    Deno.exit();
  });
}

main().catch((err) => {
  logger('gave up:', err);
  Deno.exit(1);
});

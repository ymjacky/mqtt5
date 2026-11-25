import { ClientErrors, Mqtt, MqttClient } from '@ymjacky/mqtt5';

// Connects to the broker, retrying when connect() times out or the connection cannot be opened.

const logger = (msg: string, ...args: unknown[]) => {
  console.log('[ConnectRetry]', msg, ...args);
};

const maxRetries = 5; // retries after the first attempt
const retryIntervalMs = 10 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether connect() failed in a way that may go away when trying again: CONNACK did not arrive within
 * `connectTimeoutMS`, the connection was closed before CONNACK, or it could not be opened (e.g. the broker is not running).
 * Other errors, such as an invalid Will Topic, fail the same way every time.
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

/**
 * Connects, retrying up to `maxRetries` times, `retryIntervalMs` apart.
 * Resolves with CONNACK, which may still be a refusal by the broker: check its reason code.
 */
async function connectWithRetry(client: MqttClient) {
  for (let retries = 0;; retries++) {
    try {
      return await client.connect();
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
    clientId: 'retryClient',
    logger: logger,
    clean: true,
    protocolVersion: Mqtt.ProtocolVersion.MqttV5,
    keepAlive: 30,
    connectTimeoutMS: 10 * 1000, // wait up to 10 s for CONNACK
  });

  const connack = await connectWithRetry(client);
  if (connack.reasonCode !== Mqtt.ReasonCode.Success) {
    throw new Error(`the broker refused the connection: reason code ${connack.reasonCode}`);
  }
  logger('connected');

  await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AtLeastOnce });
  await client.disconnect();
}

main().catch((err) => {
  logger('gave up:', err);
  Deno.exitCode = 1;
});

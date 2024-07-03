import { Mqtt, MqttClient } from 'https://deno.land/x/mqtt5/deno/mod.ts';

const logger = (msg: string, ...args: unknown[]) => {
  console.log('[Publisher]', msg, ...args);
};
async function main() {
  const client = new MqttClient({
    url: new URL('mqtt://127.0.0.1:1883'),
    clientId: 'publisherB',
    clean: true,
    logger: logger,
    protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
    keepAlive: 60,
  });
  await client.connect();

  await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_MOST_ONCE });
}

main();

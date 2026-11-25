import { Mqtt, MqttClient } from '@ymjacky/mqtt5';

const logger = (msg: string, ...args: unknown[]) => {
  console.log('[Publisher]', msg, ...args);
};
async function main() {
  const client = new MqttClient({
    url: new URL('mqtt://127.0.0.1:1883'),
    clientId: 'publisherB',
    clean: true,
    logger: logger,
    protocolVersion: Mqtt.ProtocolVersion.MqttV5,
    keepAlive: 60,
  });
  await client.connect();

  await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AtMostOnce });
}

main();

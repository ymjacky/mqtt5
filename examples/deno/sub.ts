import { Mqtt, MqttClient } from '@ymjacky/mqtt5';

const logger = (msg: string, ...args: unknown[]) => {
  console.log('[Subscriber]', msg, ...args);
};

async function main() {
  const client = new MqttClient({
    url: new URL('mqtt://127.0.0.1:1883'),
    clientId: 'subscriberA',
    logger: logger,
    clean: true,
    protocolVersion: Mqtt.ProtocolVersion.MqttV5,
    keepAlive: 30,
  });

  await client.connect();

  const decoder = new TextDecoder();

  client.on('publish', (event) => {
    const packet = event.detail;
    const receiveMessage = decoder.decode(packet.payload);
    logger(`topic: ${packet.topic}`, `message: ${receiveMessage}`);
  });

  await client.subscribe(['topicA', 'topicB', 'topicC'], { qos: Mqtt.QoS.AtLeastOnce });
}

main();

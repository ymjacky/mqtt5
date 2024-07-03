import { Mqtt, MqttClient, MqttProperties } from 'https://deno.land/x/mqtt5/deno/mod.ts';

const logger = (msg: string, ...args: unknown[]) => {
  console.log('[Subscriber]', msg, ...args);
};

async function main() {
  const client = new MqttClient({
    url: new URL('mqtt://127.0.0.1:1883'),
    clientId: 'subscriberA',
    logger: logger,
    clean: false,
    protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
    keepAlive: 30,
  });

  await client.connect();

  const decoder = new TextDecoder();

  client.on('publish', (event) => {
    const packet = event.detail;
    const receiveMessage = decoder.decode(packet.payload);
    logger(`topic: ${packet.topic}`, `message: ${receiveMessage}`);
  });

  const subPproperties: MqttProperties.SubscribeProperties = {
    userProperties: [
      { key: 'userProp1', val: 'userData1' },
      { key: 'userProp2', val: 'userData2' },
      { key: 'userProp2', val: 'userData3' },
    ],
    subscriptionIdentifier: 1,
  };
  await client.subscribe(['topicA', 'topicB', 'topicC'], Mqtt.QoS.AT_LEAST_ONCE, subPproperties);
}

main();

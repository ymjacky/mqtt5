import { Mqtt, MqttProperties, MqttClient} from '../../deno/mod.ts'

const logger = (msg: string, ...args: unknown[]) =>  {
  console.log('[Publisher]', msg, ...args);
}
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

  const pubProperties: MqttProperties.Properties = {
    payloadFormatIndicator: 1,
    messageExpiryInterval: 60,
    responseTopic: 'responseTopicA',
    correlationData: new TextEncoder().encode('correlationDataA'),
    userProperties: [
      { key: 'userProp1', val: 'userData1' },
      { key: 'userProp2', val: 'userData2' },
      { key: 'userProp2', val: 'userData3' },
    ],
    subscriptionIdentifier: 3,
    contentType: 'application/json',
  };
  await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_MOST_ONCE} , pubProperties);

}

main();

import { Mqtt, WebSocketMqttClient } from 'jsr:@ymjacky/mqtt5';

const logger = (msg: string, ...args: unknown[]) => {
  console.log('[WS-Publisher]', msg, ...args);
};
async function main() {
  const client = new WebSocketMqttClient({
    url: new URL('ws://127.0.0.1:3000'),
    clientId: 'publisherB',
    clean: true,
    logger: logger,
    protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
    keepAlive: 60,
  });
  await client.connect();

  await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AT_LEAST_ONCE });
  await client.disconnect(true);
}

main();

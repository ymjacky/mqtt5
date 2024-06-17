
import { Mqtt, MqttPackets, MqttProperties, MqttClient} from '../../deno/mod.ts'


const logger = (msg: string, ...args: unknown[]) =>  {
  console.log('[WillUser]', msg, ...args);
}
async function main() {


  const client = new MqttClient({
    url: new URL('mqtt://127.0.0.1:1883'),
    clientId: 'WillUser',
    clean: true,
    logger: logger,
    protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
    keepAlive: 60,
  });

  const willPayload = new TextEncoder().encode('will message');
  await client.connect({will: {
    topic: 'topicA',
    qos: Mqtt.QoS.AT_LEAST_ONCE,
    payload: willPayload,
    properties: { userProperties: [ {key: 'userProp1', val: 'userData1'}]},
  }});

  setTimeout(() => {
    client.disconnect(true); // force disconnect
  }, 10 * 1000);

}

main();

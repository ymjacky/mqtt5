import { Mqtt, MqttClient, MqttProperties } from 'https://deno.land/x/mqtt5/deno/mod.ts';

const logger = (msg: string, ...args: unknown[]) => {
  console.log('[Client]', msg, ...args);
};

async function main() {
  const client = new MqttClient({
    url: new URL('mqtt://127.0.0.1:1883'),
    clientId: 'clientA',
    logger: logger,
    clean: true,
    protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
    keepAlive: 30,
  });

  const properties: MqttProperties.ConnectProperties = {
    sessionExpiryInterval: 300,
    receiveMaximum: 10,
    maximumPacketSize: 128,
    topicAliasMaximum: 20,
    requestResponseInformation: false,
    requestProblemInformation: false,
    userProperties: [
      { key: 'userProp1', val: 'userData1' },
      { key: 'userProp2', val: 'userData2' },
      { key: 'userProp2', val: 'userData3' },
    ],
  };

  const connack = await client.connect({ properties });
  logger(`Conncak  reasonCode: ${connack.reasonCode}, sessionPresent: ${connack.sessionPresent}`);
  logger('Conncak  properties:', connack.properties);

  const disconnectProperties: MqttProperties.DisconnectProperties = {
    reasonString: 'trouble',
    sessionExpiryInterval: 300,
  };
  await client.disconnect(false, disconnectProperties);
}

main();

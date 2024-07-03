# mqtt5

``mqtt5`` is a client library for the MQTT protocol, written in Typescript for deno and the browser.

``mqtt5`` supports Mqtt protocol versions 5.0 and 3.1.1.

We have confirmed that deno version 1.44.2 or later works.

## Usage

### Deno CLI
[deno.land](https://deno.land/x/mqtt5@0.0.5)
```
import { Mqtt, MqttProperties, MqttClient } from "https://deno.land/x/mqtt5@^0.0.5/deno/mod.ts";
```

[jsr](https://jsr.io/@ymjacky/mqtt5)
```
import { Mqtt, MqttProperties, MqttClient } from "jsr:@ymjacky/mqtt5@^0.0.5";
```

### Browser

The following command creates ``mqtt5.js`` in the browser directory.
```
deno task build_ems
```
Import and use ``mqtt5.js``.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Test</title>
  </head>
  <body>
    <script type="module">
      import { Mqtt, WebSocketMqttClient } from './mqtt5.mjs';

      const logger = (msg, ...args) =>  {
        console.log('[WS-client]', msg, ...args);
      }

      async function main() {
        const client = new WebSocketMqttClient({
          url: new URL('wss://localhost:18083'),
          clientId: 'someone',
          clean: true,
          logger: logger,
          protocolVersion: Mqtt.ProtocolVersion.MQTT_V5,
          keepAlive: 60,
        });

        await client.connect();
      }
      main();
    </script>
  </body>
</html>
```


## Library Features

The following features are supported.

1. MQTT V3.1.1
2. MQTT V5.0
   - Properties
   - Auth Packet
   - ReasonCode
3. SharedSubscription
   - Enabled by specifying a topic beginning with ``$share/{sharename}/`` in the topicfilter of the subscribe packet.
   - example: ``client.subscribe('$share/sg1/topicA', Mqtt.QoS.AT_MOST_ONCE);``
4. TopicAlias
   - If the ClientOption's topicAliasMaximumAboutSend is set to 0 or more, the TopicAlias will be automatically assigned to the Publish packet to be sent.
   - If the ClientOption topicAliasMaximumAboutReceive is set to 0 or higher, the Connect packet will automatically be assigned the topicAliasMaximum property.
5. ServerRedirect
   - You need to look at the ``serverReference`` property of the CONNACK or DISCONNECT packet and reconnect yourself!
6. Request/Response
   - SUBSCRIBE  to the topic marked by the ``responseInformation`` property of the CONNACK packet

### not supported

The following functions are not supported.
(*) marks are features that will be supported in future versions.

1. (*) persistent session file store
2. (*) Use of client certificates for connections
3. (*) Specifying CA certificates in websocket secure (WSS)
4. Use of the ``rejectunauthorized`` option for TLS connections
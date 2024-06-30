# mqtt5

``mqtt5`` is a client library for the MQTT protocol, written in Typescript for deno and the browser.

``mqtt5`` supports Mqtt protocol versions 5.0 and 3.1.1.

We have confirmed that deno version 1.44.2 or later works.

## Usage

### Deno CLI
```
import { Mqtt, MqttProperties, MqttClient } from "https://github.com/ymjacky/mqtt5/raw/main/deno/mod.ts";
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


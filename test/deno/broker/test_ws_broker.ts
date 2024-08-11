import { Mqtt, MqttPackets, MqttProperties } from '../../../deno/mod.ts';

export interface CustomEventMap {
  'accept': CustomEvent<WebSocket>;
  'closed': CustomEvent<void>;
  'connect': CustomEvent<MqttPackets.ConnectPacket>;
  'connack': CustomEvent<MqttPackets.ConnackPacket>;
  'publish': CustomEvent<MqttPackets.PublishPacket>;
  'puback': CustomEvent<MqttPackets.PubackPacket>;
  'pubrec': CustomEvent<MqttPackets.PubrecPacket>;
  'pubrel': CustomEvent<MqttPackets.PubrelPacket>;
  'pubcomp': CustomEvent<MqttPackets.PubcompPacket>;
  'subscribe': CustomEvent<MqttPackets.SubscribePacket>;
  'suback': CustomEvent<MqttPackets.SubackPacket>;
  'unsubscribe': CustomEvent<MqttPackets.UnsubscribePacket>;
  'unsuback': CustomEvent<MqttPackets.UnsubackPacket>;
  'pingreq': CustomEvent<MqttPackets.PingreqPacket>;
  'pingresp': CustomEvent<MqttPackets.PingrespPacket>;
  'disconnect': CustomEvent<MqttPackets.DisconnectPacket>;
  'auth': CustomEvent<MqttPackets.AuthPacket>;
}
export interface CustomEventListener<T = unknown> {
  (evt: T): void | Promise<void>;
}
export const createCustomEvent = <T extends keyof CustomEventMap>(
  type: T,
  eventInitDict: CustomEventInit<
    CustomEventMap[T] extends CustomEvent<infer T> ? T : never
  >,
) => new CustomEvent(type, eventInitDict);

class Client {
  public clientId;
  public protocolVersion: Mqtt.ProtocolVersion;
  public conn;
  constructor(
    clientId: string,
    protocolVersion: Mqtt.ProtocolVersion,
    conn: WebSocket,
  ) {
    this.clientId = clientId;
    this.protocolVersion = protocolVersion;
    this.conn = conn;
  }

  async destrory() {
    this.conn.close();
    return await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function log(msg: string, ...args: unknown[]): void {
  console.log(`[Test Ws Broker] ${msg}`, ...args);
}

export class TestWsBroker extends EventTarget {
  server?: Deno.HttpServer;
  clients: Map<string, Client>;
  closeDefer?: Promise<void>;

  constructor() {
    super();
    this.clients = new Map<string, Client>();

    this.on('accept', (event) => {
      const conn = event.detail;

      this.register(conn);
    });
  }

  on = <T extends keyof CustomEventMap>(
    type: T,
    callback: CustomEventListener<CustomEventMap[T]>,
  ) => {
    this.addEventListener(type, callback as EventListener);
  };

  listen(port: number = 3000) {
    this.server = Deno.serve({
      port: port,
      hostname: '[::]',
      handler: (request: Request, info): Response => {
        const { method } = request;

        log(`connecting from ${info.remoteAddr.hostname}:${info.remoteAddr.port} , user-agent: ${request.headers.get('user-agent')}`);

        if (method === 'GET') {
          if (request.headers.get('upgrade') === 'websocket') {
            const { socket, response } = Deno.upgradeWebSocket(request);
            socket.binaryType = 'arraybuffer';

            this.dispatchEvent(
              createCustomEvent('accept', { detail: socket }),
            );

            return response;
          }
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    const { promise, resolve } = Promise.withResolvers<void>();
    this.closeDefer = promise;

    this.server.finished.then(() => {
      resolve();
      log('Server closed');
    });
  }

  listenTls(port: number = 443) {
    this.server = Deno.serve({
      port: port,
      hostname: '[::]',
      cert: Deno.readTextFileSync('test/deno/test_certs/server.crt.pem'),
      key: Deno.readTextFileSync('test/deno/test_certs/server.key.pem'),
      handler: (request: Request, info): Response => {
        const { method } = request;

        log(`connecting from ${info.remoteAddr.hostname}:${info.remoteAddr.port} , user-agent: ${request.headers.get('user-agent')}`);

        if (method === 'GET') {
          if (request.headers.get('upgrade') === 'websocket') {
            const { socket, response } = Deno.upgradeWebSocket(request);
            socket.binaryType = 'arraybuffer';

            this.dispatchEvent(
              createCustomEvent('accept', { detail: socket }),
            );

            return response;
          }
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    const { promise, resolve } = Promise.withResolvers<void>();
    this.closeDefer = promise;

    this.server.finished.then(() => {
      resolve();
      log('Server closed');
    });
  }

  private register(conn: WebSocket) {
    conn.onclose = (_e: CloseEvent) => {
      log('websocket connection closed');
      this.dispatchEvent(
        createCustomEvent('closed', {}),
      );
    };

    conn.onerror = (e: Event) => {
      if (e instanceof ErrorEvent) {
        log('error occured.', e.message);
      }
      conn.close();
    };

    conn.onmessage = (e: MessageEvent<unknown>) => {
      const receiveBytes = new Uint8Array(e.data as ArrayBuffer);
      log('receive bytes', receiveBytes);
      const packet = MqttPackets.decode(receiveBytes);
      log('receive packet', packet);

      switch (packet.type) {
        case 'connect':
          log('receive connect packet');

          this.clients.set(
            packet.clientId,
            new Client(packet.clientId, packet.protocolVersion, conn),
          );

          this.dispatchEvent(
            createCustomEvent('connect', {
              detail: packet as MqttPackets.ConnectPacket,
            }),
          );
          break;
        case 'connack':
          log('receive connack packet');
          break;
        case 'publish':
          this.dispatchEvent(
            createCustomEvent('publish', {
              detail: packet as MqttPackets.PublishPacket,
            }),
          );
          break;
        case 'puback':
          this.dispatchEvent(
            createCustomEvent('puback', {
              detail: packet as MqttPackets.PubackPacket,
            }),
          );
          break;
        case 'pubrec':
          this.dispatchEvent(
            createCustomEvent('pubrec', {
              detail: packet as MqttPackets.PubrecPacket,
            }),
          );
          break;
        case 'pubrel':
          this.dispatchEvent(
            createCustomEvent('pubrel', {
              detail: packet as MqttPackets.PubrelPacket,
            }),
          );
          break;
        case 'pubcomp':
          this.dispatchEvent(
            createCustomEvent('pubcomp', {
              detail: packet as MqttPackets.PubcompPacket,
            }),
          );
          break;
        case 'subscribe':
          this.dispatchEvent(
            createCustomEvent('subscribe', {
              detail: packet as MqttPackets.SubscribePacket,
            }),
          );
          break;
        case 'suback':
          this.dispatchEvent(
            createCustomEvent('suback', {
              detail: packet as MqttPackets.SubackPacket,
            }),
          );
          break;
        case 'unsubscribe':
          this.dispatchEvent(
            createCustomEvent('unsubscribe', {
              detail: packet as MqttPackets.UnsubscribePacket,
            }),
          );
          break;
        case 'unsuback':
          this.dispatchEvent(
            createCustomEvent('unsuback', {
              detail: packet as MqttPackets.UnsubackPacket,
            }),
          );
          break;
        case 'pingreq':
          this.dispatchEvent(
            createCustomEvent('pingreq', {
              detail: packet as MqttPackets.PingreqPacket,
            }),
          );
          break;
        case 'pingresp':
          log('receive pingresp packet');
          break;
        case 'disconnect':
          this.dispatchEvent(
            createCustomEvent('disconnect', {
              detail: packet as MqttPackets.DisconnectPacket,
            }),
          );
          break;
        case 'auth':
          log('receive auth packet');
          this.dispatchEvent(
            createCustomEvent('auth', {
              detail: packet as MqttPackets.AuthPacket,
            }),
          );
          break;
      }
    };
  }

  async destroy() {
    for (const client of this.clients.values()) {
      await client.destrory();
    }

    log('destroy the server.');
    if (this.server) {
      await this.server.shutdown();
    }
  }

  async sendConnack(
    clientId: string,
    sessionPresent: boolean,
    protocolVersion: Mqtt.ProtocolVersion,
    returnValue: number = 0, // success
    properties?: MqttProperties.Properties,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      let packet: MqttPackets.ConnackPacket;
      if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        packet = {
          type: 'connack',
          sessionPresent,
          reasonCode: returnValue as Mqtt.ReasonCode,
          properties,
        };
      } else {
        packet = {
          type: 'connack',
          sessionPresent,
          returnCode: returnValue as Mqtt.V3_1_1_ConnectReturnCode,
        };
      }

      log(`sending packet`, packet);
      const bytes = MqttPackets.packetToBytes(packet, protocolVersion);
      log(`sending bytes`, bytes);

      await client.conn.send(bytes);
    }
  }

  async sendPublish(
    clientId: string,
    packetId: number,
    topic: string,
    protocolVersion: Mqtt.ProtocolVersion,
    payload: Uint8Array,
    qos: Mqtt.QoS,
    dup: boolean = false,
    retain: boolean = false,
    properties?: MqttProperties.Properties,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      let packet: MqttPackets.PublishPacket;
      if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        packet = {
          type: 'publish',
          packetId,
          topic,
          qos,
          dup,
          retain,
          payload,
          properties,
        };
      } else {
        packet = {
          type: 'publish',
          packetId,
          topic,
          qos,
          dup,
          retain,
          payload,
        };
      }

      log(`sending packet`, packet);
      const bytes = MqttPackets.packetToBytes(packet, protocolVersion);
      log(`sending bytes`, bytes);

      await client.conn.send(bytes);
    }
  }

  async sendPuback(
    clientId: string,
    packetId: number,
    protocolVersion: Mqtt.ProtocolVersion,
    returnValue: number = 0, // success
    properties?: MqttProperties.Properties,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      let packet: MqttPackets.PubackPacket;
      if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        packet = {
          type: 'puback',
          packetId,
          reasonCode: returnValue,
          properties,
        };
      } else {
        packet = {
          type: 'puback',
          packetId,
        };
      }

      log(`sending packet`, packet);
      const bytes = MqttPackets.packetToBytes(packet, protocolVersion);
      log(`sending bytes`, bytes);

      await client.conn.send(bytes);
    }
  }

  async sendPubrec(
    clientId: string,
    packetId: number,
    protocolVersion: Mqtt.ProtocolVersion,
    returnValue: number = 0, // success
    properties?: MqttProperties.Properties,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      let packet: MqttPackets.PubrecPacket;
      if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        packet = {
          type: 'pubrec',
          packetId,
          reasonCode: returnValue,
          properties,
        };
      } else {
        packet = {
          type: 'pubrec',
          packetId,
        };
      }

      log(`sending packet`, packet);
      const bytes = MqttPackets.packetToBytes(packet, protocolVersion);
      log(`sending bytes`, bytes);

      await client.conn.send(bytes);
    }
  }

  async sendPubrel(
    clientId: string,
    packetId: number,
    protocolVersion: Mqtt.ProtocolVersion,
    returnValue: number = 0, // success
    properties?: MqttProperties.Properties,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      let packet: MqttPackets.PubrelPacket;
      if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        packet = {
          type: 'pubrel',
          packetId,
          reasonCode: returnValue,
          properties,
        };
      } else {
        packet = {
          type: 'pubrel',
          packetId,
        };
      }

      log(`sending packet`, packet);
      const bytes = MqttPackets.packetToBytes(packet, protocolVersion);
      log(`sending bytes`, bytes);

      await client.conn.send(bytes);
    }
  }

  async sendPubcomp(
    clientId: string,
    packetId: number,
    protocolVersion: Mqtt.ProtocolVersion,
    returnValue: number = 0, // success
    properties?: MqttProperties.Properties,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      let packet: MqttPackets.PubcompPacket;
      if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        packet = {
          type: 'pubcomp',
          packetId,
          reasonCode: returnValue,
          properties,
        };
      } else {
        packet = {
          type: 'pubcomp',
          packetId,
        };
      }

      log(`sending packet`, packet);
      const bytes = MqttPackets.packetToBytes(packet, protocolVersion);
      log(`sending bytes`, bytes);

      await client.conn.send(bytes);
    }
  }

  async sendSuback(
    clientId: string,
    packetId: number,
    protocolVersion: Mqtt.ProtocolVersion,
    returnValues: number[] = [0], // success
    properties?: MqttProperties.Properties,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      let packet: MqttPackets.SubackPacket;
      if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        packet = {
          type: 'suback',
          packetId,
          reasonCodes: returnValues,
          properties,
        };
      } else {
        packet = {
          type: 'suback',
          packetId,
          returnCodes: returnValues,
        };
      }

      log(`sending packet`, packet);
      const bytes = MqttPackets.packetToBytes(packet, protocolVersion);
      log(`sending bytes`, bytes);

      await client.conn.send(bytes);
    }
  }

  async sendUnsuback(
    clientId: string,
    packetId: number,
    protocolVersion: Mqtt.ProtocolVersion,
    returnValues: number[] = [0], // success
    properties?: MqttProperties.Properties,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      let packet: MqttPackets.UnsubackPacket;
      if (protocolVersion > Mqtt.ProtocolVersion.MQTT_V3_1_1) {
        packet = {
          type: 'unsuback',
          packetId,
          reasonCodes: returnValues,
          properties,
        };
      } else {
        packet = {
          type: 'unsuback',
          packetId,
        };
      }

      log(`sending packet`, packet);
      const bytes = MqttPackets.packetToBytes(packet, protocolVersion);
      log(`sending bytes`, bytes);

      await client.conn.send(bytes);
    }
  }

  async sendDisconnect(
    clientId: string,
    reasonCode: Mqtt.ReasonCode,
    properties?: MqttProperties.DisconnectProperties,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      const packet: MqttPackets.DisconnectPacket = {
        type: 'disconnect',
        reasonCode,
        properties,
      };

      log(`sending packet`, packet);
      const bytes = MqttPackets.packetToBytes(packet, Mqtt.ProtocolVersion.MQTT_V5);
      log(`sending bytes`, bytes);

      await client.conn.send(bytes);
    }
  }
  async sendAuth(
    clientId: string,
    reasonCode: Mqtt.ReasonCode,
    properties?: MqttProperties.AuthProperties,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      const packet: MqttPackets.AuthPacket = {
        type: 'auth',
        reasonCode,
        properties,
      };

      log(`sending packet`, packet);
      const bytes = MqttPackets.packetToBytes(packet, Mqtt.ProtocolVersion.MQTT_V5);
      log(`sending bytes`, bytes);

      await client.conn.send(bytes);
    }
  }

  async closeConnectionFromBroker(
    clientId: string,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      await client.conn.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.clients.delete(clientId);
  }
}

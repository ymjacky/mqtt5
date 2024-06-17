import { ClientErrors, Mqtt, MqttPackets, MqttProperties } from '../../../deno/mod.ts';
import * as MqttStream from '../../../lib/mqtt_stream_utils/mod.ts';

interface CustomEventMap {
  'accept': CustomEvent<Deno.Conn<Deno.Addr>>;
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
const createCustomEvent = <T extends keyof CustomEventMap>(
  type: T,
  eventInitDict: CustomEventInit<
    CustomEventMap[T] extends CustomEvent<infer T> ? T : never
  >,
) => new CustomEvent(type, eventInitDict);

function log(msg: string, ...args: unknown[]): void {
  console.log(`[Test Broker] ${msg}`, ...args);
}

class Client {
  public clientId;
  public protocolVersion: Mqtt.ProtocolVersion;
  public conn;
  public reader;
  public writer;
  constructor(
    clientId: string,
    protocolVersion: Mqtt.ProtocolVersion,
    conn: Deno.Conn,
  ) {
    this.clientId = clientId;
    this.protocolVersion = protocolVersion;
    this.conn = conn;
    this.reader = conn.readable.getReader({ mode: 'byob' });
    this.writer = conn.writable.getWriter();
  }

  destrory() {
    this.writer.releaseLock();
    this.writer.close();
    this.reader.releaseLock();
    this.conn.close();
  }
}

export class TestBroker extends EventTarget {
  listener?: Deno.Listener;
  clients: Map<string, Client>;
  closeDefer?: Promise<void>;

  constructor() {
    super();
    this.clients = new Map<string, Client>();

    this.on('accept', (event) => {
      const conn = event.detail;

      const { hostname, port } = conn.remoteAddr as Deno.NetAddr;
      log(`accept conn: ${hostname}:${port}`);

      this.register(conn);
    });
  }

  private async register(conn: Deno.Conn<Deno.Addr>) {
    const reader: ReadableStreamBYOBReader = conn.readable.getReader({
      mode: 'byob',
    });

    const receiveBytes = await MqttStream.readMqttBytes(reader);
    log('receiveBytes', receiveBytes);
    const packet = MqttPackets.decode(receiveBytes);
    log('receivePacket', packet);

    if (packet.type === 'connect') {
      reader.releaseLock();

      this.clients.set(
        packet.clientId,
        new Client(packet.clientId, packet.protocolVersion, conn),
      );

      this.dispatchEvent(
        createCustomEvent('connect', { detail: packet }),
      );
    }
  }

  async listen(port: number = 1883) {
    this.listener = Deno.listen({ port: port, transport: 'tcp' });
    const { promise, resolve } = Promise.withResolvers<void>();
    this.closeDefer = promise;

    for await (const conn of this.listener) {
      const connection: Deno.Conn<Deno.Addr> = conn as Deno.Conn<Deno.Addr>;

      this.dispatchEvent(
        createCustomEvent('accept', { detail: connection }),
      );
    }

    resolve(); // close complete
  }

  async listenTls(port: number = 8883) {
    this.listener = Deno.listenTls({
      port: port,
      transport: 'tcp',
      cert: Deno.readTextFileSync('test/deno/test_certs/server.crt.pem'),
      key: Deno.readTextFileSync('test/deno/test_certs/server.key.pem'),
    });
    const { promise, resolve } = Promise.withResolvers<void>();
    this.closeDefer = promise;

    for await (const conn of this.listener) {
      const connection: Deno.Conn<Deno.Addr> = conn as Deno.Conn<Deno.Addr>;

      this.dispatchEvent(
        createCustomEvent('accept', { detail: connection }),
      );
    }

    resolve(); // close complete
  }
  on = <T extends keyof CustomEventMap>(
    type: T,
    callback: CustomEventListener<CustomEventMap[T]>,
  ) => {
    this.addEventListener(type, callback as EventListener);
  };

  async destroy() {
    if (this.listener) {
      try {
        this.listener.close();
      } catch {
        // Listner has already been closeed.
      }
    }
    for (const client of this.clients.values()) {
      await client.reader.cancel();
    }

    // wait for listner close
    if (this.closeDefer) {
      await this.closeDefer;
    }
  }

  async startRead(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) { // not found
      return;
    }

    try {
      do {
        const receiveBytes = await MqttStream.readMqttBytes(client.reader);
        log('receiveBytes', receiveBytes);
        const packet = MqttPackets.decode(receiveBytes, client.protocolVersion);
        log('receivePacket', packet);

        switch (packet.type) {
          case 'connect':
            log('receive connect packet');
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
      } while (true);
    } catch (e) {
      if (e instanceof ClientErrors.ConnectionClosed) {
        this.dispatchEvent(
          createCustomEvent('closed', {}),
        );
      } else {
        throw e;
      }
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

      await client.writer.ready;
      await client.writer.write(bytes);
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

      await client.writer.ready;
      await client.writer.write(bytes);
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

      await client.writer.ready;
      await client.writer.write(bytes);
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

      await client.writer.ready;
      await client.writer.write(bytes);
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

      await client.writer.ready;
      await client.writer.write(bytes);
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

      await client.writer.ready;
      await client.writer.write(bytes);
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

      await client.writer.ready;
      await client.writer.write(bytes);
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

      await client.writer.ready;
      await client.writer.write(bytes);
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
      await client.writer.ready;
      await client.writer.write(bytes);
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
      await client.writer.ready;
      await client.writer.write(bytes);
    }
  }

  async closeConnectionFromBroker(
    clientId: string,
  ) {
    const client = this.clients.get(clientId);
    if (client) { // found
      await client.reader.cancel();
    }
    this.clients.delete(clientId);
  }
}

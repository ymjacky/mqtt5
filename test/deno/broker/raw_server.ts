import { Mqtt, MqttPackets } from '../../../deno/mod.ts';

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Waits until `condition` is true. Rejects after `ms`, instead of letting the test hang. */
export async function waitUntil(condition: () => boolean, label: string, ms = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) {
      throw new Error(`${label}: not within ${ms} ms`);
    }
    await delay(10);
  }
}

/** A connection accepted by {@link RawServer}. */
export class RawConnection {
  /** All the bytes received so far. */
  received: Uint8Array = new Uint8Array(0);
  /** Whether the connection is closed, by the client or by close(). */
  isClosed = false;
  /** Resolves when the connection is closed, by the client or by close(). */
  readonly closed: Promise<void>;
  #conn: Deno.Conn;

  constructor(conn: Deno.Conn) {
    this.#conn = conn;
    this.closed = this.#read();
  }

  async #read() {
    try {
      for await (const chunk of this.#conn.readable) {
        const received = new Uint8Array(this.received.length + chunk.length);
        received.set(this.received);
        received.set(chunk, this.received.length);
        this.received = received;
      }
    } catch {
      // reset by the client, closed by close(), or a failed TLS handshake
    }
    this.isClosed = true;
  }

  async send(bytes: Uint8Array): Promise<void> {
    const writer = this.#conn.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  }

  close(): void {
    try {
      this.#conn.close();
    } catch {
      // already closed
    }
  }
}

/**
 * A TCP (or TLS) server that accepts connections but does not speak MQTT by itself: the test decides what is sent
 * and when, and sees whether the client closes the connection. For what `TestBroker` cannot do, e.g. a peer that
 * never answers, or a connection on which CONNECT never arrives.
 */
export class RawServer {
  readonly connections: RawConnection[] = [];
  #listener: Deno.Listener;
  #accepting: Promise<void>;

  constructor(options: { port: number; tls?: boolean }) {
    this.#listener = options.tls
      ? Deno.listenTls({
        port: options.port,
        cert: Deno.readTextFileSync('test/deno/test_certs/server.crt.pem'),
        key: Deno.readTextFileSync('test/deno/test_certs/server.key.pem'),
      })
      : Deno.listen({ port: options.port });
    this.#accepting = this.#accept();
  }

  async #accept() {
    try {
      for await (const conn of this.#listener) {
        this.connections.push(new RawConnection(conn));
      }
    } catch {
      // the listener is closed
    }
  }

  /** Waits for the connection accepted `index`-th (from 0). */
  async connection(index: number): Promise<RawConnection> {
    await waitUntil(() => this.connections.length > index, `connection ${index}`);
    const connection = this.connections[index];
    if (connection === undefined) {
      throw new Error(`connection ${index} has not been accepted`);
    }
    return connection;
  }

  async close(): Promise<void> {
    this.#listener.close();
    await this.#accepting;
    for (const connection of this.connections) {
      connection.close();
      await connection.closed;
    }
  }
}

/** CONNACK (MQTT 5.0) that accepts the connection. */
export function connackBytes(sessionPresent = false): Uint8Array {
  return MqttPackets.packetToBytes({ type: 'connack', sessionPresent, reasonCode: Mqtt.ReasonCode.Success }, Mqtt.ProtocolVersion.MqttV5);
}

/**
 * Answers the WebSocket opening handshake of a client on a raw connection. Afterwards the server is a WebSocket peer
 * that does nothing by itself: it answers neither Ping nor Close frames, like a peer that has become unreachable
 * while the TCP connection is still open.
 * @returns the length of the handshake request: what is received after it are WebSocket frames.
 */
export async function acceptWebSocket(connection: RawConnection): Promise<number> {
  const decoder = new TextDecoder();
  await waitUntil(() => decoder.decode(connection.received).includes('\r\n\r\n'), 'the WebSocket handshake request');
  const request = decoder.decode(connection.received);
  const key = /^sec-websocket-key:\s*(\S+)\s*$/im.exec(request)?.[1];
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`));
  const accept = btoa(String.fromCharCode(...new Uint8Array(digest)));
  await connection.send(new TextEncoder().encode(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      'Sec-WebSocket-Protocol: mqtt\r\n\r\n',
  ));
  return request.indexOf('\r\n\r\n') + 4;
}

/** Wraps a payload shorter than 126 bytes in a binary WebSocket frame, as a server sends it (not masked). */
export function webSocketFrame(payload: Uint8Array): Uint8Array {
  if (payload.length > 125) {
    throw new Error('payload too long for this helper');
  }
  return new Uint8Array([0x82, payload.length, ...payload]);
}

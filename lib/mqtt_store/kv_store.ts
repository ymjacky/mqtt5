import * as Mqtt from '../mqtt/mod.ts';
import * as MqttPackets from '../mqtt_packets/mod.ts';
import type { OutgoingStore } from './store.ts';

type StoredPacket = MqttPackets.PublishPacketWithId | MqttPackets.PubrelPacket;

/** The value kept in Deno KV for a packet. */
type Entry = {
  /** The position of the packet among the stored ones: the packets are resent in ascending order. */
  seq: number;
  /** The packet encoded as MQTT 5.0, a format that does not depend on the version of this library. */
  bytes: Uint8Array;
};

/** Options for {@link KvOutgoingStore}. */
export type KvOutgoingStoreOptions = {
  /**
   * The first parts of the keys of the store. The keys are `[...prefix, clientId, 'outgoing', packetId]`,
   * with the Client Identifier of the client that uses the store.
   * @default {['mqtt5']}
   */
  prefix?: Deno.KvKey;
  /** Called with debug logs. */
  logger?: (msg: string, ...args: unknown[]) => void;
};

// Deno KV keeps values of up to 65,536 bytes at present (checked with Deno 2.3.1 and 2.9.8): an entry with 65,499 bytes
// fits, with 65,500 it does not. A test stores a packet of the largest size, to notice when Deno KV changes.
const maximumEntryBytes = 65499;

/**
 * An {@link OutgoingStore} that keeps the packets in {@link https://docs.deno.com/deploy/kv/ | Deno KV}, so that
 * QoS 1 and QoS 2 messages in flight are resent after the process restarts. Deno only; Deno KV needs `--unstable-kv`.
 *
 * Deno KV is an unstable API: Deno may change it in a future version, and this store, its size limit and the format
 * of the stored messages may change with it.
 *
 * The session of the broker is found by the Client Identifier, so the client needs a fixed one: a client without
 * `clientId` cannot be created with this store. The store keeps the packets under the Client Identifier of its client.
 * The messages are resent when the broker still has the session (Session Present in CONNACK); otherwise the client
 * removes them from the store.
 *
 * The store does not open or close the database: close it after the client has disconnected.
 * Use a database file of its own for each process, and never the same Client Identifier from more than one client
 * at the same time. Clients with different Client Identifiers in the same process can share the database.
 *
 * A QoS 1 or QoS 2 PUBLISH larger than {@link KvOutgoingStore.maximumPacketSize} bytes cannot be kept:
 * `publish()` rejects with `PacketTooLargeError`.
 *
 * @example
 * ```ts
 * import { KvOutgoingStore, Mqtt, MqttClient } from '@ymjacky/mqtt5';
 *
 * const kv = await Deno.openKv();
 * const client = new MqttClient({ clientId: 'clientA', clean: false, outgoingStore: new KvOutgoingStore(kv) });
 *
 * await client.connect({ properties: { sessionExpiryInterval: 3600 } });
 * await client.publish('topicA', 'payload', { qos: Mqtt.QoS.AtLeastOnce });
 * await client.disconnect();
 * kv.close();
 * ```
 */
export class KvOutgoingStore implements OutgoingStore {
  /**
   * The size in bytes of the largest packet the store can keep, from the size of the values Deno KV accepts at present.
   * It is a fixed value and does not follow a change of Deno KV.
   * A packet of this size fits whatever the protocol version of the client.
   */
  static readonly maximumPacketSize: number = maximumEntryBytes - 1; // MQTT 3.1.1 PUBLISH is one byte longer as MQTT 5.0

  /** The size in bytes of the largest packet the store can keep. */
  readonly maximumPacketSize: number = KvOutgoingStore.maximumPacketSize;

  private kv: Deno.Kv;
  private prefix: Deno.KvKey;
  private clientId?: string;
  private log: (msg: string, ...args: unknown[]) => void;

  // The seq of the stored packets by packet ID, read from the database when the store is first used.
  private sequences?: Promise<Map<number, number>>;
  private nextSeq = 1;

  /**
   * Creates a store. The client it is given to tells it its Client Identifier.
   * @param kv the database, opened with `Deno.openKv()`.
   */
  constructor(kv: Deno.Kv, options?: KvOutgoingStoreOptions) {
    this.kv = kv;
    this.prefix = options?.prefix ?? ['mqtt5'];
    this.log = options?.logger ?? (() => {});
  }

  /**
   * Sets the Client Identifier of the session the store keeps. Called by the client the store is given to.
   * @throws {Error} if `clientId` is empty: a session cannot be found again with a Client Identifier assigned by the
   * broker. Also if the store is already used with another Client Identifier.
   */
  setClientId(clientId: string): void {
    if (!clientId) {
      throw new Error('KvOutgoingStore needs a client with a clientId: the session is found again by it after the process restarts');
    }
    if (this.clientId !== undefined && this.clientId !== clientId) {
      throw new Error(`the KvOutgoingStore is already used with the Client Identifier '${this.clientId}'`);
    }
    this.clientId = clientId;
  }

  /** Stores a packet by its packet ID. Rejects if the packet has no packet ID or cannot be kept in Deno KV. */
  async store(packet: StoredPacket): Promise<void> {
    if (!packet.packetId) {
      throw new Error('missing packet.packetId');
    }
    const bytes = MqttPackets.packetToBytes(packet, Mqtt.ProtocolVersion.MqttV5);
    if (bytes.length > maximumEntryBytes) {
      throw new Error(`${packet.type.toUpperCase()} is ${bytes.length} bytes, larger than the ${maximumEntryBytes} bytes Deno KV can keep`);
    }

    const sequences = await this.load();
    // No await between reading and updating nextSeq: concurrent calls get different positions.
    const seq = sequences.get(packet.packetId) ?? this.nextSeq++;
    const entry: Entry = { seq, bytes };
    await this.kv.set(this.key(packet.packetId), entry);
    sequences.set(packet.packetId, seq);
  }

  /** Returns whether a packet with the packet ID is stored. */
  async has(packetId: number): Promise<boolean> {
    return (await this.load()).has(packetId);
  }

  /** Removes the packet with the packet ID. */
  async discard(packetId: number): Promise<void> {
    const sequences = await this.load();
    await this.kv.delete(this.key(packetId));
    sequences.delete(packetId);
  }

  /** Returns the number of stored packets. */
  async count(): Promise<number> {
    return (await this.load()).size;
  }

  /** Removes all packets of the Client Identifier. */
  async clear(): Promise<void> {
    for await (const { key } of this.kv.list({ prefix: this.keyPrefix() })) {
      await this.kv.delete(key);
    }
    this.sequences = Promise.resolve(new Map<number, number>());
    this.nextSeq = 1;
  }

  /** Iterates over the stored packets to resend, in the order they were first stored. */
  async *resendIterator(): AsyncIterableIterator<StoredPacket> {
    await this.load();
    const stored: { seq: number; packet: StoredPacket }[] = [];
    for await (const { key, value } of this.kv.list({ prefix: this.keyPrefix() })) {
      const read = this.read(key, value);
      if (read) {
        stored.push(read);
      }
    }
    stored.sort((a, b) => a.seq - b.seq);
    for (const { packet } of stored) {
      yield packet;
    }
  }

  /** The first parts of the keys of the Client Identifier. */
  private keyPrefix(): Deno.KvKey {
    if (this.clientId === undefined) {
      throw new Error('the KvOutgoingStore is not used by a client yet: give it to a client as `outgoingStore`');
    }
    return [...this.prefix, this.clientId, 'outgoing'];
  }

  /** The key of the stored packet with the packet ID. */
  private key(packetId: number): Deno.KvKey {
    return [...this.keyPrefix(), packetId];
  }

  /**
   * Reads the seq of the stored packets, once. An entry that cannot be read, e.g. changed by another program,
   * is removed: it must not prevent the client from connecting.
   */
  private load(): Promise<Map<number, number>> {
    if (!this.sequences) {
      const loading = (async () => {
        const sequences = new Map<number, number>();
        for await (const { key, value } of this.kv.list({ prefix: this.keyPrefix() })) {
          const read = this.read(key, value);
          if (read) {
            sequences.set(read.packet.packetId, read.seq);
            this.nextSeq = Math.max(this.nextSeq, read.seq + 1);
          } else {
            this.log('removing an entry that cannot be read from the store', key);
            await this.kv.delete(key);
          }
        }
        return sequences;
      })();
      this.sequences = loading;
      // Read again on the next call when the database cannot be read now.
      loading.catch(() => {
        if (this.sequences === loading) {
          this.sequences = undefined;
        }
      });
    }
    return this.sequences;
  }

  /** Decodes an entry. Returns undefined if it is not a QoS 1 / QoS 2 PUBLISH or a PUBREL stored under its packet ID. */
  private read(key: Deno.KvKey, value: unknown): { seq: number; packet: StoredPacket } | undefined {
    const entry = value as Partial<Entry> | null;
    if (typeof entry?.seq !== 'number' || !(entry.bytes instanceof Uint8Array)) {
      return undefined;
    }
    try {
      const packet = MqttPackets.decode(entry.bytes, Mqtt.ProtocolVersion.MqttV5);
      const stored = packet.type === 'pubrel' || (packet.type === 'publish' && packet.qos !== Mqtt.QoS.AtMostOnce);
      if (stored && packet.packetId === key.at(-1)) {
        return { seq: entry.seq, packet };
      }
    } catch {
      // not a packet
    }
    return undefined;
  }
}

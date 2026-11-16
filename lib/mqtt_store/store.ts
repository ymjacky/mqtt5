import { MqttPackets } from '../mod.ts';

/**
 * Keeps the packet IDs of received QoS 2 PUBLISH packets until PUBREL is received.
 * Used internally by the client. Custom implementations are not supported.
 */
export interface IncomingStore {
  /** Stores a packet ID. */
  store(packetId: number): Promise<void>;
  /** Returns whether the packet ID is stored. */
  has(packetId: number): Promise<boolean>;
  /** Removes a packet ID. */
  discard(packetId: number): Promise<void>;
}

/** The default {@link IncomingStore} used internally by the client. */
export class IncomingMemoryStore implements IncomingStore {
  /** The stored packet IDs. */
  packets: Set<number> = new Set<number>();

  /** Stores a packet ID. */
  store(packetId: number): Promise<void> {
    this.packets.add(packetId);
    return Promise.resolve();
  }

  /** Returns whether the packet ID is stored. */
  has(packetId: number): Promise<boolean> {
    return Promise.resolve(this.packets.has(packetId));
  }

  /** Removes a packet ID. */
  discard(packetId: number): Promise<void> {
    this.packets.delete(packetId);
    return Promise.resolve();
  }
}

/**
 * Keeps sent PUBLISH (QoS 1 and 2) and PUBREL packets until they are acknowledged, to resend them on reconnection.
 * Used internally by the client. Custom implementations are not supported.
 *
 * The packets are resent in the order they were first stored. Storing a packet with the packet ID of a stored one
 * (PUBREL for the PUBLISH of its flow) replaces it and keeps its position.
 */
export interface OutgoingStore {
  /**
   * Tells the store the Client Identifier of the client that uses it, for a store that keeps the packets by it.
   * Called when the client is created, before any other method.
   * @throws {Error} if the store cannot be used with the Client Identifier.
   */
  setClientId?(clientId: string): void;

  /**
   * The size in bytes of the largest packet the store can keep, for a store with a limit.
   * A QoS 1 or QoS 2 `publish()` whose PUBLISH is larger rejects with `PacketTooLargeError`, as for the
   * Maximum Packet Size of the broker: the lower of the two applies.
   */
  readonly maximumPacketSize?: number;

  /** Stores a packet by its packet ID. A packet with the packet ID of a stored one replaces it and keeps its position. */
  store(
    packet: MqttPackets.PublishPacket | MqttPackets.PubrelPacket,
  ): Promise<void>;

  /** Removes the packet with the packet ID. */
  discard(packetId: number): Promise<void>;

  /** Iterates over the stored packets to resend. */
  resendIterator(): AsyncIterableIterator<MqttPackets.PublishPacket | MqttPackets.PubrelPacket>;

  /** Returns whether a packet with the packet ID is stored. */
  has(packet: number): Promise<boolean>;

  /** Returns the number of stored packets. */
  count(): Promise<number>;

  /** Removes all packets. */
  clear(): Promise<void>;
}

/** The default {@link OutgoingStore} used internally by the client. */
export class MemoryStore implements OutgoingStore {
  /** The stored packets by packet ID. */
  packets: Map<number, MqttPackets.PublishPacket | MqttPackets.PubrelPacket> = new Map<
    number, /* packetId */
    MqttPackets.PublishPacket | MqttPackets.PubrelPacket
  >();

  /** Stores a packet by its packet ID. Rejects if the packet has no packet ID. */
  store(packet: MqttPackets.PublishPacket | MqttPackets.PubrelPacket): Promise<void> {
    if (!packet.packetId) {
      return Promise.reject(new Error('missing packet.packetId'));
    }

    this.packets.set(packet.packetId, packet);
    return Promise.resolve();
  }

  /** Returns whether a packet with the packet ID is stored. */
  has(packetId: number): Promise<boolean> {
    const exist = this.packets.has(packetId);
    return Promise.resolve(exist);
  }

  /** Removes the packet with the packet ID. */
  discard(packetId: number): Promise<void> {
    this.packets.delete(packetId);

    return Promise.resolve();
  }

  /** Returns the number of stored packets. */
  count(): Promise<number> {
    return Promise.resolve(this.packets.size);
  }

  /** Removes all packets. */
  clear(): Promise<void> {
    this.packets.clear();
    return Promise.resolve();
  }

  /** Iterates over the stored packets to resend. */
  async *resendIterator(): AsyncIterableIterator<MqttPackets.PublishPacket | MqttPackets.PubrelPacket> {
    for (const value of this.packets.values()) {
      yield value;
    }
  }
}

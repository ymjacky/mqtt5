import { MqttPackets } from '../mod.ts';

/** Keeps the packet IDs of received QoS 2 PUBLISH packets until PUBREL is received. */
export interface IncomingStore {
  /** Stores a packet ID. */
  store(packetId: number): Promise<void>;
  /** Returns whether the packet ID is stored. */
  has(packetId: number): Promise<boolean>;
  /** Removes a packet ID. */
  discard(packetId: number): Promise<void>;
}

/** An {@link IncomingStore} that keeps packet IDs in memory. */
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

/** Keeps sent PUBLISH (QoS 1 and 2) and PUBREL packets until they are acknowledged, to resend them on reconnection. */
export interface OutgoingStore {
  /** Stores a packet by its packet ID. */
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

/** An {@link OutgoingStore} that keeps packets in memory. */
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

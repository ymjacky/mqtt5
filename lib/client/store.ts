import { MqttPackets } from '../mod.ts';

export interface IncomingStore {
  store(packetId: number): Promise<void>;
  has(packetId: number): Promise<boolean>;
  discard(packetId: number): Promise<void>;
}

export class IncomingMemoryStore implements IncomingStore {
  packets: Set<number> = new Set<number>();

  store(packetId: number): Promise<void> {
    this.packets.add(packetId);
    return Promise.resolve();
  }

  has(packetId: number): Promise<boolean> {
    return Promise.resolve(this.packets.has(packetId));
  }

  discard(packetId: number): Promise<void> {
    this.packets.delete(packetId);
    return Promise.resolve();
  }
}

export interface OutgoingStore {
  store(
    packet: MqttPackets.PublishPacket | MqttPackets.PubrelPacket,
  ): Promise<void>;

  discard(packetId: number): Promise<void>;

  iterate(): AsyncIterable<MqttPackets.PublishPacket | MqttPackets.PubrelPacket>;

  has(packet: number): Promise<boolean>;

  count(): Promise<number>;

  clear(): Promise<void>;
}

export class MemoryStore implements OutgoingStore {
  packets: Map<number, MqttPackets.PublishPacket | MqttPackets.PubrelPacket> = new Map<
    /* packetId */ number,
    MqttPackets.PublishPacket | MqttPackets.PubrelPacket
  >();

  store(packet: MqttPackets.PublishPacket | MqttPackets.PubrelPacket): Promise<void> {
    if (!packet.packetId) {
      return Promise.reject(new Error('missing packet.packetId'));
    }

    this.packets.set(packet.packetId, packet);

    return Promise.resolve();
  }

  has(packetId: number): Promise<boolean> {
    const exist = this.packets.has(packetId);
    return Promise.resolve(exist);
  }

  discard(packetId: number): Promise<void> {
    this.packets.delete(packetId);

    return Promise.resolve();
  }

  count(): Promise<number> {
    return Promise.resolve(this.packets.size);
  }

  clear(): Promise<void> {
    this.packets.clear();
    return Promise.resolve();
  }

  async *iterate(): AsyncIterable<MqttPackets.PublishPacket | MqttPackets.PubrelPacket> {
    for (const value of this.packets.values()) {
      yield value;
    }
  }
}

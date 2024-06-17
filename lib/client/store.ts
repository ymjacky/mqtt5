import { MqttPackets } from '../mod.ts';

export interface IncomingStore {
  store(packetId: number): Promise<void>;
  has(packetId: number): Promise<boolean>;
  discard(packetId: number): Promise<void>;
}

export class IncomingMemoryStore implements IncomingStore {
  packets = new Set<number>();

  store(packetId: number) {
    this.packets.add(packetId);
    return Promise.resolve();
  }

  has(packetId: number) {
    return Promise.resolve(this.packets.has(packetId));
  }

  discard(packetId: number) {
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
  packets = new Map</* packetId */ number, MqttPackets.PublishPacket | MqttPackets.PubrelPacket>();

  store(packet: MqttPackets.PublishPacket | MqttPackets.PubrelPacket) {
    if (!packet.packetId) {
      return Promise.reject(new Error('missing packet.packetId'));
    }

    this.packets.set(packet.packetId, packet);

    return Promise.resolve();
  }

  has(packetId: number) {
    const exist = this.packets.has(packetId);
    return Promise.resolve(exist);
  }

  discard(packetId: number) {
    this.packets.delete(packetId);

    return Promise.resolve();
  }

  count() {
    return Promise.resolve(this.packets.size);
  }

  clear() {
    this.packets.clear();
    return Promise.resolve();
  }

  async *iterate(): AsyncIterable<MqttPackets.PublishPacket | MqttPackets.PubrelPacket> {
    for (const value of this.packets.values()) {
      yield value;
    }
  }
}

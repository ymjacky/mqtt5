import { decodeRemainingLength } from './remaining_length.ts';

// The fixed header: one byte of packet type and flags, and a Remaining Length of at most 4 bytes.
const maxFixedHeaderBytes = 5;

/**
 * A received packet is larger than the Maximum Packet Size the client sent in CONNECT (MQTT 5.0).
 * Thrown by {@link MqttFrameBuffer.takePacket} as soon as the fixed header tells the size of the packet, before the rest
 * of it is received.
 */
export class PacketTooLargeToReceiveError extends Error {
  /** The name of the error class. */
  override readonly name = 'PacketTooLargeToReceiveError' as const;
  /** The size of the packet in bytes, from its fixed header. */
  readonly packetSize: number;
  /** The Maximum Packet Size of CONNECT. */
  readonly maximumPacketSize: number;

  constructor(packetSize: number, maximumPacketSize: number) {
    super(`the received packet is ${packetSize} bytes, larger than the Maximum Packet Size ${maximumPacketSize}`);
    this.packetSize = packetSize;
    this.maximumPacketSize = maximumPacketSize;
  }
}

/**
 * Splits a byte stream received in arbitrary chunks (e.g. TCP reads or
 * WebSocket messages) into complete MQTT packets.
 *
 * Each byte is copied once. The received chunks are kept as they are, and a packet is copied out of them in one go when
 * all of its bytes have been received: joining them on every chunk would copy a large packet again and again, in a time
 * that grows with the square of its size. Nothing is allocated for a packet before its bytes are received, so the memory
 * used follows the received bytes; when a packet is complete, its chunks and the packet are held at the same time, briefly.
 */
export class MqttFrameBuffer {
  private readonly maximumPacketSize?: number;
  // The received chunks whose bytes are not in a packet yet; `offset` is the position in the first one, and `buffered`
  // the number of bytes from there to the end of the last one.
  private chunks: Uint8Array[] = [];
  private offset = 0;
  private buffered = 0;
  // The fixed header of the next packet, taken out of the chunks.
  private header = new Uint8Array(maxFixedHeaderBytes);
  private headerLength = 0;
  // The size of the next packet, once its fixed header is complete.
  private packetSize?: number;
  // The error that stopped the splitting: the bytes after it cannot be split into packets.
  private error?: Error;

  /**
   * @param maximumPacketSize the Maximum Packet Size the client sent in CONNECT (MQTT 5.0), if any. A larger packet is
   * not received: {@link MqttFrameBuffer.takePacket} throws {@link PacketTooLargeToReceiveError}.
   */
  constructor(maximumPacketSize?: number) {
    this.maximumPacketSize = maximumPacketSize;
  }

  /**
   * Append received bytes. They are kept as they are, not copied, until they are taken into a packet: the caller must
   * not change them. Ignored after {@link MqttFrameBuffer.takePacket} has thrown.
   */
  append(data: Uint8Array): void {
    if (data.length > 0 && !this.error) {
      this.chunks.push(data);
      this.buffered += data.length;
    }
  }

  /**
   * Remove and return the first complete packet, or `undefined` when no
   * complete packet has been received yet.
   * Throws `MalformedPacketError` when the Remaining Length of the next packet is malformed, and
   * {@link PacketTooLargeToReceiveError} when the next packet is larger than the Maximum Packet Size; the packets before it
   * have already been returned by earlier calls. After that, it throws the same error again.
   */
  takePacket(): Uint8Array | undefined {
    if (this.error) {
      throw this.error;
    }
    try {
      if (this.packetSize === undefined && !this.readFixedHeader()) {
        return undefined;
      }
      return this.takeRestOfPacket();
    } catch (err) {
      this.error = err as Error;
      this.chunks = [];
      this.buffered = 0;
      throw err;
    }
  }

  /**
   * Reads the fixed header of the next packet, which tells its size.
   * @returns false if more bytes are needed.
   * @throws {MalformedPacketError} if the Remaining Length is longer than 4 bytes.
   * @throws {PacketTooLargeToReceiveError} if the packet is larger than the Maximum Packet Size.
   */
  private readFixedHeader(): boolean {
    while (this.buffered > 0) {
      this.header[this.headerLength++] = this.chunks[0][this.offset];
      this.consume(1);
      // header[0] is the byte of packet type and flags, followed by the Remaining Length.
      const remainingLength = this.headerLength > 1 ? decodeRemainingLength(this.header.subarray(0, this.headerLength), 1) : undefined;
      if (!remainingLength) {
        continue;
      }

      const packetSize = this.headerLength + remainingLength.number;
      if (this.maximumPacketSize !== undefined && packetSize > this.maximumPacketSize) {
        throw new PacketTooLargeToReceiveError(packetSize, this.maximumPacketSize);
      }
      this.packetSize = packetSize;
      return true;
    }
    return false;
  }

  /**
   * Copies the packet out of the chunks when all of its bytes after the fixed header have been received.
   * @returns the packet, or undefined if more bytes are needed.
   */
  private takeRestOfPacket(): Uint8Array | undefined {
    const packetSize = this.packetSize!;
    if (this.buffered < packetSize - this.headerLength) {
      return undefined;
    }

    const packet = new Uint8Array(packetSize);
    packet.set(this.header.subarray(0, this.headerLength));
    let filled = this.headerLength;
    while (filled < packetSize) {
      const chunk = this.chunks[0];
      const length = Math.min(chunk.length - this.offset, packetSize - filled);
      packet.set(chunk.subarray(this.offset, this.offset + length), filled);
      filled += length;
      this.consume(length);
    }
    this.packetSize = undefined;
    this.headerLength = 0;
    return packet;
  }

  /** Moves past `length` bytes of the first chunk, and drops the chunk when all its bytes are taken. */
  private consume(length: number): void {
    this.offset += length;
    this.buffered -= length;
    if (this.offset === this.chunks[0].length) {
      this.chunks.shift();
      this.offset = 0;
    }
  }
}

import * as MqttUtils from '../mqtt_utils/mod.ts';
import { decodeRemainingLength } from './remaining_length.ts';

/**
 * Splits a byte stream received in arbitrary chunks (e.g. WebSocket messages)
 * into complete MQTT packets.
 */
export class MqttFrameBuffer {
  private buffer: Uint8Array = new Uint8Array(0);

  /**
   * Append received bytes to the buffer.
   */
  append(data: Uint8Array): void {
    this.buffer = MqttUtils.concatBytes([this.buffer, data]);
  }

  /**
   * Remove and return every complete packet currently in the buffer.
   * Bytes of an incomplete trailing packet are kept until more data arrives.
   * Throws `MalformedPacketError` when the Remaining Length is malformed.
   */
  takePackets(): Uint8Array[] {
    const packets: Uint8Array[] = [];
    let offset = 0;
    while (offset < this.buffer.length) {
      // buffer[offset] is the fixed header byte, followed by the Remaining Length.
      const remainingLength = decodeRemainingLength(this.buffer, offset + 1);
      if (!remainingLength) {
        break;
      }

      const packetSize = 1 + remainingLength.size + remainingLength.number;
      if (offset + packetSize > this.buffer.length) {
        break;
      }

      packets.push(this.buffer.slice(offset, offset + packetSize));
      offset += packetSize;
    }

    this.buffer = this.buffer.slice(offset);
    return packets;
  }
}

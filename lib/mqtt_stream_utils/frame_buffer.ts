import * as MqttUtils from '../mqtt_utils/mod.ts';
import { decodeRemainingLength } from './remaining_length.ts';

/**
 * Splits a byte stream received in arbitrary chunks (e.g. TCP reads or
 * WebSocket messages) into complete MQTT packets.
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
   * Remove and return the first complete packet in the buffer, or `undefined`
   * when the buffer does not hold a complete packet yet.
   * Throws `MalformedPacketError` when the Remaining Length of the first
   * packet is malformed; packets before it have already been returned by
   * earlier calls.
   */
  takePacket(): Uint8Array | undefined {
    // buffer[0] is the fixed header byte, followed by the Remaining Length.
    const remainingLength = decodeRemainingLength(this.buffer, 1);
    if (!remainingLength) {
      return undefined;
    }

    const packetSize = 1 + remainingLength.size + remainingLength.number;
    if (packetSize > this.buffer.length) {
      return undefined;
    }

    const packet = this.buffer.slice(0, packetSize);
    this.buffer = this.buffer.subarray(packetSize);
    return packet;
  }
}

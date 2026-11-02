import { MalformedPacketError } from '../client/error.ts';
import * as MqttUtils from '../mqtt_utils/mod.ts';

// The MQTT spec allows at most 4 bytes for a Variable Byte Integer.
const maxRemainingLengthBytes = 4;

/**
 * Decode the Remaining Length (Variable Byte Integer) of an MQTT fixed header
 * starting at `offset`.
 *
 * Returns `undefined` when `bytes` ends before the Variable Byte Integer is
 * complete, so the caller can wait for more bytes. Throws
 * `MalformedPacketError` when the continuation bit is still set after 4 bytes.
 */
export function decodeRemainingLength(bytes: Uint8Array, offset: number): { number: number; size: number } | undefined {
  for (let i = 0; i < maxRemainingLengthBytes; i++) {
    if (offset + i >= bytes.length) {
      return undefined;
    }
    if ((bytes[offset + i] >> 7) == 0) {
      return MqttUtils.variableByteIntegerToNum(bytes, offset);
    }
  }

  throw new MalformedPacketError('malformed variable byte integer: remaining length exceeds 4 bytes');
}

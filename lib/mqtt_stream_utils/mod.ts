import { ConnectionClosed, ConnectionReset } from '../client/error.ts';
import * as MqttUtils from '../mqtt_utils/mod.ts';

export async function readMqttBytes(
  reader: ReadableStreamBYOBReader,
) {
  try {
    // Collect received chunks and concatenate them at the end instead of
    // spreading byte arrays into push(), which can overflow the call stack
    // once a chunk (e.g. a large incoming PUBLISH payload) grows large.
    const receiveChunks: (Uint8Array | number[])[] = [];

    let readValue = await reader.read(new Uint8Array(1));
    if (readValue.done) {
      throw new ConnectionClosed();
    }

    receiveChunks.push(readValue.value);

    // parse remainingLength
    const remainingLengthBytes = [];
    let readLength = 0;
    do {
      const readValue = await reader.read(new Uint8Array(1));
      if (readValue.done) {
        throw new ConnectionClosed();
      }

      readLength++;
      remainingLengthBytes.push(readValue.value[0]);

      receiveChunks.push(readValue.value);

      if ((readValue.value[0] >> 7) == 0) {
        break;
      } else if (readLength == 4) {
        throw new Error('malformed packet');
      }
    } while (readLength < 4);

    const remainingLength = MqttUtils.variableByteIntegerToNum(
      new Uint8Array(remainingLengthBytes),
      0,
    );

    if (remainingLength.number > 0) {
      readValue = await reader.read(
        new Uint8Array(remainingLength.number),
      );
      if (readValue.done) {
        throw new ConnectionClosed();
      }
      receiveChunks.push(readValue.value);
    }

    return Promise.resolve(MqttUtils.concatBytes(receiveChunks));
  } catch (e) {
    if (e instanceof ConnectionClosed) {
      return Promise.reject(e);
    }
    if (e instanceof Error) {
      if (e.name === 'ConnectionReset') {
        return Promise.reject(new ConnectionReset(e.message));
      }
      if (e.name === 'Interrupted') {
        return Promise.reject(new ConnectionReset(e.message));
      }
    }
    return Promise.reject(e);
  }
}

import { ConnectionClosed, ConnectionReset } from '../client/error.ts';
import * as MqttUtils from '../mqtt_utils/mod.ts';

export async function readMqttBytes(
  reader: ReadableStreamBYOBReader,
) {
  try {
    const receiveBytes = [];

    let readValue = await reader.read(new Uint8Array(1));
    if (readValue.done) {
      throw new ConnectionClosed();
    }

    receiveBytes.push(...readValue.value);

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

      receiveBytes.push(readValue.value[0]);

      if ((readValue.value[0] >> 7) == 0) {
        break;
      } else if (readLength == 4) {
        throw new Error('malformed packet');
      }
    } while (readLength < 4);

    const remainingLength = MqttUtils.variableByteIntegerToNum(
      new Uint8Array([...remainingLengthBytes]),
      0,
    );

    if (remainingLength.number > 0) {
      readValue = await reader.read(
        new Uint8Array(remainingLength.number),
      );
      if (readValue.done) {
        throw new ConnectionClosed();
      }
      receiveBytes.push(...readValue.value);
    }

    return Promise.resolve(new Uint8Array(receiveBytes));
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

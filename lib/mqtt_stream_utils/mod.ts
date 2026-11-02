import { ConnectionClosed, ConnectionReset } from '../client/error.ts';

export { decodeRemainingLength } from './remaining_length.ts';
export { MqttFrameBuffer } from './frame_buffer.ts';

/**
 * Read the next chunk of bytes from the stream. The chunk may hold any part
 * of one or more MQTT packets; split it with `MqttFrameBuffer`.
 */
export async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<Uint8Array> {
  try {
    const readValue = await reader.read();
    if (readValue.done) {
      throw new ConnectionClosed();
    }

    return readValue.value;
  } catch (e) {
    if (e instanceof ConnectionClosed) {
      throw e;
    }
    if (e instanceof Error) {
      if (e.name === 'ConnectionReset') {
        throw new ConnectionReset(e.message);
      }
      if (e.name === 'Interrupted') {
        throw new ConnectionReset(e.message);
      }
    }
    throw e;
  }
}

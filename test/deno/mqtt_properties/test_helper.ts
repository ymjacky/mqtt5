import { assertEquals } from '@std/assert';
import { parseMqttProperties, type Properties, propertiesToBytes } from '../../../lib/mqtt_properties/mod.ts';

/** A test case that encodes and decodes properties. */
export type PropertyCase = {
  name: string;
  /** The properties to encode. The case is decode only if omitted. */
  encode?: Properties;
  /** The properties expected from decoding. Same as `encode` if omitted. */
  decode?: Properties;
  /** The encoded properties without the property length. */
  bytes: number[];
};

/** Registers an encode test (if `encode` is set) and a decode test for each case. */
export function testPropertyCases(cases: PropertyCase[]): void {
  for (const { name, encode, decode, bytes } of cases) {
    if (encode) {
      Deno.test(`encodeProperties ${name}`, function () {
        assertEquals(propertiesToBytes(encode), new Uint8Array([bytes.length, ...bytes]));
      });
    }

    Deno.test(`decodeProperties ${name}`, function () {
      // Put bytes in front of the properties to check that the offset is used.
      const buffer = new Uint8Array([0xEE, 0xEE, ...bytes]);
      assertEquals(parseMqttProperties(buffer, 2, bytes.length), decode ?? encode);
    });
  }
}

import { assert, assertEquals } from 'std/assert/mod.ts';
import { Mqtt, MqttPackets, MqttProperties } from '../../deno/mod.ts';

// The misspelled names are kept as deprecated aliases for backward compatibility.
Deno.test('deprecated names', async (t) => {
  await t.step('Mqtt.QoS.EXACTRY_ONCE', () => {
    assertEquals(Mqtt.QoS.EXACTRY_ONCE, Mqtt.QoS.EXACTLY_ONCE);
  });

  await t.step('Mqtt.fixexHeaderFlag', () => {
    assertEquals(Mqtt.fixexHeaderFlag, Mqtt.fixedHeaderFlag);
  });

  await t.step('UnsuportedPacketError', () => {
    const err = new MqttPackets.MqttPacketsError.UnsupportedPacketError('unknown');
    assert(err instanceof MqttPackets.MqttPacketsError.UnsuportedPacketError);
  });

  await t.step('UnsuportedPropertyError', () => {
    const err = new MqttProperties.UnsupportedPropertyError(0xFF);
    assert(err instanceof MqttProperties.UnsuportedPropertyError);
  });
});

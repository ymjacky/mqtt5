import { assertEquals } from '@std/assert';
import * as DenoEntryPoint from '../../deno/mod.ts';
import * as BrowserEntryPoint from '../../browser/mod.ts';

// What users can import, so that nothing is made public by accident: anything exported is part of the API, and
// changing it later is a breaking change. The types are not seen here, as they are not values.
Deno.test({ name: '@entry points export only the public API', only: false }, async (context) => {
  await context.step('@ymjacky/mqtt5', () => {
    assertEquals(Object.keys(DenoEntryPoint).sort(), [
      'ClientErrors',
      'ClientTypes',
      'KvOutgoingStore',
      'Mqtt',
      'MqttClient',
      'MqttPackets',
      'MqttProperties',
      'Store',
      'WebSocketMqttClient',
    ]);
  });

  await context.step('@ymjacky/mqtt5/browser', () => {
    assertEquals(Object.keys(BrowserEntryPoint).sort(), [
      'ClientErrors',
      'ClientTypes',
      'Mqtt',
      'MqttPackets',
      'MqttProperties',
      'Store',
      'WebSocketMqttClient',
    ]);
  });

  await context.step('Store', () => {
    assertEquals(Object.keys(DenoEntryPoint.Store).sort(), ['IncomingMemoryStore', 'MemoryStore']);
    assertEquals(BrowserEntryPoint.Store, DenoEntryPoint.Store);
  });
});

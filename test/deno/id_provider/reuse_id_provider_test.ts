import { assert, assertEquals, assertThrows } from 'std/assert/mod.ts';

import { ReuseIdProvider as IdProvider } from '../../../lib/id_provider/reuse_id_provider.ts';

Deno.test('increment', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 3);
  assertEquals(idProvider.aquire(), 4);
  assertEquals(idProvider.aquire(), 5);
  assertEquals(idProvider.aquire(), 6);
  assertEquals(idProvider.aquire(), 7);
  assertEquals(idProvider.aquire(), 8);
  assertEquals(idProvider.aquire(), 9);
  assertThrows(() => idProvider.aquire());
});

Deno.test('reuse_1', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assert(idProvider.release(1));
  assert(idProvider.release(2));
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 3);
  assert(idProvider.release(1));
  assert(idProvider.release(2));
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 4);
  assertEquals(idProvider.aquire(), 5);
  assertEquals(idProvider.aquire(), 6);
  assertEquals(idProvider.aquire(), 7);
  assert(idProvider.release(3));
  assertEquals(idProvider.aquire(), 3);
  assertEquals(idProvider.aquire(), 8);
  assertEquals(idProvider.aquire(), 9);
  assertThrows(() => idProvider.aquire());
});

Deno.test('reuse_2', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 3);
  assertEquals(idProvider.aquire(), 4);
  assertEquals(idProvider.aquire(), 5);
  assertEquals(idProvider.aquire(), 6);
  assert(idProvider.release(6));
  assert(idProvider.release(5));
  assert(idProvider.release(4));
  assert(idProvider.release(3));
  assertEquals(idProvider.aquire(), 6);
  assertEquals(idProvider.aquire(), 5);
  assertEquals(idProvider.aquire(), 4);
  assertEquals(idProvider.aquire(), 3);
});

Deno.test('reuse_3', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 3);
  assertEquals(idProvider.aquire(), 4);
  assert(idProvider.release(1));
  assert(idProvider.release(2));
  assert(idProvider.release(3));
  assert(idProvider.release(4));
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 3);
  assertEquals(idProvider.aquire(), 4);
  assert(idProvider.release(1));
  assert(idProvider.release(2));
  assert(idProvider.release(3));
  assert(idProvider.release(4));
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 3);
  assertEquals(idProvider.aquire(), 4);
});

Deno.test('reuse_4', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 3);
  assertEquals(idProvider.aquire(), 4);
  assert(idProvider.release(1));
  assert(idProvider.release(2));
  assert(idProvider.release(3));
  assert(idProvider.release(4));
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 3);
  assertEquals(idProvider.aquire(), 4);
  assert(idProvider.release(4));
  assert(idProvider.release(3));
  assert(idProvider.release(2));
  assert(idProvider.release(1));
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 3);
});

Deno.test('reuse_5', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 3);
  assertEquals(idProvider.aquire(), 4);
  assert(idProvider.release(3));
  assert(idProvider.release(2));
  assert(idProvider.release(1));
  assertEquals(idProvider.aquire(), 3);
  assert(idProvider.release(4));
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 4);
  assert(idProvider.release(4));
  assert(idProvider.release(1));
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 4);
  assertEquals(idProvider.aquire(), 5);
});

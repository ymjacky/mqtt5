import { assert, assertEquals, assertFalse, assertThrows } from 'std/assert/mod.ts';

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
  assertEquals(idProvider.aquire(), 3);
  assertEquals(idProvider.aquire(), 4);
  assertEquals(idProvider.aquire(), 5);
  assertEquals(idProvider.aquire(), 6);
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

Deno.test('registerIfNotInUse_1', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);
  assertEquals(idProvider.aquire(), 3);

  assertFalse(idProvider.registerIfNotInUse(1));
  assertFalse(idProvider.registerIfNotInUse(2));
  assertFalse(idProvider.registerIfNotInUse(3));

  assert(idProvider.registerIfNotInUse(6));
  assertFalse(idProvider.registerIfNotInUse(6));

  assertEquals(idProvider.aquire(), 7);
  assertEquals(idProvider.aquire(), 8);
});

Deno.test('registerIfNotInUse_2', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);

  assert(idProvider.registerIfNotInUse(6));
  assert(idProvider.registerIfNotInUse(3));

  assertEquals(idProvider.aquire(), 7);
  assertEquals(idProvider.aquire(), 8);
});

Deno.test('registerIfNotInUse_3', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);

  assert(idProvider.registerIfNotInUse(6));
  assert(idProvider.registerIfNotInUse(3));

  assert(idProvider.release(6));

  assertEquals(idProvider.aquire(), 6);
  assertEquals(idProvider.aquire(), 7);
});

Deno.test('registerIfNotInUse_4', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);

  assert(idProvider.registerIfNotInUse(6));
  assert(idProvider.registerIfNotInUse(3));

  assert(idProvider.release(6));
  assert(idProvider.release(3));

  assertEquals(idProvider.aquire(), 3); // from reusable
  assertEquals(idProvider.aquire(), 6); // from next

  assert(idProvider.release(6)); // next -> 6
  assert(idProvider.release(3)); // 3 -> resusable
  assertEquals(idProvider.aquire(), 3); // from reusable
});

Deno.test('registerIfNotInUse_5', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.aquire(), 1);
  assertEquals(idProvider.aquire(), 2);

  assert(idProvider.registerIfNotInUse(6));
  assert(idProvider.release(6));

  assertEquals(idProvider.aquire(), 6);
  assert(idProvider.release(6));

  assertEquals(idProvider.aquire(), 6);
  assertEquals(idProvider.aquire(), 7);
  assertEquals(idProvider.aquire(), 8);
  assertEquals(idProvider.aquire(), 9);
});

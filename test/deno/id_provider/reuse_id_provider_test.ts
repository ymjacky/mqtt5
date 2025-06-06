import { assert, assertEquals, assertFalse, assertThrows } from 'std/assert/mod.ts';

import { ReuseIdProvider as IdProvider } from '../../../lib/id_provider/reuse_id_provider.ts';

Deno.test('increment', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);
  assertEquals(idProvider.acquire(), 5);
  assertEquals(idProvider.acquire(), 6);
  assertEquals(idProvider.acquire(), 7);
  assertEquals(idProvider.acquire(), 8);
  assertEquals(idProvider.acquire(), 9);
  assertThrows(() => idProvider.acquire());
});

Deno.test('reuse_1', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assert(idProvider.release(1));
  assert(idProvider.release(2));
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assert(idProvider.release(1));
  assert(idProvider.release(2));
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 4);
  assertEquals(idProvider.acquire(), 5);
  assertEquals(idProvider.acquire(), 6);
  assertEquals(idProvider.acquire(), 7);
  assert(idProvider.release(3));
  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 8);
  assertEquals(idProvider.acquire(), 9);
  assertThrows(() => idProvider.acquire());
});

Deno.test('reuse_2', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);
  assertEquals(idProvider.acquire(), 5);
  assertEquals(idProvider.acquire(), 6);
  assert(idProvider.release(6));
  assert(idProvider.release(5));
  assert(idProvider.release(4));
  assert(idProvider.release(3));
  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);
  assertEquals(idProvider.acquire(), 5);
  assertEquals(idProvider.acquire(), 6);
});

Deno.test('reuse_3', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);
  assert(idProvider.release(1));
  assert(idProvider.release(2));
  assert(idProvider.release(3));
  assert(idProvider.release(4));
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);
  assert(idProvider.release(1));
  assert(idProvider.release(2));
  assert(idProvider.release(3));
  assert(idProvider.release(4));
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);
});

Deno.test('reuse_4', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);
  assert(idProvider.release(1));
  assert(idProvider.release(2));
  assert(idProvider.release(3));
  assert(idProvider.release(4));
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);
  assert(idProvider.release(4));
  assert(idProvider.release(3));
  assert(idProvider.release(2));
  assert(idProvider.release(1));
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
});

Deno.test('reuse_5', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);
  assert(idProvider.release(3));
  assert(idProvider.release(2));
  assert(idProvider.release(1));
  assertEquals(idProvider.acquire(), 3);
  assert(idProvider.release(4));
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 4);
  assert(idProvider.release(4));
  assert(idProvider.release(1));
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 4);
  assertEquals(idProvider.acquire(), 5);
});

Deno.test('registerIfNotInUse_1', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);

  assertFalse(idProvider.registerIfNotInUse(1));
  assertFalse(idProvider.registerIfNotInUse(2));
  assertFalse(idProvider.registerIfNotInUse(3));

  assert(idProvider.registerIfNotInUse(6));
  assertFalse(idProvider.registerIfNotInUse(6));

  assertEquals(idProvider.acquire(), 7);
  assertEquals(idProvider.acquire(), 8);
});

Deno.test('registerIfNotInUse_2', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);

  assert(idProvider.registerIfNotInUse(6));
  assert(idProvider.registerIfNotInUse(3));

  assertEquals(idProvider.acquire(), 7);
  assertEquals(idProvider.acquire(), 8);
});

Deno.test('registerIfNotInUse_3', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);

  assert(idProvider.registerIfNotInUse(6));
  assert(idProvider.registerIfNotInUse(3));

  assert(idProvider.release(6));

  assertEquals(idProvider.acquire(), 6);
  assertEquals(idProvider.acquire(), 7);
});

Deno.test('registerIfNotInUse_4', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);

  assert(idProvider.registerIfNotInUse(6));
  assert(idProvider.registerIfNotInUse(3));

  assert(idProvider.release(6));
  assert(idProvider.release(3));

  assertEquals(idProvider.acquire(), 3); // from reusable
  assertEquals(idProvider.acquire(), 6); // from next

  assert(idProvider.release(6)); // next -> 6
  assert(idProvider.release(3)); // 3 -> resusable
  assertEquals(idProvider.acquire(), 3); // from reusable
});

Deno.test('registerIfNotInUse_5', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);

  assert(idProvider.registerIfNotInUse(6));
  assert(idProvider.release(6));

  assertEquals(idProvider.acquire(), 6);
  assert(idProvider.release(6));

  assertEquals(idProvider.acquire(), 6);
  assertEquals(idProvider.acquire(), 7);
  assertEquals(idProvider.acquire(), 8);
  assertEquals(idProvider.acquire(), 9);
});

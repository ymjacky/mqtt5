import { assert, assertEquals, assertExists } from 'std/assert/mod.ts';
import { LruCache } from '../../../lib/cache/lru_cache.ts';

Deno.test('set', () => {
  const capacity = 5;
  const maxAge = 7;

  const cache = new LruCache<number, string>(capacity, maxAge);
  for (let i = 0; i < capacity; i++) {
    cache.set(i, `val_${capacity - i}`);
  }

  // Accessing a cache many times
  for (let i = 0; i < capacity - 1; i++) {
    for (let j = i; j < capacity - 1; j++) {
      cache.get(i);
    }
  }

  /* Status of created cache
  _values: Map(5) {
    0 => "val_5",
    1 => "val_4",
    2 => "val_3",
    3 => "val_2",
    4 => "val_1"
  },
  _ages: Map(5) { 0 => 5, 1 => 4, 2 => 3, 3 => 2, 4 => 1 }
  */

  cache.set(9, 'val_9');

  // console.log(cache);
  assert(cache.has(0));
  assert(cache.has(1));
  assert(cache.has(2));
  assert(cache.has(3));
  assert(!cache.has(4)); // Shouldn't exist
  assert(cache.has(9));

  // access twice
  cache.get(9); // age ---> 2
  cache.get(9); // age ---> 3

  /* Status of created cache
  _values: Map(5) {
    0 => "val_5",
    1 => "val_4",
    2 => "val_3",
    3 => "val_2",
    9 => "new val"
  },
  _ages: Map(5) { 0 => 5, 1 => 4, 2 => 3, 3 => 2, 9 => 3 }
  */
  cache.set(10, 'val_10');

  assert(cache.has(0));
  assert(cache.has(1));
  assert(cache.has(2));
  assert(!cache.has(4)); // Shouldn't exist
  assert(cache.has(9));
  assert(cache.has(10));

  cache.get(0); // age ---> 6
  cache.get(0); // age ---> 7

  assert(cache.has(0));
  assert(cache.has(1));
  assert(cache.has(2));
  assert(cache.has(9));
  assert(cache.has(10));
  assertEquals(cache.size(), 5);

  const val = cache.get(0); // age is over maxAge
  assertEquals(val, 'val_5');

  assert(!cache.has(0));
  assert(cache.has(1));
  assert(cache.has(2));
  assert(cache.has(9));
  assert(cache.has(10));
  assertEquals(cache.size(), 4);

  /* Status of created cache
  _values: Map(4) { 1 => "val_4", 2 => "val_3", 9 => "val_9", 10 => "val_10" },
  _ages: Map(5) { 1 => 4, 2 => 3, 9 => 3, 10 => 1 }
  */

  {
    let count = 0;
    for (const entry of cache) {
      assertExists(entry[0]);
      assertExists(entry[1]);

      count++;
    }
    assertEquals(count, 4);
  }

  {
    let count = 0;
    for (const entry of cache.entries()) {
      assertExists(entry[0]);
      assertExists(entry[1]);
      count++;
    }
    assertEquals(count, 4);
  }

  {
    let count = 0;
    for (const key of cache.keys()) {
      assertExists(key);
      assertEquals(typeof key, 'number');
      count++;
    }
    assertEquals(count, 4);
  }

  {
    let count = 0;
    for (const val of cache.values()) {
      assertExists(val);
      assertEquals(typeof val, 'string');
      count++;
    }
    assertEquals(count, 4);
  }

  cache.clear();
  assertEquals(cache.size(), 0);
});

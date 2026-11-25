import { assert, assertEquals, assertThrows } from '@std/assert';
import { LruCache } from '../../../lib/cache/lru_cache.ts';

Deno.test('set removes the least recently used entry when the cache is full, not the least often used one', () => {
  const cache = new LruCache<string, number>(2);
  cache.set('old', 1);
  cache.get('old');
  cache.get('old'); // read more often than 'new', but before it
  cache.set('new', 2);
  cache.get('new'); // the most recently used

  cache.set('x', 3);

  assertEquals([...cache.keys()], ['new', 'x']);
});

Deno.test('get makes the key the most recently used one', () => {
  const cache = new LruCache<string, number>(3);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assertEquals(cache.lruKey(), 'a');

  assertEquals(cache.get('a'), 1);
  assertEquals([...cache.keys()], ['b', 'c', 'a']);
  assertEquals(cache.lruKey(), 'b');

  cache.set('d', 4); // removes 'b'
  assertEquals([...cache.entries()], [['c', 3], ['a', 1], ['d', 4]]);
});

Deno.test('get of a key that is not cached returns undefined and changes nothing', () => {
  const cache = new LruCache<string, number>(2);
  cache.set('a', 1);
  cache.set('b', 2);

  assertEquals(cache.get('x'), undefined);

  assertEquals([...cache.entries()], [['a', 1], ['b', 2]]);
});

Deno.test('set of a cached key replaces the value, makes it the most recently used one and removes nothing', () => {
  const cache = new LruCache<string, number>(2);
  cache.set('a', 1);
  cache.set('b', 2);

  cache.set('a', 10);
  assertEquals([...cache.entries()], [['b', 2], ['a', 10]]);

  cache.set('c', 3); // removes 'b'
  assertEquals([...cache.entries()], [['a', 10], ['c', 3]]);
});

Deno.test('has, keys, values, entries and the iterator do not change the order', () => {
  const cache = new LruCache<string, number>(2);
  cache.set('a', 1);
  cache.set('b', 2);

  assert(cache.has('a'));
  assertEquals([...cache.keys()], ['a', 'b']);
  assertEquals([...cache.values()], [1, 2]);
  assertEquals([...cache.entries()], [['a', 1], ['b', 2]]);
  assertEquals([...cache], [['a', 1], ['b', 2]]);
  assertEquals(cache.lruKey(), 'a');

  cache.set('c', 3); // removes 'a'
  assertEquals([...cache], [['b', 2], ['c', 3]]);
});

Deno.test('lruKey returns undefined when the cache is empty', () => {
  const cache = new LruCache<string, number>(2);
  assertEquals(cache.lruKey(), undefined);

  cache.set('a', 1);
  assertEquals(cache.lruKey(), 'a');

  cache.delete('a');
  assertEquals(cache.lruKey(), undefined);
});

Deno.test('the keys 0 and the empty string are removed like any other key', () => {
  const numbers = new LruCache<number, string>(1);
  numbers.set(0, 'a');
  numbers.set(1, 'b'); // removes 0

  assertEquals(numbers.size, 1);
  assertEquals([...numbers], [[1, 'b']]);

  const strings = new LruCache<string, string>(1);
  strings.set('', 'a');
  strings.set('x', 'b'); // removes ''

  assertEquals(strings.size, 1);
  assertEquals([...strings], [['x', 'b']]);
});

Deno.test('getting the values 0 and the empty string counts as a read and makes the key the most recently used one', () => {
  const cache = new LruCache<string, number | string>(2, 2);
  cache.set('zero', 0);
  cache.set('empty', '');

  assertEquals(cache.get('zero'), 0); // the most recently used
  cache.set('x', 1); // removes 'empty'
  assertEquals([...cache.keys()], ['zero', 'x']);

  assertEquals(cache.get('zero'), 0); // the 2nd read: removed
  assert(!cache.has('zero'));

  cache.set('empty', '');
  assertEquals(cache.get('empty'), '');
  assertEquals(cache.get('empty'), ''); // the 2nd read: removed
  assert(!cache.has('empty'));
});

Deno.test('maxAge: an entry is removed on its maxAge-th read since it was set, which still returns the value', () => {
  const cache = new LruCache<string, string>(3, 3);
  cache.set('a', 'A');
  cache.set('b', 'B');

  assertEquals(cache.get('a'), 'A');
  assertEquals(cache.get('a'), 'A');
  assert(cache.has('a'));

  assertEquals(cache.get('a'), 'A'); // the 3rd read
  assert(!cache.has('a'));
  assertEquals(cache.get('a'), undefined);
  assertEquals([...cache.keys()], ['b']);
});

Deno.test('maxAge: an entry is removed on its first read when maxAge is 1', () => {
  const cache = new LruCache<string, string>(3, 1);
  cache.set('a', 'A');

  assertEquals(cache.get('a'), 'A');
  assert(!cache.has('a'));
  assertEquals(cache.size, 0);
});

Deno.test('maxAge: setting a key again starts counting its reads again', () => {
  const cache = new LruCache<string, string>(3, 2);
  cache.set('a', 'A');
  assertEquals(cache.get('a'), 'A'); // the 1st read

  cache.set('a', 'B');
  assertEquals(cache.get('a'), 'B'); // the 1st read since it was set again
  assert(cache.has('a'));

  assertEquals(cache.get('a'), 'B'); // the 2nd read
  assert(!cache.has('a'));
});

Deno.test('maxAge: with no maxAge, reads never remove an entry', () => {
  const cache = new LruCache<string, string>(3);
  cache.set('a', 'A');

  for (let i = 0; i < 10_000; i++) {
    assertEquals(cache.get('a'), 'A');
  }
  assert(cache.has('a'));
});

Deno.test('delete, clear, size and capacity', () => {
  const cache = new LruCache<string, number>(3, 2);
  assertEquals(cache.capacity, 3);
  assertEquals(cache.size, 0);

  cache.set('a', 1);
  cache.set('b', 2);
  assertEquals(cache.size, 2);

  assert(cache.delete('a'));
  assert(!cache.delete('a'));
  assert(!cache.has('a'));
  assertEquals(cache.size, 1);

  cache.clear();
  assertEquals(cache.size, 0);
  assertEquals([...cache], []);

  // the cache can be used after it has been cleared
  cache.set('c', 3);
  assertEquals(cache.get('c'), 3);
  assertEquals(cache.get('c'), 3); // the 2nd read: removed
  assertEquals(cache.size, 0);
});

Deno.test('the constructor throws a RangeError for a capacity that is not a positive integer, or a maxAge below 1', () => {
  for (const capacity of [0, -1, 1.5, NaN, Infinity]) {
    assertThrows(() => new LruCache(capacity), RangeError, 'capacity must be a positive integer');
  }
  for (const maxAge of [0, 0.5, -1, NaN]) {
    assertThrows(() => new LruCache(1, maxAge), RangeError, 'maxAge must be 1 or more');
  }

  assertEquals(new LruCache(1, 1).capacity, 1);
  assertEquals(new LruCache(1, Infinity).capacity, 1);
});

Deno.test('set and get do not slow down with the number of entries', () => {
  const capacity = 2_000;
  const cache = new LruCache<number, number>(capacity);

  const start = performance.now();
  for (let i = 1; i <= capacity * 3; i++) {
    cache.set(i, i); // removes an entry each time once the cache is full
    cache.get(i - capacity / 2);
  }
  const elapsed = performance.now() - start;

  assertEquals(cache.size, capacity);
  assert(elapsed < 100, `took ${elapsed} ms`);
});

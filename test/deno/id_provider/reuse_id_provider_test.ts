import { assert, assertEquals, assertExists, assertFalse, assertThrows } from '@std/assert';

import { ReuseIdProvider as IdProvider } from '../../../lib/id_provider/reuse_id_provider.ts';
import { PacketIdsExhaustedError } from '../../../lib/id_provider/error.ts';

/** A fixed pseudo-random sequence (mulberry32), so that a failure can be reproduced: integers from 0 to n - 1. */
function randomIntegers(seed: number): (n: number) => number {
  return (n) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

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

  assertEquals(idProvider.acquire(), 4); // the IDs below 6 are still handed out
  assertEquals(idProvider.acquire(), 5);
  assertEquals(idProvider.acquire(), 7); // 6 is in use
  assertEquals(idProvider.acquire(), 8);
});

Deno.test('registerIfNotInUse_2', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);

  assert(idProvider.registerIfNotInUse(6));
  assert(idProvider.registerIfNotInUse(3));

  assertEquals(idProvider.acquire(), 4);
  assertEquals(idProvider.acquire(), 5);
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

  assertEquals(idProvider.acquire(), 4);
  assertEquals(idProvider.acquire(), 5);
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

  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);

  assert(idProvider.release(4)); // next -> 4
  assert(idProvider.release(3)); // next -> 3
  assertEquals(idProvider.acquire(), 3);
});

Deno.test('registerIfNotInUse_5', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);

  assert(idProvider.registerIfNotInUse(6));
  assert(idProvider.release(6));

  assertEquals(idProvider.acquire(), 3);
  assert(idProvider.release(3));

  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);
  assertEquals(idProvider.acquire(), 5);
  assertEquals(idProvider.acquire(), 6);
  assertEquals(idProvider.acquire(), 7);
  assertEquals(idProvider.acquire(), 8);
  assertEquals(idProvider.acquire(), 9);
  assertThrows(() => idProvider.acquire());
});

Deno.test('a registered ID that was waiting to be reused is not handed out again', () => {
  const idProvider = new IdProvider(1, 9);
  assertEquals(idProvider.acquire(), 1);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assert(idProvider.release(2));

  assert(idProvider.registerIfNotInUse(2));

  assertEquals(idProvider.acquire(), 4);
  assert(idProvider.inUse(2));
  assert(idProvider.release(2));
  assertEquals(idProvider.acquire(), 2);
});

Deno.test('the ID 0 is reused when the range starts at 0', () => {
  const idProvider = new IdProvider(0, 3);
  assertEquals(idProvider.acquire(), 0);
  assertEquals(idProvider.acquire(), 1);
  assert(idProvider.release(0));

  assertEquals(idProvider.acquire(), 0);
  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assertThrows(() => idProvider.acquire(), PacketIdsExhaustedError, 'all the IDs from 0 to 3 are in use');
});

Deno.test('the IDs below a registered ID are still handed out', () => {
  // e.g. the packet ID of a packet kept in Deno KV, registered after the process restarts
  const idProvider = new IdProvider(1, 65535);
  assert(idProvider.registerIfNotInUse(65000));

  for (let id = 1; id < 65000; id++) {
    assertEquals(idProvider.acquire(), id);
  }
  assertEquals(idProvider.acquire(), 65001);
});

Deno.test('registerIfNotInUse does not take an ID out of the range', () => {
  const idProvider = new IdProvider(1, 9);
  for (const id of [0, 10, 1.5, NaN]) {
    assertFalse(idProvider.registerIfNotInUse(id));
    assertFalse(idProvider.inUse(id));
    assertFalse(idProvider.release(id));
  }
  assertEquals(idProvider.acquire(), 1);
});

Deno.test('releasing the highest ID lowers the next new ID past the released IDs right below it', () => {
  const idProvider = new IdProvider(1, 9);
  for (let id = 1; id <= 5; id++) {
    assertEquals(idProvider.acquire(), id);
  }
  assert(idProvider.release(4));
  assert(idProvider.release(2));
  assert(idProvider.release(3));

  assert(idProvider.release(5)); // 2 to 5 are free, 1 is in use

  assertEquals(idProvider.acquire(), 2);
  assertEquals(idProvider.acquire(), 3);
  assertEquals(idProvider.acquire(), 4);
  assertEquals(idProvider.acquire(), 5);
  assertEquals(idProvider.acquire(), 6);
});

Deno.test('the next new ID is not lowered past an ID in use', () => {
  const idProvider = new IdProvider(1, 9);
  for (let id = 1; id <= 5; id++) {
    assertEquals(idProvider.acquire(), id);
  }
  assert(idProvider.release(4));
  assert(idProvider.release(2));

  assert(idProvider.release(5)); // 4 and 5 are free, 3 is in use

  assertEquals(idProvider.acquire(), 2); // waiting to be reused
  assertEquals(idProvider.acquire(), 4);
  assertEquals(idProvider.acquire(), 5);
  assert(idProvider.inUse(3));
});

Deno.test('the IDs become small again once a burst is acknowledged', () => {
  const idProvider = new IdProvider(1, 65535);
  // 1000 PUBLISH packets are sent at once. Their acknowledgments come back one at a time, in order, while
  // 10 more messages at a time are in flight.
  const burst = Array.from({ length: 1000 }, () => idProvider.acquire());
  const inFlight: number[] = [];
  const handedOut: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const acknowledged = burst.shift();
    if (acknowledged !== undefined) {
      assert(idProvider.release(acknowledged));
    }
    const id = idProvider.acquire();
    handedOut.push(id);
    inFlight.push(id);
    if (inFlight.length > 10) {
      const oldest = inFlight.shift();
      assertExists(oldest);
      assert(idProvider.release(oldest));
    }
  }

  // The last acknowledgment of the burst came back after the 1000th message.
  assertEquals(Math.max(...handedOut.slice(1500)), 11);
});

Deno.test('a model of the IDs in use: an ID in use is never handed out, and a free ID is never lost', () => {
  const start = 1;
  const end = 20;
  const idProvider = new IdProvider(start, end);
  const model = new Set<number>();
  const random = randomIntegers(1);
  const happened = { acquired: 0, full: 0, released: 0, registered: 0 };

  for (let i = 0; i < 20_000; i++) {
    const id = start + random(end - start + 1);
    switch (random(4)) {
      case 0:
      case 1:
        if (model.size === end - start + 1) {
          assertThrows(() => idProvider.acquire());
          happened.full++;
        } else {
          const acquired = idProvider.acquire();
          assert(acquired >= start && acquired <= end, `${acquired} is out of the range`);
          assertFalse(model.has(acquired), `${acquired} is in use`);
          model.add(acquired);
          happened.acquired++;
        }
        break;
      case 2:
        assertEquals(idProvider.release(id), model.delete(id));
        happened.released++;
        break;
      case 3:
        if (model.has(id)) {
          assertFalse(idProvider.registerIfNotInUse(id));
        } else {
          assert(idProvider.registerIfNotInUse(id));
          model.add(id);
          happened.registered++;
        }
        break;
    }
    assertEquals(idProvider.inUse(id), model.has(id));
  }

  // every kind of call has been made many times
  for (const [kind, count] of Object.entries(happened)) {
    assert(count > 100, `${kind}: ${count}`);
  }
});

Deno.test('acquire, release and inUse do not slow down with the number of IDs in use', () => {
  const idProvider = new IdProvider(1, 65535);
  const inFlight = Array.from({ length: 30_000 }, () => idProvider.acquire());
  const random = randomIntegers(1);

  const start = performance.now();
  for (let i = 0; i < 100_000; i++) {
    const k = random(inFlight.length); // the acknowledgments come back in any order
    const id = inFlight[k];
    assertExists(id);
    assert(idProvider.release(id));
    assertFalse(idProvider.inUse(id));
    inFlight[k] = idProvider.acquire();
  }
  const elapsed = performance.now() - start;

  assertEquals(new Set(inFlight).size, inFlight.length);
  assert(elapsed < 200, `took ${elapsed} ms`);
});

Deno.test('the constructor rejects a range that is not one', () => {
  for (const [start, end] of [[1, 1], [2, 1], [0.5, 9], [1, NaN]] as const) {
    assertThrows(() => new IdProvider(start, end), RangeError, 'must be integers, and start must be less than end');
  }
});

import { assertEquals } from '@std/assert';
import { Timer } from '../../../lib/client/timer.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test('Timer runs the callback once after the time, and is not running after that', async () => {
  const timer = new Timer();
  let calls = 0;
  timer.start(10, () => calls++);
  assertEquals(timer.running, true);
  await delay(50);
  assertEquals(calls, 1);
  assertEquals(timer.running, false);
});

Deno.test('Timer: starting it again replaces the callback that has not run yet', async () => {
  const timer = new Timer();
  const calls: string[] = [];
  timer.start(10, () => calls.push('first'));
  timer.start(20, () => calls.push('second'));
  await delay(60);
  assertEquals(calls, ['second']);
});

Deno.test('Timer: stop() keeps the callback from running, and does nothing when the timer is not running', async () => {
  const timer = new Timer();
  timer.stop();
  let calls = 0;
  timer.start(10, () => calls++);
  timer.stop();
  assertEquals(timer.running, false);
  await delay(50);
  assertEquals(calls, 0);
  timer.stop();
});

Deno.test('Timer: the callback can start the timer again', async () => {
  const timer = new Timer();
  let calls = 0;
  const callback = () => {
    calls++;
    // Not running while its callback runs.
    assertEquals(timer.running, false);
    if (calls < 3) {
      timer.start(5, callback);
    }
  };
  timer.start(5, callback);
  await delay(100);
  assertEquals(calls, 3);
  assertEquals(timer.running, false);
});

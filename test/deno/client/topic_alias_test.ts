import { assertEquals } from 'std/assert/mod.ts';
import { TopicAliasManager } from '../../../lib/client/topic_alias.ts';

Deno.test('concurrent getTopicId calls for the same topic share one alias', async () => {
  const manager = new TopicAliasManager(3);
  assertEquals(await manager.getTopicId('warmup'), [true, 1]);

  const results = await Promise.all([
    manager.getTopicId('a'),
    manager.getTopicId('a'),
  ]);

  assertEquals(results[0][1], results[1][1]);
  assertEquals(results.filter(([generated]) => generated).length, 1);

  // The second call must reuse the alias instead of leaking a new one, so
  // the remaining capacity is still available for other topics.
  assertEquals(await manager.getTopicId('b'), [true, 3]);
});

Deno.test('concurrent getTopicId calls for distinct topics do not exhaust the provider', async () => {
  const manager = new TopicAliasManager(2);
  const results = await Promise.all([
    manager.getTopicId('a'),
    manager.getTopicId('b'),
    manager.getTopicId('c'),
    manager.getTopicId('d'),
  ]);

  assertEquals(results.length, 4);
  for (const [generated, topicId] of results) {
    assertEquals(generated, true);
    assertEquals(topicId >= 1 && topicId <= 2, true);
  }
});

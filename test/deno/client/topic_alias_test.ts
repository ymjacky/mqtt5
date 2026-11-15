import { assertEquals } from 'std/assert/mod.ts';
import { TopicAliasManager } from '../../../lib/client/topic_alias.ts';

Deno.test('getTopicId generates an alias for a new topic and returns it again for the same topic', () => {
  const manager = new TopicAliasManager(3);
  assertEquals(manager.getTopicId('a'), [true, 1]);
  assertEquals(manager.getTopicId('a'), [false, 1]);
  assertEquals(manager.getTopicId('b'), [true, 2]);
  assertEquals(manager.getTopicId('a'), [false, 1]);
  assertEquals(manager.getTopicId('b'), [false, 2]);
});

Deno.test('getTopicId replaces the least used topic when all aliases are in use', () => {
  const manager = new TopicAliasManager(2);
  assertEquals(manager.getTopicId('a'), [true, 1]);
  assertEquals(manager.getTopicId('b'), [true, 2]);
  assertEquals(manager.getTopicId('a'), [false, 1]); // 'a' is used more than 'b'

  assertEquals(manager.getTopicId('c'), [true, 2]); // replaces 'b'
  assertEquals(manager.getTopicId('a'), [false, 1]);
  assertEquals(manager.getTopicId('b'), [true, 2]); // registered again, replacing 'c'
});

Deno.test('releaseTopic removes the alias of the topic and makes it available again', () => {
  const manager = new TopicAliasManager(2);
  assertEquals(manager.getTopicId('a'), [true, 1]);
  assertEquals(manager.getTopicId('b'), [true, 2]);

  manager.releaseTopic('a');
  manager.releaseTopic('unknown'); // no alias: nothing happens
  assertEquals(manager.getTopicId('c'), [true, 1]);
  assertEquals(manager.getTopicId('a'), [true, 2]); // registered again, replacing 'b'
});

import { assert, assertEquals } from '@std/assert';
import { TopicAliasManager } from '../../../lib/client/topic_alias.ts';

Deno.test('getTopicId generates an alias for a new topic and returns it again for the same topic', () => {
  const manager = new TopicAliasManager(3);
  assertEquals(manager.getTopicId('a'), [true, 1]);
  assertEquals(manager.getTopicId('a'), [false, 1]);
  assertEquals(manager.getTopicId('b'), [true, 2]);
  assertEquals(manager.getTopicId('a'), [false, 1]);
  assertEquals(manager.getTopicId('b'), [false, 2]);
});

Deno.test('getTopicId replaces the least recently used topic when all aliases are in use', () => {
  const manager = new TopicAliasManager(2);
  assertEquals(manager.getTopicId('a'), [true, 1]);
  assertEquals(manager.getTopicId('b'), [true, 2]);
  assertEquals(manager.getTopicId('a'), [false, 1]); // 'a' is used more recently than 'b'

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

Deno.test('getTopicId keeps the aliases of the topics used recently, not of a topic used often before', () => {
  const manager = new TopicAliasManager(2);
  for (let i = 0; i < 100; i++) {
    manager.getTopicId('often'); // [true, 1] the first time
  }

  // 'often' is no longer used: 'a' and 'b' take the two aliases and keep them
  assertEquals(manager.getTopicId('a'), [true, 2]);
  assertEquals(manager.getTopicId('b'), [true, 1]); // replaces 'often'
  for (let i = 0; i < 100; i++) {
    assertEquals(manager.getTopicId('a'), [false, 2]);
    assertEquals(manager.getTopicId('b'), [false, 1]);
  }

  assertEquals(manager.getTopicId('often'), [true, 2]); // registered again, replacing 'a'
});

Deno.test('getTopicId works with a Topic Alias Maximum of 1', () => {
  const manager = new TopicAliasManager(1);
  assertEquals(manager.getTopicId('a'), [true, 1]);
  assertEquals(manager.getTopicId('a'), [false, 1]);
  assertEquals(manager.getTopicId('b'), [true, 1]); // replaces 'a'
  assertEquals(manager.getTopicId('b'), [false, 1]);

  manager.releaseTopic('b');
  assertEquals(manager.getTopicId('c'), [true, 1]);
  assertEquals(manager.getTopicId('a'), [true, 1]); // registered again, replacing 'c'
});

Deno.test('getTopicId returns an alias without the Topic Name only for the topic the broker has for that alias', () => {
  const topicAliasMaximum = 3;
  const topics = ['a', 'b', 'c', 'd', 'e'];
  const manager = new TopicAliasManager(topicAliasMaximum);
  /** What the broker knows: the topic last sent with each alias. */
  const broker = new Map<number, string>();

  // a fixed pseudo-random sequence, so that a failure can be reproduced
  let seed = 1;
  const random = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };

  for (let i = 0; i < 10_000; i++) {
    const topic = topics[random(topics.length)];
    const [generated, topicAlias] = manager.getTopicId(topic);
    assert(1 <= topicAlias && topicAlias <= topicAliasMaximum, `alias ${topicAlias}`);

    if (generated && random(10) === 0) {
      // the PUBLISH that registers the alias is not sent, so the broker does not know it
      manager.releaseTopic(topic);
    } else if (generated) {
      broker.set(topicAlias, topic); // sent with the Topic Name
    } else {
      assertEquals(broker.get(topicAlias), topic, `PUBLISH ${i}: alias ${topicAlias} sent without the Topic Name`);
    }
  }
});

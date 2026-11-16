import { Store } from '../../../deno/mod.ts';
import { kvStore, testOutgoingStoreContract } from './outgoing_store_contract.ts';

Deno.test({ name: '@OutgoingStore contract: MemoryStore', only: false }, async (context) => {
  await testOutgoingStoreContract(context, () => Promise.resolve({ store: new Store.MemoryStore() }));
});

Deno.test({ name: '@OutgoingStore contract: KvOutgoingStore', only: false }, async (context) => {
  await testOutgoingStoreContract(context, async () => {
    const kv = await Deno.openKv(':memory:');
    return { store: kvStore(kv, 'cid'), close: () => kv.close() };
  });
});

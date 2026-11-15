import { testPropertyCases } from './test_helper.ts';

// Properties of type Variable Byte Integer
testPropertyCases([
  // id: 0x0B (subscriptionIdentifier / subscriptionIdentifiers). SUBSCRIBE uses subscriptionIdentifier, PUBLISH uses subscriptionIdentifiers.
  // The decoder always returns subscriptionIdentifiers.
  {
    name: 'subscriptionIdentifier',
    encode: { subscriptionIdentifier: 1 },
    decode: { subscriptionIdentifiers: [1] },
    bytes: [0x0B, 0x01],
  },
  {
    name: 'subscriptionIdentifier largest Variable Byte Integer',
    encode: { subscriptionIdentifier: 268_435_455 },
    decode: { subscriptionIdentifiers: [268_435_455] },
    bytes: [0x0B, 0xFF, 0xFF, 0xFF, 0x7F],
  },
  {
    name: 'subscriptionIdentifiers largest Variable Byte Integer',
    encode: { subscriptionIdentifiers: [268_435_455] },
    bytes: [0x0B, 0xFF, 0xFF, 0xFF, 0x7F],
  },
  {
    name: 'subscriptionIdentifiers, order kept',
    encode: { subscriptionIdentifiers: [42, 1, 268_435_455] },
    bytes: [
      ...[0x0B, 0x2A], // 42
      ...[0x0B, 0x01], // 1
      ...[0x0B, 0xFF, 0xFF, 0xFF, 0x7F], // 268,435,455
    ],
  },
]);

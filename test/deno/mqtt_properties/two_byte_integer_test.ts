import { testPropertyCases } from './test_helper.ts';

// Properties of type Two Byte Integer
testPropertyCases([
  // id: 0x13 (serverKeepAlive)
  { name: 'serverKeepAlive', encode: { serverKeepAlive: 300 }, bytes: [0x13, 0x01, 0x2C] },
  { name: 'serverKeepAlive 0', encode: { serverKeepAlive: 0 }, bytes: [0x13, 0x00, 0x00] },
  { name: 'serverKeepAlive 65535', encode: { serverKeepAlive: 65535 }, bytes: [0x13, 0xFF, 0xFF] },

  // id: 0x21 (receiveMaximum)
  { name: 'receiveMaximum', encode: { receiveMaximum: 65535 }, bytes: [0x21, 0xFF, 0xFF] },
  { name: 'receiveMaximum 1', encode: { receiveMaximum: 1 }, bytes: [0x21, 0x00, 0x01] },

  // id: 0x22 (topicAliasMaximum)
  { name: 'topicAliasMaximum', encode: { topicAliasMaximum: 10 }, bytes: [0x22, 0x00, 0x0A] },
  { name: 'topicAliasMaximum 65535', encode: { topicAliasMaximum: 65535 }, bytes: [0x22, 0xFF, 0xFF] },
  // 0 means the same as no Topic Alias Maximum, but it is encoded as given.
  { name: 'topicAliasMaximum 0', encode: { topicAliasMaximum: 0 }, bytes: [0x22, 0x00, 0x00] },

  // id: 0x23 (topicAlias)
  { name: 'topicAlias', encode: { topicAlias: 1 }, bytes: [0x23, 0x00, 0x01] },
  { name: 'topicAlias 65535', encode: { topicAlias: 65535 }, bytes: [0x23, 0xFF, 0xFF] },
]);

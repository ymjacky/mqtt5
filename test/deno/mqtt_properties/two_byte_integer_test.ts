import { testPropertyCases } from './test_helper.ts';

// Properties of type Two Byte Integer
testPropertyCases([
  // id: 0x13 (serverKeepAlive)
  { name: 'serverKeepAlive', encode: { serverKeepAlive: 300 }, bytes: [0x13, 0x01, 0x2C] },
  { name: 'serverKeepAlive 0', encode: { serverKeepAlive: 0 }, bytes: [0x13, 0x00, 0x00] },

  // id: 0x21 (receiveMaximum)
  { name: 'receiveMaximum', encode: { receiveMaximum: 65535 }, bytes: [0x21, 0xFF, 0xFF] },

  // id: 0x22 (topicAliasMaximum)
  { name: 'topicAliasMaximum', encode: { topicAliasMaximum: 10 }, bytes: [0x22, 0x00, 0x0A] },
  { name: 'topicAliasMaximum 0', decode: { topicAliasMaximum: 0 }, bytes: [0x22, 0x00, 0x00] },

  // id: 0x23 (topicAlias)
  { name: 'topicAlias', encode: { topicAlias: 1 }, bytes: [0x23, 0x00, 0x01] },
]);

import { testPropertyCases } from './test_helper.ts';

// Properties of type UTF-8 String Pair
testPropertyCases([
  // id: 0x26 (userProperties)
  { name: 'userProperties', encode: { userProperties: [{ key: 'k', val: 'v' }] }, bytes: [0x26, 0x00, 0x01, 0x6B, 0x00, 0x01, 0x76] },
  {
    name: 'userProperties with the same key, order kept',
    encode: {
      userProperties: [
        { key: 'a', val: '1' },
        { key: 'b', val: '2' },
        { key: 'a', val: '3' },
      ],
    },
    bytes: [
      ...[0x26, 0x00, 0x01, 0x61, 0x00, 0x01, 0x31], // a=1
      ...[0x26, 0x00, 0x01, 0x62, 0x00, 0x01, 0x32], // b=2
      ...[0x26, 0x00, 0x01, 0x61, 0x00, 0x01, 0x33], // a=3
    ],
  },
]);

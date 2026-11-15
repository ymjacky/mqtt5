import { testPropertyCases } from './test_helper.ts';

// Properties of type Binary Data
testPropertyCases([
  // id: 0x09 (correlationData)
  { name: 'correlationData', encode: { correlationData: new Uint8Array([0x01, 0x02, 0x03]) }, bytes: [0x09, 0x00, 0x03, 0x01, 0x02, 0x03] },

  // id: 0x16 (authenticationData)
  { name: 'authenticationData', encode: { authenticationData: new Uint8Array([0xAB]) }, bytes: [0x16, 0x00, 0x01, 0xAB] },
]);

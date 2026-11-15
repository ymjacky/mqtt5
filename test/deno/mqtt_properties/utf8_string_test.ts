import { testPropertyCases } from './test_helper.ts';

// Properties of type UTF-8 Encoded String
testPropertyCases([
  // id: 0x03 (contentType)
  { name: 'contentType', encode: { contentType: 'a/b' }, bytes: [0x03, 0x00, 0x03, 0x61, 0x2F, 0x62] },
  { name: 'contentType empty', encode: { contentType: '' }, bytes: [0x03, 0x00, 0x00] },

  // id: 0x08 (responseTopic)
  { name: 'responseTopic', encode: { responseTopic: 'r' }, bytes: [0x08, 0x00, 0x01, 0x72] },
  { name: 'responseTopic empty', encode: { responseTopic: '' }, bytes: [0x08, 0x00, 0x00] },

  // id: 0x12 (assignedClientIdentifier)
  { name: 'assignedClientIdentifier', encode: { assignedClientIdentifier: 'id' }, bytes: [0x12, 0x00, 0x02, 0x69, 0x64] },
  { name: 'assignedClientIdentifier empty', encode: { assignedClientIdentifier: '' }, bytes: [0x12, 0x00, 0x00] },

  // id: 0x15 (authenticationMethod)
  { name: 'authenticationMethod', encode: { authenticationMethod: 'm' }, bytes: [0x15, 0x00, 0x01, 0x6D] },
  { name: 'authenticationMethod empty', encode: { authenticationMethod: '' }, bytes: [0x15, 0x00, 0x00] },

  // id: 0x1A (responseInformation)
  { name: 'responseInformation', encode: { responseInformation: 'ri' }, bytes: [0x1A, 0x00, 0x02, 0x72, 0x69] },
  { name: 'responseInformation empty', encode: { responseInformation: '' }, bytes: [0x1A, 0x00, 0x00] },

  // id: 0x1C (serverReference)
  { name: 'serverReference', encode: { serverReference: 's' }, bytes: [0x1C, 0x00, 0x01, 0x73] },
  { name: 'serverReference empty', encode: { serverReference: '' }, bytes: [0x1C, 0x00, 0x00] },

  // id: 0x1F (reasonString)
  { name: 'reasonString', encode: { reasonString: 'ok' }, bytes: [0x1F, 0x00, 0x02, 0x6F, 0x6B] },
  { name: 'reasonString empty', encode: { reasonString: '' }, bytes: [0x1F, 0x00, 0x00] },
]);

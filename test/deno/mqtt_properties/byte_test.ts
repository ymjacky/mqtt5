import { testPropertyCases } from './test_helper.ts';

// Properties of type Byte
testPropertyCases([
  // id: 0x01 (payloadFormatIndicator)
  { name: 'payloadFormatIndicator 1', encode: { payloadFormatIndicator: 1 }, bytes: [0x01, 0x01] },
  { name: 'payloadFormatIndicator 0', decode: { payloadFormatIndicator: 0 }, bytes: [0x01, 0x00] },

  // id: 0x17 (requestProblemInformation)
  { name: 'requestProblemInformation true', encode: { requestProblemInformation: true }, bytes: [0x17, 0x01] },
  { name: 'requestProblemInformation false', encode: { requestProblemInformation: false }, bytes: [0x17, 0x00] },

  // id: 0x19 (requestResponseInformation)
  { name: 'requestResponseInformation true', encode: { requestResponseInformation: true }, bytes: [0x19, 0x01] },
  { name: 'requestResponseInformation false', encode: { requestResponseInformation: false }, bytes: [0x19, 0x00] },

  // id: 0x24 (maximumQoS)
  { name: 'maximumQoS 0', encode: { maximumQoS: 0 }, bytes: [0x24, 0x00] },
  { name: 'maximumQoS 1', encode: { maximumQoS: 1 }, bytes: [0x24, 0x01] },

  // id: 0x25 (retainAvailable)
  { name: 'retainAvailable true', encode: { retainAvailable: true }, bytes: [0x25, 0x01] },
  { name: 'retainAvailable false', encode: { retainAvailable: false }, bytes: [0x25, 0x00] },

  // id: 0x28 (wildcardSubscriptionAvailable)
  { name: 'wildcardSubscriptionAvailable true', encode: { wildcardSubscriptionAvailable: true }, bytes: [0x28, 0x01] },
  { name: 'wildcardSubscriptionAvailable false', encode: { wildcardSubscriptionAvailable: false }, bytes: [0x28, 0x00] },

  // id: 0x29 (subscriptionIdentifiersAvailable)
  { name: 'subscriptionIdentifiersAvailable true', encode: { subscriptionIdentifiersAvailable: true }, bytes: [0x29, 0x01] },
  { name: 'subscriptionIdentifiersAvailable false', encode: { subscriptionIdentifiersAvailable: false }, bytes: [0x29, 0x00] },

  // id: 0x2A (sharedSubscriptionAvailable)
  { name: 'sharedSubscriptionAvailable true', encode: { sharedSubscriptionAvailable: true }, bytes: [0x2A, 0x01] },
  { name: 'sharedSubscriptionAvailable false', encode: { sharedSubscriptionAvailable: false }, bytes: [0x2A, 0x00] },
]);

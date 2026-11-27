import { testPropertyCases } from './test_helper.ts';

// Properties of type Four Byte Integer
testPropertyCases([
  // id: 0x02 (messageExpiryInterval)
  { name: 'messageExpiryInterval', encode: { messageExpiryInterval: 0x01020304 }, bytes: [0x02, 0x01, 0x02, 0x03, 0x04] },
  { name: 'messageExpiryInterval 0xFFFFFFFF', encode: { messageExpiryInterval: 0xFFFFFFFF }, bytes: [0x02, 0xFF, 0xFF, 0xFF, 0xFF] },
  { name: 'messageExpiryInterval 0', encode: { messageExpiryInterval: 0 }, bytes: [0x02, 0x00, 0x00, 0x00, 0x00] },

  // id: 0x11 (sessionExpiryInterval)
  { name: 'sessionExpiryInterval', encode: { sessionExpiryInterval: 3600 }, bytes: [0x11, 0x00, 0x00, 0x0E, 0x10] },
  { name: 'sessionExpiryInterval 0xFFFFFFFF', encode: { sessionExpiryInterval: 0xFFFFFFFF }, bytes: [0x11, 0xFF, 0xFF, 0xFF, 0xFF] },
  { name: 'sessionExpiryInterval 0', encode: { sessionExpiryInterval: 0 }, bytes: [0x11, 0x00, 0x00, 0x00, 0x00] },

  // id: 0x18 (willDelayInterval)
  { name: 'willDelayInterval', encode: { willDelayInterval: 60 }, bytes: [0x18, 0x00, 0x00, 0x00, 0x3C] },
  { name: 'willDelayInterval 0xFFFFFFFF', encode: { willDelayInterval: 0xFFFFFFFF }, bytes: [0x18, 0xFF, 0xFF, 0xFF, 0xFF] },
  // 0 means the same as no Will Delay Interval, but it is encoded as given.
  { name: 'willDelayInterval 0', encode: { willDelayInterval: 0 }, bytes: [0x18, 0x00, 0x00, 0x00, 0x00] },

  // id: 0x27 (maximumPacketSize)
  { name: 'maximumPacketSize', encode: { maximumPacketSize: 1024 }, bytes: [0x27, 0x00, 0x00, 0x04, 0x00] },
  { name: 'maximumPacketSize 268,435,455', encode: { maximumPacketSize: 268_435_455 }, bytes: [0x27, 0x0F, 0xFF, 0xFF, 0xFF] },
  { name: 'maximumPacketSize 1', encode: { maximumPacketSize: 1 }, bytes: [0x27, 0x00, 0x00, 0x00, 0x01] },
  { name: 'maximumPacketSize 0xFFFFFFFF', encode: { maximumPacketSize: 0xFFFFFFFF }, bytes: [0x27, 0xFF, 0xFF, 0xFF, 0xFF] },
]);

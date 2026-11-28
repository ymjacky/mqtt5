import { assert, assertThrows } from '@std/assert';
import { Mqtt } from '../../../deno/mod.ts';
import { InvalidArgumentError, InvalidPropertyError, InvalidTopicFilterError, InvalidTopicNameError } from '../../../lib/client/error.ts';
import {
  validateAuth,
  validateClientOptions,
  validateConnect,
  validateDisconnect,
  validateProperties,
  validatePublish,
  validateSubscribe,
  validateTopicFilter,
  validateTopicName,
  validateUnsubscribe,
} from '../../../lib/client/validation.ts';

const V5 = Mqtt.ProtocolVersion.MqttV5;
const V3 = Mqtt.ProtocolVersion.MqttV3_1_1;
const MAX_FOUR = 0xFFFF_FFFF;

Deno.test('validateTopicName accepts valid topic names', () => {
  for (const topic of ['a', 'a/b', '/', 'a//b', '$SYS/x', ' ', 'あ']) {
    validateTopicName(topic, 'topic');
  }
});

Deno.test('validateTopicName rejects invalid topic names', () => {
  for (const topic of ['', 'a/#', '#', 'a/+/b', '+', 'a+', 'a\u0000b']) {
    assertThrows(() => validateTopicName(topic, 'topic'), InvalidTopicNameError, undefined, JSON.stringify(topic));
  }
});

Deno.test('validateTopicName and validateTopicFilter limit the length to 65,535 bytes in UTF-8', () => {
  validateTopicName('a'.repeat(65_535), 'topic');
  validateTopicFilter('a'.repeat(65_535), V5);
  assertThrows(() => validateTopicName('a'.repeat(65_536), 'topic'), InvalidTopicNameError, '65535 bytes');
  assertThrows(() => validateTopicFilter('a'.repeat(65_536), V5), InvalidTopicFilterError, '65535 bytes');
  // 'あ' is 3 bytes in UTF-8.
  assertThrows(() => validateTopicName('あ'.repeat(21_846), 'topic'), InvalidTopicNameError, '65535 bytes');
});

Deno.test('validateTopicFilter accepts valid topic filters', () => {
  const filters = ['a', '#', '+', 'a/#', 'a/+/b', '+/+', '/', '/#', '+/', 'a//b', '$share/g/a', '$share/g/#', '$share/g/+/b', '$share'];
  for (const filter of filters) {
    validateTopicFilter(filter, V5);
  }
});

Deno.test('validateTopicFilter rejects invalid topic filters', () => {
  const filters = [
    '',
    'a\u0000',
    'a/#/b',
    '#/a',
    'a#',
    'a/#b',
    'a+',
    'a/+b',
    '+a/b',
    '$share/',
    '$share/g',
    '$share//a',
    '$share/g/',
    '$share/g+/a',
    '$share/g#/a',
    '$share/g/a/#/b',
    '$share/g\u0000x/a',
    '$share/g/a\u0000',
  ];
  for (const filter of filters) {
    assertThrows(() => validateTopicFilter(filter, V5), InvalidTopicFilterError, undefined, JSON.stringify(filter));
  }
});

Deno.test('validateTopicFilter names the problem of a shared subscription', () => {
  assertThrows(() => validateTopicFilter('$share/g\u0000x/a', V5), InvalidTopicFilterError, 'must not contain U+0000');
  assertThrows(() => validateTopicFilter('$share/g', V5), InvalidTopicFilterError, 'must have the form $share/{ShareName}/{filter}');
  assertThrows(
    () => validateTopicFilter('$share/g/', V5),
    InvalidTopicFilterError,
    'the topic filter after $share/{ShareName}/ must be at least one character long',
  );
});

Deno.test('validateTopicFilter does not apply the shared subscription rules to MQTT 3.1.1', () => {
  // $share is not special in MQTT 3.1.1: these are ordinary topic filters.
  for (const filter of ['$share/', '$share/g', '$share//a']) {
    validateTopicFilter(filter, V3);
  }
  assertThrows(() => validateTopicFilter('$share/g+/a', V3), InvalidTopicFilterError);
  assertThrows(() => validateTopicFilter('$share/g\u0000x/a', V3), InvalidTopicFilterError);
});

Deno.test('a lone surrogate is rejected: UTF-8 cannot encode it, and TextEncoder would send U+FFFD in its place [MQTT-1.5.4-1]', () => {
  // A surrogate pair is one character: it is accepted.
  validateTopicName('a/\u{1F600}', 'topic');
  validateTopicFilter('\u{1F600}/#', V5);
  validateProperties({ contentType: '\u{1F600}', userProperties: [{ key: '\u{1F600}', val: '\uD83D\uDE00' }] }, 'properties');

  // a high surrogate without its pair, a low one, a pair in the wrong order, and one after a pair
  for (const str of ['a\uD800', '\uDC00a', 'a\uDE00\uD83Db', '\u{1F600}\uDBFF']) {
    const quoted = JSON.stringify(str);
    assertThrows(() => validateTopicName(str, 'topic'), InvalidTopicNameError, 'lone surrogate', quoted);
    assertThrows(() => validateTopicFilter(str, V5), InvalidTopicFilterError, 'lone surrogate', quoted);
    assertThrows(() => validateTopicFilter(str, V3), InvalidTopicFilterError, 'lone surrogate', quoted);
    assertThrows(() => validateProperties({ contentType: str }, 'properties'), InvalidPropertyError, 'lone surrogate', quoted);
  }
  assertThrows(() => validateTopicFilter('$share/g\uD800/a', V5), InvalidTopicFilterError, 'lone surrogate');
  // The message shows the lone surrogate escaped.
  assertThrows(
    () => validateProperties({ userProperties: [{ key: 'k', val: 'v\uDFFF' }] }, 'properties'),
    InvalidPropertyError,
    'properties.userProperties[0].val "v\\udfff" must not contain a lone surrogate',
  );
  assertThrows(() => validateProperties({ responseTopic: 'r\uD800' }, 'properties'), InvalidTopicNameError, 'properties.responseTopic');
  assertThrows(() => validatePublish('a\uD800', 'p', 0, false, undefined, V3), InvalidTopicNameError, 'lone surrogate');
  assertThrows(() => validateConnect({ will: { topic: 'w\uD800' } }, V3), InvalidTopicNameError, 'will.topic');
  assertThrows(() => validateDisconnect({ reasonString: 'bye\uD800' }, undefined, V5), InvalidPropertyError, 'properties.reasonString');
});

Deno.test('validateProperties accepts valid properties', () => {
  validateProperties(undefined, 'properties');
  validateProperties({}, 'properties');
  validateProperties(
    {
      payloadFormatIndicator: 1,
      messageExpiryInterval: MAX_FOUR,
      contentType: '',
      responseTopic: 'r',
      correlationData: new Uint8Array(65_535),
      subscriptionIdentifier: 268_435_455,
      sessionExpiryInterval: 0,
      authenticationMethod: 'a'.repeat(65_535),
      authenticationData: new Uint8Array(0),
      willDelayInterval: MAX_FOUR,
      receiveMaximum: 65_535,
      topicAliasMaximum: 0,
      userProperties: [{ key: '', val: 'v' }],
      maximumPacketSize: 1,
      requestProblemInformation: true,
    },
    'properties',
  );
  validateProperties({ payloadFormatIndicator: 0, messageExpiryInterval: 0, receiveMaximum: 1 }, 'properties');
});

Deno.test('validateProperties rejects invalid properties', () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ payloadFormatIndicator: 2 }, 'properties.payloadFormatIndicator'],
    [{ payloadFormatIndicator: -1 }, 'properties.payloadFormatIndicator'],
    [{ messageExpiryInterval: -1 }, 'properties.messageExpiryInterval'],
    [{ messageExpiryInterval: MAX_FOUR + 1 }, 'properties.messageExpiryInterval'],
    [{ messageExpiryInterval: 1.5 }, 'properties.messageExpiryInterval'],
    [{ messageExpiryInterval: '60' }, 'properties.messageExpiryInterval'],
    [{ contentType: 'a\u0000' }, 'properties.contentType'],
    [{ contentType: 'a'.repeat(65_536) }, 'properties.contentType'],
    [{ contentType: 1 }, 'properties.contentType'],
    [{ correlationData: new Uint8Array(65_536) }, 'properties.correlationData'],
    [{ correlationData: 'data' }, 'properties.correlationData'],
    [{ subscriptionIdentifier: 0 }, 'properties.subscriptionIdentifier'],
    [{ subscriptionIdentifier: 268_435_456 }, 'properties.subscriptionIdentifier'],
    [{ sessionExpiryInterval: MAX_FOUR + 1 }, 'properties.sessionExpiryInterval'],
    [{ authenticationMethod: 'a\u0000' }, 'properties.authenticationMethod'],
    [{ authenticationData: new Uint8Array(65_536) }, 'properties.authenticationData'],
    [{ willDelayInterval: -1 }, 'properties.willDelayInterval'],
    [{ receiveMaximum: 0 }, 'properties.receiveMaximum'],
    [{ receiveMaximum: 65_536 }, 'properties.receiveMaximum'],
    [{ topicAliasMaximum: 65_536 }, 'properties.topicAliasMaximum'],
    [{ maximumPacketSize: 0 }, 'properties.maximumPacketSize'],
    [{ userProperties: {} }, 'properties.userProperties'],
    [{ userProperties: [{ key: 'k\u0000', val: 'v' }] }, 'properties.userProperties[0].key'],
    [{ userProperties: [{ key: 'k', val: 'v' }, { key: 'k', val: 'a'.repeat(65_536) }] }, 'properties.userProperties[1].val'],
    [{ userProperties: [{ key: 'k' }] }, 'properties.userProperties[0].val'],
  ];
  for (const [properties, name] of cases) {
    assertThrows(() => validateProperties(properties, 'properties'), InvalidPropertyError, name);
  }
});

Deno.test('validateProperties checks the Response Topic as a Topic Name', () => {
  assertThrows(() => validateProperties({ responseTopic: 'r/+' }, 'properties'), InvalidTopicNameError, 'properties.responseTopic "r/+"');
  assertThrows(() => validateProperties({ responseTopic: '' }, 'properties'), InvalidTopicNameError, 'properties.responseTopic');
  assertThrows(() => validateProperties({ responseTopic: 1 }, 'properties'), InvalidPropertyError, 'properties.responseTopic');
});

Deno.test('validatePublish checks the topic, the QoS, the DUP flag and the properties', () => {
  validatePublish('a', 'p', 0, false, { responseTopic: 'r', messageExpiryInterval: 0 }, V5);
  validatePublish('a', 'p', 1, true, undefined, V5);
  validatePublish('a', 'p', 2, true, undefined, V5);
  assertThrows(() => validatePublish('a/#', 'p', 0, false, undefined, V5), InvalidTopicNameError, 'topic "a/#"');
  for (const qos of [3, -1, 1.5]) {
    assertThrows(() => validatePublish('a', 'p', qos, false, undefined, V5), InvalidArgumentError, 'qos must be 0, 1 or 2');
  }
  // [MQTT-3.3.1-2]
  assertThrows(() => validatePublish('a', 'p', 0, true, undefined, V5), InvalidArgumentError, 'dup must be false for QoS 0');
  assertThrows(() => validatePublish('a', 'p', 0, true, undefined, V3), InvalidArgumentError, 'dup must be false for QoS 0');
  assertThrows(() => validatePublish('a', 'p', 0, false, { responseTopic: 'r/+' }, V5), InvalidTopicNameError, 'properties.responseTopic "r/+"');
  assertThrows(() => validatePublish('a', 'p', 0, false, { messageExpiryInterval: -1 }, V5), InvalidPropertyError, 'properties.messageExpiryInterval');
});

Deno.test('validatePublish rejects a string payload with a lone surrogate, which UTF-8 cannot encode', () => {
  const cases: [string, number][] = [['a\uD800', 1], ['\uDC00a', 0], ['a\uDE00\uD83Db', 1], ['\u{1F600}\uDBFF', 2]];
  for (const [payload, index] of cases) {
    for (const protocolVersion of [V5, V3]) {
      assertThrows(
        () => validatePublish('a', payload, 0, false, undefined, protocolVersion),
        InvalidArgumentError,
        `payload must not contain a lone surrogate, which UTF-8 cannot encode (found at index ${index})`,
        JSON.stringify(payload),
      );
    }
  }
});

Deno.test('validatePublish accepts any other string payload, and does not check a Uint8Array payload', () => {
  // A payload is not a UTF-8 Encoded String: U+0000 is allowed, and U+FEFF is sent as it is.
  for (const payload of ['', 'a\u0000b', '\u{FEFF}abc', '\u{1F600}', 'あ', '\u{FFFD}']) {
    validatePublish('a', payload, 0, false, undefined, V5);
    validatePublish('a', payload, 0, false, undefined, V3);
  }
  // A Uint8Array may be any bytes, also the encoding of a surrogate, which is not UTF-8.
  validatePublish('a', new Uint8Array([0xED, 0xA0, 0x80, 0xFF, 0x00]), 0, false, undefined, V5);
});

Deno.test('validatePublish does not check the properties in MQTT 3.1.1: they are not sent', () => {
  validatePublish('a', 'p', 0, false, { responseTopic: 'r/+', messageExpiryInterval: -1 }, V3);
  assertThrows(() => validatePublish('a/#', 'p', 0, false, undefined, V3), InvalidTopicNameError);
  assertThrows(() => validatePublish('a', 'p', 3, false, undefined, V3), InvalidArgumentError);
});

Deno.test('validateSubscribe accepts valid subscriptions', () => {
  validateSubscribe(
    [
      { topicFilter: 'a', qos: 0 },
      { topicFilter: 'b', qos: 1, retainHandling: 0 },
      { topicFilter: 'c', qos: 2, retainHandling: 2, noLocal: true },
      { topicFilter: '$share/g/d', qos: 0, noLocal: false },
    ],
    { subscriptionIdentifier: 1 },
    V5,
  );
  validateSubscribe([{ topicFilter: 'a', qos: 0 }], { subscriptionIdentifier: 268_435_455 }, V5);
  // noLocal on $share is fine in MQTT 3.1.1: it is not a shared subscription there (and noLocal is not sent).
  validateSubscribe([{ topicFilter: '$share/g/a', qos: 0, noLocal: true }], undefined, V3);
});

Deno.test('validateSubscribe does not check Retain Handling and the properties in MQTT 3.1.1: they are not sent', () => {
  validateSubscribe(
    [{ topicFilter: 'a', qos: 0, retainHandling: 3 as Mqtt.RetainHandling }],
    { subscriptionIdentifier: 0, userProperties: [{ key: 'k', val: 'v\u0000' }] },
    V3,
  );
  assertThrows(() => validateSubscribe([], undefined, V3), InvalidArgumentError);
  assertThrows(() => validateSubscribe([{ topicFilter: 'a/#/b', qos: 0 }], undefined, V3), InvalidTopicFilterError);
  assertThrows(() => validateSubscribe([{ topicFilter: 'a', qos: 3 as Mqtt.QoS }], undefined, V3), InvalidArgumentError, 'qos of "a"');
});

Deno.test('validateSubscribe rejects invalid subscriptions', () => {
  assertThrows(() => validateSubscribe([], undefined, V5), InvalidArgumentError, 'at least one');
  assertThrows(() => validateSubscribe([{ topicFilter: 'a/#/b', qos: 0 }], undefined, V5), InvalidTopicFilterError);
  for (const qos of [3, -1, 1.5]) {
    assertThrows(
      () => validateSubscribe([{ topicFilter: 'a', qos: qos as Mqtt.QoS }], undefined, V5),
      InvalidArgumentError,
      'qos of "a"',
    );
  }
  assertThrows(
    () => validateSubscribe([{ topicFilter: 'a', qos: 0, retainHandling: 3 as Mqtt.RetainHandling }], undefined, V5),
    InvalidArgumentError,
    'retainHandling of "a"',
  );
  assertThrows(
    () => validateSubscribe([{ topicFilter: '$share/g/a', qos: 0, noLocal: true }], undefined, V5),
    InvalidArgumentError,
    'noLocal',
  );
  for (const subscriptionIdentifier of [0, -1, 268_435_456, 1.5]) {
    assertThrows(
      () => validateSubscribe([{ topicFilter: 'a', qos: 0 }], { subscriptionIdentifier }, V5),
      InvalidPropertyError,
      'properties.subscriptionIdentifier',
    );
  }
  assertThrows(
    () => validateSubscribe([{ topicFilter: 'a', qos: 0 }], { userProperties: [{ key: 'k', val: 'v\u0000' }] }, V5),
    InvalidPropertyError,
    'properties.userProperties[0].val',
  );
});

Deno.test('validateUnsubscribe checks the topic filters and the properties', () => {
  validateUnsubscribe(['a', 'b/#', '$share/g/c'], { userProperties: [{ key: 'k', val: 'v' }] }, V5);
  assertThrows(() => validateUnsubscribe([], undefined, V5), InvalidArgumentError, 'at least one');
  assertThrows(() => validateUnsubscribe(['a', 'b/#/c'], undefined, V5), InvalidTopicFilterError, '"b/#/c"');
  assertThrows(() => validateUnsubscribe(['$share/g'], undefined, V5), InvalidTopicFilterError);
  assertThrows(
    () => validateUnsubscribe(['a'], { userProperties: [{ key: 'k\u0000', val: 'v' }] }, V5),
    InvalidPropertyError,
    'properties.userProperties[0].key',
  );
  // The properties are not sent in MQTT 3.1.1.
  validateUnsubscribe(['a'], { userProperties: [{ key: 'k\u0000', val: 'v' }] }, V3);
  assertThrows(() => validateUnsubscribe([], undefined, V3), InvalidArgumentError);
});

Deno.test('validateConnect checks the properties and the will', () => {
  validateConnect(undefined, V5);
  validateConnect({ clean: true }, V5);
  validateConnect({ properties: { sessionExpiryInterval: 300 }, will: { topic: 'a', qos: 2, payload: new Uint8Array(65_535) } }, V5);
  validateConnect({ will: { topic: 'a', properties: { responseTopic: 'r', willDelayInterval: 10 } } }, V5);

  assertThrows(() => validateConnect({ properties: { receiveMaximum: 0 } }, V5), InvalidPropertyError, 'properties.receiveMaximum');
  assertThrows(() => validateConnect({ will: { topic: '' } }, V5), InvalidTopicNameError, 'will.topic');
  assertThrows(() => validateConnect({ will: { topic: 'a/+' } }, V5), InvalidTopicNameError, 'will.topic');
  assertThrows(() => validateConnect({ will: { topic: 'a', qos: 3 as Mqtt.QoS } }, V5), InvalidArgumentError, 'will.qos');
  assertThrows(() => validateConnect({ will: { topic: 'a', payload: new Uint8Array(65_536) } }, V5), InvalidArgumentError, 'will.payload');
  assertThrows(
    () => validateConnect({ will: { topic: 'a', properties: { responseTopic: 'r/#' } } }, V5),
    InvalidTopicNameError,
    'will.properties.responseTopic',
  );
  assertThrows(
    () => validateConnect({ will: { topic: 'a', properties: { willDelayInterval: MAX_FOUR + 1 } } }, V5),
    InvalidPropertyError,
    'will.properties.willDelayInterval',
  );
});

Deno.test('validateConnect does not check the properties in MQTT 3.1.1: they are not sent', () => {
  validateConnect({ properties: { receiveMaximum: 0 }, will: { topic: 'a', properties: { responseTopic: 'r/#' } } }, V3);
  assertThrows(() => validateConnect({ will: { topic: 'a/+' } }, V3), InvalidTopicNameError, 'will.topic');
  assertThrows(() => validateConnect({ will: { topic: 'a', qos: 3 as Mqtt.QoS } }, V3), InvalidArgumentError, 'will.qos');
  assertThrows(() => validateConnect({ will: { topic: 'a', payload: new Uint8Array(65_536) } }, V3), InvalidArgumentError, 'will.payload');
});

Deno.test('validateClientOptions rejects a protocolVersion that is not 4 or 5', () => {
  // The string is what JavaScript callers may pass.
  for (const value of [3, 6, 0, -1, 4.5, NaN, '5'] as unknown as Mqtt.ProtocolVersion[]) {
    assertThrows(
      () => validateClientOptions({ protocolVersion: value }, value),
      InvalidArgumentError,
      `protocolVersion must be 4 (MQTT 3.1.1) or 5 (MQTT 5.0) (got ${value})`,
      `${value}`,
    );
  }
});

/** Values that a Two Byte Integer cannot hold. The string is what JavaScript callers may pass. */
const notTwoByteIntegers = [65_536, 70_000, -1, 1.5, NaN, Infinity, -Infinity, '30' as unknown as number];

Deno.test('validateClientOptions accepts integers from 0 to 65535', () => {
  validateClientOptions(undefined, V5);
  validateClientOptions({}, V5);
  for (const value of [0, 1, 65_535]) {
    validateClientOptions({ keepAlive: value, topicAliasMaximumAboutSend: value, topicAliasMaximumAboutReceive: value }, V5);
    validateClientOptions({ keepAlive: value }, V3);
  }
});

Deno.test('validateClientOptions rejects a keepAlive that is not an integer from 0 to 65535', () => {
  for (const value of notTwoByteIntegers) {
    for (const protocolVersion of [V5, V3]) {
      assertThrows(
        () => validateClientOptions({ keepAlive: value }, protocolVersion),
        InvalidArgumentError,
        'keepAlive must be an integer from 0 to 65535',
        `${value} (${protocolVersion})`,
      );
    }
  }
});

Deno.test('validateClientOptions rejects topic alias maximums that are not integers from 0 to 65535 (MQTT 5.0)', () => {
  for (const value of notTwoByteIntegers) {
    assertThrows(
      () => validateClientOptions({ topicAliasMaximumAboutSend: value }, V5),
      InvalidArgumentError,
      'topicAliasMaximumAboutSend must be an integer from 0 to 65535',
      `${value}`,
    );
    assertThrows(
      () => validateClientOptions({ topicAliasMaximumAboutReceive: value }, V5),
      InvalidArgumentError,
      'topicAliasMaximumAboutReceive must be an integer from 0 to 65535',
      `${value}`,
    );
  }
});

Deno.test('validateClientOptions does not check the topic alias maximums in MQTT 3.1.1: they are not used', () => {
  validateClientOptions({ topicAliasMaximumAboutSend: -1, topicAliasMaximumAboutReceive: 70_000 }, V3);
});

Deno.test('validateClientOptions accepts a clientId and a username that are valid UTF-8 Encoded Strings', () => {
  // 'あ' x 21,845 is 65,535 bytes in UTF-8, the most.
  for (const value of ['', 'cid', '\u{FEFF}', '\u{1F600}', 'あ'.repeat(21_845)]) {
    for (const protocolVersion of [V5, V3]) {
      validateClientOptions({ clientId: value, username: value }, protocolVersion);
    }
  }
});

Deno.test('validateClientOptions rejects a clientId or a username that CONNECT cannot carry', () => {
  const cases: [unknown, string][] = [
    ['a\u0000', 'must not contain U+0000'],
    ['\u0000', 'must not contain U+0000'],
    ['a\uD800', 'must not contain a lone surrogate, which UTF-8 cannot encode (found at index 1)'],
    ['\uDC00', 'must not contain a lone surrogate, which UTF-8 cannot encode (found at index 0)'],
    ['a'.repeat(65_536), 'must be at most 65535 bytes long in UTF-8 (got 65536)'],
    ['あ'.repeat(21_846), 'must be at most 65535 bytes long in UTF-8 (got 65538)'],
    [1, 'must be a string'],
  ];
  for (const [value, message] of cases) {
    for (const name of ['clientId', 'username'] as const) {
      for (const protocolVersion of [V5, V3]) {
        assertThrows(
          () => validateClientOptions({ [name]: value as string }, protocolVersion),
          InvalidArgumentError,
          `${name} ${message}`,
          `${name}: ${JSON.stringify(value)?.slice(0, 20)}`,
        );
      }
    }
  }
});

Deno.test('validateClientOptions accepts a password that is valid Binary Data: a string may contain U+0000', () => {
  const values: (string | Uint8Array)[] = [
    '',
    'pass',
    'p\u0000w',
    '\u{FEFF}\u{1F600}',
    'a'.repeat(65_535),
    new Uint8Array(0),
    new Uint8Array([0xFF, 0x00, 0xED, 0xA0, 0x80]),
    new Uint8Array(65_535),
  ];
  for (const password of values) {
    validateClientOptions({ password }, V5);
    validateClientOptions({ password }, V3);
  }
});

Deno.test('validateClientOptions rejects a password that CONNECT cannot carry', () => {
  const cases: [unknown, string][] = [
    ['p\uD800', 'password must not contain a lone surrogate, which UTF-8 cannot encode (found at index 1)'],
    ['\uDC00', 'password must not contain a lone surrogate, which UTF-8 cannot encode (found at index 0)'],
    ['a'.repeat(65_536), 'password must be at most 65535 bytes long in UTF-8 (got 65536)'],
    [new Uint8Array(65_536), 'password must be at most 65535 bytes long (got 65536)'],
    [1234, 'password must be a string or a Uint8Array'],
    [[0x70], 'password must be a string or a Uint8Array'],
  ];
  for (const [value, message] of cases) {
    for (const protocolVersion of [V5, V3]) {
      assertThrows(() => validateClientOptions({ password: value as string }, protocolVersion), InvalidArgumentError, message, message);
    }
  }
});

Deno.test('validateClientOptions does not put the clientId, the username or the password in the message', () => {
  for (const options of [{ clientId: 'secret\u0000' }, { username: 'secret\uD800' }, { password: 'secret\uD800' }]) {
    const error = assertThrows(() => validateClientOptions(options, V5), InvalidArgumentError);
    assert(!error.message.includes('secret'), error.message);
  }
});

Deno.test('validateAuth accepts the Reason Codes of AUTH, and no Reason Code', () => {
  for (const reasonCode of [undefined, Mqtt.ReasonCode.Success, Mqtt.ReasonCode.ContinueAuthentication, Mqtt.ReasonCode.ReAuthenticate]) {
    validateAuth(reasonCode);
  }
});

Deno.test('validateAuth rejects the other Reason Codes, also the ones that the type Mqtt.ReasonCode has for other packets [MQTT-3.15.2-1]', () => {
  for (let reasonCode = 0; reasonCode <= 0xFF; reasonCode++) {
    if (reasonCode !== 0x00 && reasonCode !== 0x18 && reasonCode !== 0x19) {
      assertThrows(
        () => validateAuth(reasonCode),
        InvalidArgumentError,
        'reasonCode must be 0x00 (Success), 0x18 (Continue authentication) or 0x19',
        `${reasonCode}`,
      );
    }
  }
  for (const reasonCode of [0x118, -1, 24.5, NaN]) {
    assertThrows(() => validateAuth(reasonCode), InvalidArgumentError, `(got ${reasonCode})`, `${reasonCode}`);
  }
});

import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { ClientErrors, Mqtt, MqttPackets, MqttProperties } from '../../../deno/mod.ts';
import { InvalidQoSError, MqttUtilsError } from '../../../lib/mqtt_utils/mod.ts';
import { PacketTooLargeToReceiveError } from '../../../lib/mqtt_stream_utils/mod.ts';

// Creates an error of one class, passing `options` to its constructor.
type ErrorFactory = (options?: ErrorOptions) => Error;

// One factory for each error class that users can catch, by the name of its class.
const errors: Record<string, ErrorFactory> = {
  MqttClientError: (options) => new ClientErrors.MqttClientError('m', options),
  ConnectionClosed: (options) => new ClientErrors.ConnectionClosed(options),
  MalformedPacketError: (options) => new ClientErrors.MalformedPacketError('m', options),
  ConnectTimeout: (options) => new ClientErrors.ConnectTimeout(options),
  InvalidPacketBeforeConnackError: (options) => new ClientErrors.InvalidPacketBeforeConnackError(Mqtt.ReasonCode.MalformedPacket, options),
  StateIsNotOfflineError: (options) => new ClientErrors.StateIsNotOfflineError('m', options),
  StateIsNotOnlineError: (options) => new ClientErrors.StateIsNotOnlineError('m', options),
  SessionLostError: (options) => new ClientErrors.SessionLostError(options),
  SendPacketError: (options) => new ClientErrors.SendPacketError(options),
  InvalidTopicNameError: (options) => new ClientErrors.InvalidTopicNameError('m', options),
  InvalidTopicFilterError: (options) => new ClientErrors.InvalidTopicFilterError('m', options),
  InvalidPropertyError: (options) => new ClientErrors.InvalidPropertyError('m', options),
  InvalidArgumentError: (options) => new ClientErrors.InvalidArgumentError('m', options),
  PacketTooLargeError: (options) => new ClientErrors.PacketTooLargeError('m', options),
  NotSupportedByBrokerError: (options) => new ClientErrors.NotSupportedByBrokerError('m', options),
  QoSNotSupportedError: (options) => new ClientErrors.QoSNotSupportedError(2, 1, options),
  RetainNotSupportedError: (options) => new ClientErrors.RetainNotSupportedError(options),
  WildcardSubscriptionsNotSupportedError: (options) => new ClientErrors.WildcardSubscriptionsNotSupportedError('a/#', options),
  SubscriptionIdentifiersNotSupportedError: (options) => new ClientErrors.SubscriptionIdentifiersNotSupportedError(options),
  SharedSubscriptionsNotSupportedError: (options) => new ClientErrors.SharedSubscriptionsNotSupportedError('$share/g/a', options),
  UnexpectedUrlProtocol: (options) => new ClientErrors.UnexpectedUrlProtocol('m', options),
  MqttPacketParseError: (options) => new MqttPackets.MqttPacketsError.MqttPacketParseError('m', options),
  MqttPacketSerializeError: (options) => new MqttPackets.MqttPacketsError.MqttPacketSerializeError('m', options),
  UnsupportedPacketError: (options) => new MqttPackets.MqttPacketsError.UnsupportedPacketError('m', options),
  InvalidProtocolVersionError: (options) => new MqttPackets.MqttPacketsError.InvalidProtocolVersionError('m', options),
  UnsupportedPropertyError: (options) => new MqttProperties.UnsupportedPropertyError(0, options),
};

// The error classes that are not exported: users see them only as the `cause` of another error.
const internalErrors: Record<string, ErrorFactory> = {
  NumIsOutOfRange: (options) => new MqttUtilsError.NumIsOutOfRange(options),
  RemainingLengthError: (options) => new MqttUtilsError.RemainingLengthError('m', options),
  InvalidUtf8EncodedStringError: (options) => new MqttUtilsError.InvalidUtf8EncodedStringError('m', options),
  MalformedDataError: (options) => new MqttUtilsError.MalformedDataError('m', options),
  ProtocolViolationError: (options) => new MqttUtilsError.ProtocolViolationError('m', options),
  InvalidQoSError: (options) => new InvalidQoSError(3, options),
  PacketTooLargeToReceiveError: (options) => new PacketTooLargeToReceiveError(10, 5, options),
};

const allErrors = { ...errors, ...internalErrors };

Deno.test('every error class that users can catch is tested here', () => {
  const exported = [
    ...Object.keys(ClientErrors),
    ...Object.keys(MqttPackets.MqttPacketsError),
    ...Object.keys(MqttProperties).filter((key) => key.endsWith('Error')),
  ];
  assertEquals(exported.sort(), Object.keys(errors).sort());
});

Deno.test('every error class of the utilities is tested here', () => {
  assertEquals(Object.keys(MqttUtilsError).sort(), Object.keys(internalErrors).filter((key) => key in MqttUtilsError).sort());
});

Deno.test('an error has the name of its class, which logs and String() show', () => {
  for (const [className, create] of Object.entries(allErrors)) {
    const error = create();
    assertEquals(error.name, className);
    assertEquals(String(error), `${className}: ${error.message}`);
    assert(error.stack?.startsWith(`${className}: `), className);
  }
});

Deno.test('every error class of this library extends MqttClientError, so that one catch handles all of them', () => {
  for (const [className, create] of Object.entries(allErrors)) {
    const error = create();
    assert(error instanceof ClientErrors.MqttClientError, className);
    assert(error instanceof Error, className);
  }
});

Deno.test('an error has the error that caused it as cause, and no cause without one', () => {
  for (const [className, create] of Object.entries(allErrors)) {
    const cause = new Error('the underlying error');
    assertStrictEquals(create({ cause }).cause, cause, className);
    assert(!('cause' in create()), className);
  }
});

Deno.test('a subclass of NotSupportedByBrokerError is still one', () => {
  const error = new ClientErrors.QoSNotSupportedError(2, 1);
  assert(error instanceof ClientErrors.NotSupportedByBrokerError);
  assertEquals(error.maximumQoS, 1);
});

Deno.test('InvalidPacketBeforeConnackError has the reason the connection was closed for', () => {
  const error = new ClientErrors.InvalidPacketBeforeConnackError(Mqtt.ReasonCode.ProtocolError);
  assertEquals(error.reasonCode, Mqtt.ReasonCode.ProtocolError);
  assert(error.message.includes('0x82'), error.message);
});

Deno.test('the error classes stay apart as types', () => {
  // Checked by the type checker: an error of one class does not have the type of another, even with the same members.
  // @ts-expect-error another class
  const _closed: ClientErrors.ConnectionClosed = new ClientErrors.ConnectTimeout();
  // @ts-expect-error not about broker support
  const _notSupported: ClientErrors.NotSupportedByBrokerError = new ClientErrors.InvalidArgumentError('m');
  const _subclass: ClientErrors.NotSupportedByBrokerError = new ClientErrors.RetainNotSupportedError();
  // Every error class of this library has the type of the base class.
  const _base: ClientErrors.MqttClientError = new ClientErrors.ConnectTimeout();
  const _packets: ClientErrors.MqttClientError = new MqttPackets.MqttPacketsError.MqttPacketParseError('m');
  const _properties: ClientErrors.MqttClientError = new MqttProperties.UnsupportedPropertyError(0);
});

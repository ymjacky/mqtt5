import { assert, assertEquals } from '@std/assert';
import { ClientErrors, Mqtt, MqttPackets, MqttProperties } from '../../../deno/mod.ts';

// One instance of each error class that users can catch, by the name of its class.
const errors: Record<string, Error> = {
  ConnectionClosed: new ClientErrors.ConnectionClosed(),
  MalformedPacketError: new ClientErrors.MalformedPacketError('m'),
  ConnectTimeout: new ClientErrors.ConnectTimeout(),
  InvalidPacketBeforeConnackError: new ClientErrors.InvalidPacketBeforeConnackError(Mqtt.ReasonCode.MalformedPacket),
  StateIsNotOfflineError: new ClientErrors.StateIsNotOfflineError('m'),
  StateIsNotOnlineError: new ClientErrors.StateIsNotOnlineError('m'),
  SessionLostError: new ClientErrors.SessionLostError(),
  SendPacketError: new ClientErrors.SendPacketError(),
  InvalidTopicNameError: new ClientErrors.InvalidTopicNameError('m'),
  InvalidTopicFilterError: new ClientErrors.InvalidTopicFilterError('m'),
  InvalidPropertyError: new ClientErrors.InvalidPropertyError('m'),
  InvalidArgumentError: new ClientErrors.InvalidArgumentError('m'),
  PacketTooLargeError: new ClientErrors.PacketTooLargeError('m'),
  NotSupportedByBrokerError: new ClientErrors.NotSupportedByBrokerError('m'),
  QoSNotSupportedError: new ClientErrors.QoSNotSupportedError(2, 1),
  RetainNotSupportedError: new ClientErrors.RetainNotSupportedError(),
  WildcardSubscriptionsNotSupportedError: new ClientErrors.WildcardSubscriptionsNotSupportedError('a/#'),
  SubscriptionIdentifiersNotSupportedError: new ClientErrors.SubscriptionIdentifiersNotSupportedError(),
  SharedSubscriptionsNotSupportedError: new ClientErrors.SharedSubscriptionsNotSupportedError('$share/g/a'),
  UnexpectedUrlProtocol: new ClientErrors.UnexpectedUrlProtocol('m'),
  MqttPacketParseError: new MqttPackets.MqttPacketsError.MqttPacketParseError('m'),
  MqttPacketSerializeError: new MqttPackets.MqttPacketsError.MqttPacketSerializeError('m'),
  UnsupportedPacketError: new MqttPackets.MqttPacketsError.UnsupportedPacketError('m'),
  InvalidProtocolVersionError: new MqttPackets.MqttPacketsError.InvalidProtocolVersionError('m'),
  UnsupportedPropertyError: new MqttProperties.UnsupportedPropertyError(0),
};

Deno.test('every error class that users can catch is tested here', () => {
  const exported = [
    ...Object.keys(ClientErrors),
    ...Object.keys(MqttPackets.MqttPacketsError),
    ...Object.keys(MqttProperties).filter((key) => key.endsWith('Error')),
  ];
  assertEquals(exported.sort(), Object.keys(errors).sort());
});

Deno.test('an error has the name of its class, which logs and String() show', () => {
  for (const [className, error] of Object.entries(errors)) {
    assertEquals(error.name, className);
    assertEquals(String(error), `${className}: ${error.message}`);
    assert(error.stack?.startsWith(`${className}: `), className);
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
});

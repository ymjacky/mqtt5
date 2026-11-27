import { assertEquals, assertInstanceOf, assertStringIncludes, assertThrows } from '@std/assert';
import * as Mqtt from '../../../lib/mqtt/mod.ts';
import {
  type AnyPacket,
  type ConnackPacket,
  decode,
  MqttPacketsError,
  packetToBytes,
  type PublishPacket,
  type SubscribePacket,
} from '../../../lib/mqtt_packets/mod.ts';
import { InvalidPropertyValueError } from '../../../lib/mqtt_properties/mod.ts';

// The encoder checks the integer properties of every packet, also the ones that only a broker sends (CONNACK, PUBLISH with
// Subscription Identifiers). The checks of the client (validation.ts) come first for what it sends, but the encoder does
// not depend on them.

const V5 = Mqtt.ProtocolVersion.MqttV5;

const connack = { type: 'connack', sessionPresent: false, reasonCode: Mqtt.ReasonCode.Success } as const;
const publish = { type: 'publish', topic: 't', payload: new Uint8Array([0x70]), dup: false, retain: false, qos: 0 } as const;

/** Packets with a property value that cannot be encoded: a name, the packet, and the key of the property. */
const invalidPackets: [string, AnyPacket, string][] = [
  // A value that would be sent as it is, and that the receiver treats as a Protocol Error.
  ['CONNACK Maximum QoS of 2', { ...connack, properties: { maximumQoS: Mqtt.QoS.ExactlyOnce } }, 'maximumQoS'],
  ['PUBLISH Subscription Identifier of 0', { ...publish, properties: { subscriptionIdentifiers: [0] } }, 'subscriptionIdentifiers[0]'],
  ['PUBLISH Payload Format Indicator of 2', { ...publish, properties: { payloadFormatIndicator: 2 } }, 'payloadFormatIndicator'],
  // A value of 0 that would be left out, so that the receiver would see no limit.
  ['CONNACK Receive Maximum of 0', { ...connack, properties: { receiveMaximum: 0 } }, 'receiveMaximum'],
  ['CONNACK Maximum Packet Size of 0', { ...connack, properties: { maximumPacketSize: 0 } }, 'maximumPacketSize'],
  ['CONNECT Receive Maximum of 0', { type: 'connect', clientId: 'c', protocolVersion: V5, properties: { receiveMaximum: 0 } }, 'receiveMaximum'],
  // A value of 0 that would be left out, and that MQTT 5.0 does not allow.
  ['PUBLISH Topic Alias of 0', { ...publish, properties: { topicAlias: 0 } }, 'topicAlias'],
  [
    'SUBSCRIBE Subscription Identifier of 0',
    { type: 'subscribe', packetId: 1, subscriptions: [{ topicFilter: 'f', qos: Mqtt.QoS.AtMostOnce }], properties: { subscriptionIdentifier: 0 } },
    'subscriptionIdentifier',
  ],
  // A value that does not fit the type, which would be sent as another value.
  ['CONNACK Topic Alias Maximum of 70,000', { ...connack, properties: { topicAliasMaximum: 70_000 } }, 'topicAliasMaximum'],
  ['CONNACK Server Keep Alive of -1', { ...connack, properties: { serverKeepAlive: -1 } }, 'serverKeepAlive'],
  ['CONNACK Session Expiry Interval of 1.5', { ...connack, properties: { sessionExpiryInterval: 1.5 } }, 'sessionExpiryInterval'],
  ['PUBLISH Message Expiry Interval of -1', { ...publish, properties: { messageExpiryInterval: -1 } }, 'messageExpiryInterval'],
  [
    'CONNECT Will Delay Interval of NaN',
    { type: 'connect', clientId: 'c', protocolVersion: V5, will: { topic: 'w', properties: { willDelayInterval: NaN } } },
    'willDelayInterval',
  ],
  ['DISCONNECT Session Expiry Interval of -1', { type: 'disconnect', reasonCode: 0x00, properties: { sessionExpiryInterval: -1 } }, 'sessionExpiryInterval'],
];

Deno.test('packetToBytes throws for a property value that cannot be encoded, with the property in the message of its cause', () => {
  for (const [name, packet, key] of invalidPackets) {
    const error = assertThrows(() => packetToBytes(packet, V5), MqttPacketsError.MqttPacketSerializeError, undefined, name);
    assertInstanceOf(error.cause, InvalidPropertyValueError, name);
    assertStringIncludes(error.cause.message, `${key} (0x`, name);
  }
});

Deno.test('packetToBytes encodes the valid values closest to the invalid ones, and the receiver reads them as they are', () => {
  const packets: (ConnackPacket | PublishPacket | SubscribePacket)[] = [
    { ...connack, properties: { maximumQoS: Mqtt.QoS.AtLeastOnce, receiveMaximum: 1, maximumPacketSize: 1, topicAliasMaximum: 65_535, serverKeepAlive: 0 } },
    { ...publish, properties: { subscriptionIdentifiers: [1, 268_435_455], payloadFormatIndicator: 1, topicAlias: 1, messageExpiryInterval: 0 } },
    {
      type: 'subscribe',
      packetId: 1,
      subscriptions: [{ topicFilter: 'f', qos: Mqtt.QoS.AtMostOnce }],
      properties: { subscriptionIdentifier: 1 },
    },
  ];
  for (const packet of packets) {
    const decoded = decode(packetToBytes(packet, V5), V5);
    assertEquals(decoded.type, packet.type);
    assertEquals((decoded as typeof packet).properties, packet.properties, packet.type);
  }
});

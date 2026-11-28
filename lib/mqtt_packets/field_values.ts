/**
 * Checks of the fields of a packet to encode, other than the properties (`MqttProperties.propertiesToBytes()` checks those).
 * Without them, a value that does not fit its field would be sent as another value (e.g. a Reason Code of 256 as 0x00, a
 * packet ID of -1 as 65,535), and a value that MQTT does not allow (e.g. a packet ID of 0 in PUBLISH, a QoS of 3) would make
 * the packet a Malformed Packet or a Protocol Error for the receiver. The protocol version that a packet is encoded or decoded
 * for is checked here too.
 * @module
 */

import * as Mqtt from '../mqtt/mod.ts';
import { maxTwoByteInteger } from '../mqtt_utils/mod.ts';
import { InvalidFieldValueError, InvalidProtocolVersionError } from './error.ts';

/**
 * Checks an integer field, and returns it.
 * @param packet the packet type, used in the error message, e.g. `PUBACK`.
 * @param name the key of the field, used in the error message, e.g. `packetId` or `subscriptions[0].qos`.
 * @param min the smallest value that the field may have.
 * @param max the largest value that the field may have.
 * @throws {InvalidFieldValueError} if the value is not an integer from `min` to `max`.
 */
export function integerValue(packet: string, name: string, value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new InvalidFieldValueError(`${packet} ${name} must be an integer from ${min} to ${max} (got ${value})`);
  }
  return value;
}

/**
 * Checks a protocol version, and returns it. This library supports 4 (MQTT 3.1.1) and 5 (MQTT 5.0). Another value would be
 * taken as one of them (the packets of 3 as MQTT 3.1.1, the packets of 6 as MQTT 5.0), and a CONNECT would carry it as its
 * Protocol Level, which the receiver refuses.
 * @param name what the value is, used in the error message, e.g. `CONNECT protocolVersion`.
 * @throws {InvalidProtocolVersionError} if the value is not 4 or 5.
 */
export function protocolVersionValue(name: string, value: number): Mqtt.ProtocolVersion {
  if (value !== Mqtt.ProtocolVersion.MqttV3_1_1 && value !== Mqtt.ProtocolVersion.MqttV5) {
    throw new InvalidProtocolVersionError(`${name} must be 4 (MQTT 3.1.1) or 5 (MQTT 5.0) (got ${value})`);
  }
  return value;
}

/**
 * Checks the packet ID of a packet that is given a new one: PUBLISH (QoS 1 and 2), SUBSCRIBE and UNSUBSCRIBE. It must not be 0
 * ([MQTT-2.2.1-3], [MQTT-2.2.1-4]; MQTT 3.1.1 [MQTT-2.3.1-1]). Returns it.
 * @throws {InvalidFieldValueError} if the packet ID is not an integer from 1 to 65,535.
 */
export function packetIdValue(packet: string, value: number): number {
  return integerValue(packet, 'packetId', value, 1, maxTwoByteInteger);
}

/**
 * Checks the packet ID of PUBACK, PUBREC, PUBREL, PUBCOMP, SUBACK or UNSUBACK, and returns it. They carry the packet ID of the
 * packet that they answer ([MQTT-2.2.1-5], [MQTT-2.2.1-6]; MQTT 3.1.1 [MQTT-2.3.1-6], [MQTT-2.3.1-7]), which the encoder does
 * not know, so 0 is written too: a peer that sent a packet ID of 0 gets it back.
 * @throws {InvalidFieldValueError} if the packet ID is not an integer from 0 to 65,535.
 */
export function answerPacketIdValue(packet: string, value: number): number {
  return integerValue(packet, 'packetId', value, 0, maxTwoByteInteger);
}

/**
 * Checks a QoS or a Retain Handling, and returns it. A QoS of 3 is a Malformed Packet in PUBLISH ([MQTT-3.3.1-4]) and in the
 * Will of CONNECT ([MQTT-3.1.2-12]), and a Protocol Error in the subscription options of SUBSCRIBE, like a Retain Handling of 3
 * (MQTT 5.0 3.8.3.1; MQTT 3.1.1 [MQTT-3-8.3-4]).
 * @throws {InvalidFieldValueError} if the value is not 0, 1 or 2.
 */
export function zeroToTwoValue(packet: string, name: string, value: number): number {
  return integerValue(packet, name, value, 0, 2);
}

/**
 * Checks a Reason Code (MQTT 5.0) or a return code (MQTT 3.1.1), and returns it. The sender must use one of the codes of the
 * packet type, e.g. [MQTT-3.4.2-1] for PUBACK.
 * @param codes the codes that the packet type may carry, e.g. {@link pubackReasonCodes}.
 * @throws {InvalidFieldValueError} if the code is not one of `codes`.
 */
export function reasonCodeValue(packet: string, name: string, value: number, codes: ReadonlySet<number>): number {
  if (!codes.has(value)) {
    const list = [...codes].map((code) => `0x${code.toString(16).toUpperCase().padStart(2, '0')}`).join(', ');
    throw new InvalidFieldValueError(`${packet} ${name} must be one of ${list} (got ${value})`);
  }
  return value;
}

/** The Reason Codes of CONNACK (MQTT 5.0 3.2.2.2, [MQTT-3.2.2-8]). */
export const connackReasonCodes: ReadonlySet<number> = new Set<number>([
  Mqtt.ReasonCode.Success,
  Mqtt.ReasonCode.UnspecifiedError,
  Mqtt.ReasonCode.MalformedPacket,
  Mqtt.ReasonCode.ProtocolError,
  Mqtt.ReasonCode.ImplementationSpecificError,
  Mqtt.ReasonCode.UnsupportedProtocolVersion,
  Mqtt.ReasonCode.ClientIdentifierNotValid,
  Mqtt.ReasonCode.BadUserNameOrPassword,
  Mqtt.ReasonCode.NotAuthorized,
  Mqtt.ReasonCode.ServerUnavailable,
  Mqtt.ReasonCode.ServerBusy,
  Mqtt.ReasonCode.Banned,
  Mqtt.ReasonCode.BadAuthenticationMethod,
  Mqtt.ReasonCode.TopicNameInvalid,
  Mqtt.ReasonCode.PacketTooLarge,
  Mqtt.ReasonCode.QuotaExceeded,
  Mqtt.ReasonCode.PayloadFormatInvalid,
  Mqtt.ReasonCode.RetainNotSupported,
  Mqtt.ReasonCode.QoSNotSupported,
  Mqtt.ReasonCode.UseAnotherServer,
  Mqtt.ReasonCode.ServerMoved,
  Mqtt.ReasonCode.ConnectionRateExceeded,
]);

/** The Reason Codes of PUBACK (MQTT 5.0 3.4.2.1, [MQTT-3.4.2-1]) and PUBREC (3.5.2.1, [MQTT-3.5.2-1]), which are the same. */
export const pubackReasonCodes: ReadonlySet<number> = new Set<number>([
  Mqtt.ReasonCode.Success,
  Mqtt.ReasonCode.NoMatchingSubscribers,
  Mqtt.ReasonCode.UnspecifiedError,
  Mqtt.ReasonCode.ImplementationSpecificError,
  Mqtt.ReasonCode.NotAuthorized,
  Mqtt.ReasonCode.TopicNameInvalid,
  Mqtt.ReasonCode.PacketIdentifierInUse,
  Mqtt.ReasonCode.QuotaExceeded,
  Mqtt.ReasonCode.PayloadFormatInvalid,
]);

/** The Reason Codes of PUBREL (MQTT 5.0 3.6.2.1, [MQTT-3.6.2-1]) and PUBCOMP (3.7.2.1, [MQTT-3.7.2-1]), which are the same. */
export const pubrelReasonCodes: ReadonlySet<number> = new Set<number>([
  Mqtt.ReasonCode.Success,
  Mqtt.ReasonCode.PacketIdentifierNotFound,
]);

/** The Reason Codes of SUBACK (MQTT 5.0 3.9.3, [MQTT-3.9.3-2]). */
export const subackReasonCodes: ReadonlySet<number> = new Set<number>([
  Mqtt.ReasonCode.GrantedQoS0,
  Mqtt.ReasonCode.GrantedQoS1,
  Mqtt.ReasonCode.GrantedQoS2,
  Mqtt.ReasonCode.UnspecifiedError,
  Mqtt.ReasonCode.ImplementationSpecificError,
  Mqtt.ReasonCode.NotAuthorized,
  Mqtt.ReasonCode.TopicFilterInvalid,
  Mqtt.ReasonCode.PacketIdentifierInUse,
  Mqtt.ReasonCode.QuotaExceeded,
  Mqtt.ReasonCode.SharedSubscriptionsNotSupported,
  Mqtt.ReasonCode.SubscriptionIdentifiersNotSupported,
  Mqtt.ReasonCode.WildcardSubscriptionsNotSupported,
]);

/** The Reason Codes of UNSUBACK (MQTT 5.0 3.11.3, [MQTT-3.11.3-2]). */
export const unsubackReasonCodes: ReadonlySet<number> = new Set<number>([
  Mqtt.ReasonCode.Success,
  Mqtt.ReasonCode.NoSubscriptionExisted,
  Mqtt.ReasonCode.UnspecifiedError,
  Mqtt.ReasonCode.ImplementationSpecificError,
  Mqtt.ReasonCode.NotAuthorized,
  Mqtt.ReasonCode.TopicFilterInvalid,
  Mqtt.ReasonCode.PacketIdentifierInUse,
]);

/**
 * The Reason Codes of DISCONNECT (MQTT 5.0 3.14.2.1, [MQTT-3.14.2-1]). 0x8C (Bad authentication method) is not in that table,
 * but the table of all Reason Codes (2.4) gives it for CONNACK and DISCONNECT, so it is accepted.
 */
export const disconnectReasonCodes: ReadonlySet<number> = new Set<number>([
  Mqtt.ReasonCode.NormalDisconnection,
  Mqtt.ReasonCode.DisconnectWithWillMessage,
  Mqtt.ReasonCode.UnspecifiedError,
  Mqtt.ReasonCode.MalformedPacket,
  Mqtt.ReasonCode.ProtocolError,
  Mqtt.ReasonCode.ImplementationSpecificError,
  Mqtt.ReasonCode.NotAuthorized,
  Mqtt.ReasonCode.ServerBusy,
  Mqtt.ReasonCode.ServerShuttingDown,
  Mqtt.ReasonCode.BadAuthenticationMethod,
  Mqtt.ReasonCode.KeepAliveTimeout,
  Mqtt.ReasonCode.SessionTakenOver,
  Mqtt.ReasonCode.TopicFilterInvalid,
  Mqtt.ReasonCode.TopicNameInvalid,
  Mqtt.ReasonCode.ReceiveMaximumExceeded,
  Mqtt.ReasonCode.TopicAliasInvalid,
  Mqtt.ReasonCode.PacketTooLarge,
  Mqtt.ReasonCode.MessageRateTooHigh,
  Mqtt.ReasonCode.QuotaExceeded,
  Mqtt.ReasonCode.AdministrativeAction,
  Mqtt.ReasonCode.PayloadFormatInvalid,
  Mqtt.ReasonCode.RetainNotSupported,
  Mqtt.ReasonCode.QoSNotSupported,
  Mqtt.ReasonCode.UseAnotherServer,
  Mqtt.ReasonCode.ServerMoved,
  Mqtt.ReasonCode.SharedSubscriptionsNotSupported,
  Mqtt.ReasonCode.ConnectionRateExceeded,
  Mqtt.ReasonCode.MaximumConnectTime,
  Mqtt.ReasonCode.SubscriptionIdentifiersNotSupported,
  Mqtt.ReasonCode.WildcardSubscriptionsNotSupported,
]);

/** The Reason Codes of AUTH (MQTT 5.0 3.15.2.1, [MQTT-3.15.2-1]). */
export const authReasonCodes: ReadonlySet<number> = new Set<number>([
  Mqtt.ReasonCode.Success,
  Mqtt.ReasonCode.ContinueAuthentication,
  Mqtt.ReasonCode.ReAuthenticate,
]);

/** The return codes of CONNACK in MQTT 3.1.1 (3.2.2.3): 6 to 255 are reserved. */
export const v3_1_1ConnackReturnCodes: ReadonlySet<number> = new Set<number>(Object.values(Mqtt.V3_1_1_ConnectReturnCode));

/** The return codes of SUBACK in MQTT 3.1.1 (3.9.3): the others are reserved and must not be used [MQTT-3.9.3-2]. */
export const v3_1_1SubackReturnCodes: ReadonlySet<number> = new Set<number>(Object.values(Mqtt.V3_1_1_SubscribeReturnCode));

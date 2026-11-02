/**
 * This module contains constant definitions for the MQTT protocol
 * @module
 */

/** Quality of Service levels of PUBLISH. */
export const QoS = {
  AT_MOST_ONCE: 0,
  AT_LEAST_ONCE: 1,
  EXACTLY_ONCE: 2,
  /** @deprecated Use {@link QoS.EXACTLY_ONCE} instead. */
  EXACTRY_ONCE: 2,
} as const;
/** A value of {@link QoS}. */
export type QoS = typeof QoS[keyof typeof QoS];

/** MQTT protocol versions supported by the client. */
export const ProtocolVersion = {
  MQTT_V3_1_1: 4,
  MQTT_V5: 5,
} as const;
/** A value of {@link ProtocolVersion}. */
export type ProtocolVersion = typeof ProtocolVersion[keyof typeof ProtocolVersion];

/** MQTT 5.0 reason codes. The comments list the packets that use each code. */
export const ReasonCode = {
  Success: 0, // CONNACK, PUBACK, PUBREC, PUBREL, PUBCOMP, UNSUBACK, AUTH
  NormalDisconnection: 0, // DISCONNECT
  GrantedQoS0: 0, // SUBACK
  GrantedQoS1: 1, // SUBACK
  GrantedQoS2: 2, // SUBACK
  DisconnectWithWillMessage: 4, // DISCONNECT
  NoMatchingSubscribers: 16, // PUBACK, PUBREC
  NoSubscriptionExisted: 17, // UNSUBACK
  ContinueAuthentication: 24, // AUTH
  ReAuthenticate: 25, // AUTH
  UnspecifiedError: 128, // CONNACK, PUBACK, PUBREC, SUBACK, UNSUBACK, DISCONNECT
  MalformedPacket: 129, // CONNACK, DISCONNECT
  ProtocolError: 130, // CONNACK, DISCONNECT
  ImplementationSpecificError: 131, // CONNACK, PUBACK, PUBREC, SUBACK, UNSUBACK, DISCONNECT
  UnsupportedProtocolVersion: 132, // CONNACK
  ClientIdentifierNotValid: 133, // CONNACK
  BadUserNameOrPassword: 134, // CONNACK
  NotAuthorized: 135, // CONNACK, PUBACK, PUBREC, SUBACK, UNSUBACK, DISCONNECT
  ServerUnavailable: 136, // CONNACK
  ServerBusy: 137, // CONNACK, DISCONNECT
  Banned: 138, // CONNACK
  ServerShuttingDown: 139, // DISCONNECT
  BadAuthenticationMethod: 140, // CONNACK, DISCONNECT
  KeepAliveTimeout: 141, // DISCONNECT
  SessionTakenOver: 142, // DISCONNECT
  TopicFilterInvalid: 143, // SUBACK, UNSUBACK, DISCONNECT
  TopicNameInvalid: 144, // CONNACK, PUBACK, PUBREC, DISCONNECT
  PacketIdentifierInUse: 145, // PUBACK, PUBREC, SUBACK, UNSUBACK
  PacketIdentifierNotFound: 146, // PUBREL, PUBCOMP
  ReceiveMaximumExceeded: 147, // DISCONNECT
  TopicAliasInvalid: 148, // DISCONNECT
  PacketTooLarge: 149, // CONNACK, DISCONNECT
  MessageRateTooHigh: 150, // DISCONNECT
  QuotaExceeded: 151, // CONNACK, PUBACK, PUBREC, SUBACK, DISCONNECT
  AdministrativeAction: 152, // DISCONNECT
  PayloadFormatInvalid: 153, // CONNACK, PUBACK, PUBREC, DISCONNECT
  RetainNotSupported: 154, // CONNACK, DISCONNECT
  QoSNotSupported: 155, // CONNACK, DISCONNECT
  UseAnotherServer: 156, // CONNACK, DISCONNECT
  ServerMoved: 157, // CONNACK, DISCONNECT
  SharedSubscriptionsNotSupported: 158, // SUBACK, DISCONNECT
  ConnectionRateExceeded: 159, // CONNACK, DISCONNECT
  MaximumConnectTime: 160, // DISCONNECT
  SubscriptionIdentifiersNotSupported: 161, // SUBACK, DISCONNECT
  WildcardSubscriptionsNotSupported: 162, // SUBACK, DISCONNECT
} as const;
/** A value of {@link ReasonCode}. */
export type ReasonCode = typeof ReasonCode[keyof typeof ReasonCode];

/** MQTT 3.1.1 CONNACK return codes. */
export const V3_1_1_ConnectReturnCode = {
  ConnectionAccepted: 0,
  UnacceptableProtocolVersion: 1,
  IdentifierRejected: 2,
  ServerUnavailable: 3,
  BadUserNameOrPassword: 4,
  NotAuthorized: 5,
} as const;
/** A value of {@link V3_1_1_ConnectReturnCode}. */
export type V3_1_1_ConnectReturnCode = typeof V3_1_1_ConnectReturnCode[keyof typeof V3_1_1_ConnectReturnCode];

/** MQTT 3.1.1 SUBACK return codes. */
export const V3_1_1_SubscribeReturnCode = {
  Success_MaximumQoS0: 0,
  Success_MaximumQoS1: 1,
  Success_MaximumQoS2: 2,
  Failure: 128,
} as const;
/** A value of {@link V3_1_1_SubscribeReturnCode}. */
export type V3_1_1_SubscribeReturnCode = typeof V3_1_1_SubscribeReturnCode[keyof typeof V3_1_1_SubscribeReturnCode];

/** MQTT control packet types, the upper 4 bits of the fixed header. */
export const PacketType = {
  CONNECT: 0x1,
  CONNACK: 0x2,
  PUBLISH: 0x3,
  PUBACK: 0x4,
  PUBREC: 0x5,
  PUBREL: 0x6,
  PUBCOMP: 0x7,
  SUBSCRIBE: 0x8,
  SUBACK: 0x9,
  UNSUBSCRIBE: 0xA,
  UNSUBACK: 0xB,
  PINGREQ: 0xC,
  PINGRESP: 0xD,
  DISCONNECT: 0xE,
  AUTH: 0xF,
};

/** Fixed header flags of each packet type, the lower 4 bits of the fixed header. */
export const fixedHeaderFlag = {
  CONNECT: 0b0000,
  CONNACK: 0b0000,
  PUBACK: 0b0000,
  PUBREC: 0b0000,
  PUBREL: 0b0010,
  PUBCOMP: 0b0000,
  SUBSCRIBE: 0b0010,
  SUBACK: 0b0000,
  UNSUBSCRIBE: 0b0010,
  UNSUBACK: 0b0000,
  PINGREQ: 0b0000,
  PINGRESP: 0b0000,
  DISCONNECT: 0b0000,
  AUTH: 0b0000,
};

/** @deprecated Use {@link fixedHeaderFlag} instead. */
export const fixexHeaderFlag: typeof fixedHeaderFlag = fixedHeaderFlag;

/** Retain Handling subscription option: whether retained messages are sent when subscribing. */
export const RetainHandling = {
  AtTheTimeOfTheSubscribe: 0,
  AtSubscribeOnlyIfTheSubscriptionDoesNotCurrentlyExist: 1,
  DoNotSend: 2,
} as const;
/** A value of {@link RetainHandling}. */
export type RetainHandling = typeof RetainHandling[keyof typeof RetainHandling];

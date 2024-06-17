import * as Mqtt from '../mqtt/mod.ts';

export type PingreqPacket = {
  type: 'pingreq';
};

export function toBytes(_packet: PingreqPacket) {
  const fixedHeader = [
    (Mqtt.PacketType.PINGREQ << 4) + Mqtt.fixexHeaderFlag.PINGREQ,
    0, // remainingLength 0
  ];

  return Uint8Array.from([...fixedHeader]);
}

export function parse(
  remainingLength: number,
): PingreqPacket {
  if (remainingLength > 0) {
    throw Error('malformed length');
  }

  return {
    type: 'pingreq',
  };
}

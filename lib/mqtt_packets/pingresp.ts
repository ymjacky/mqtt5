import * as Mqtt from '../mqtt/mod.ts';

export type PingrespPacket = {
  type: 'pingresp';
};

export function toBytes(_packet: PingrespPacket) {
  const fixedHeader = [
    (Mqtt.PacketType.PINGRESP << 4) + Mqtt.fixexHeaderFlag.PINGRESP,
    0, // remainingLength 0
  ];

  return Uint8Array.from([...fixedHeader]);
}

export function parse(
  remainingLength: number,
): PingrespPacket {
  if (remainingLength > 0) {
    throw Error('malformed length');
  }
  return {
    type: 'pingresp',
  };
}

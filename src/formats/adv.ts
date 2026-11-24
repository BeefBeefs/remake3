/**
 * NightStone .adv adventure container (see docs/FORMATS.md "Adventures"). The file is a gzip stream; this parses the
 * *decompressed* bytes (use gunzip() from ./map.ts). Offsets are those of Adv/Test.adv, the only sample available;
 * a multi-mission adventure probably repeats the mission records (unverified).
 */
export interface HeroDef { name: string; class: string; strength: number; skill: number; resistance: number; magic: number }
export interface Adventure {
  intro: string;
  final: string;
  missionName: string;
  heroes: HeroDef[];
  /** file name of the embedded mission, e.g. "Lost Forrest.map" */
  mapFile: string;
  /** offset of the embedded .map gzip member inside the decompressed body */
  mapOffset: number;
}

const HERO_CLASSES = ['Barbarian', 'Amazon', 'Sorceress'];
const cstr = (b: Uint8Array) => {
  const z = b.indexOf(0);
  return new TextDecoder('latin1').decode(z < 0 ? b : b.subarray(0, z)).replace(/\r\n/g, '\n');
};

export function parseAdv(d: Uint8Array): Adventure {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const names = [0x6e7, 0x7e6, 0x8e5].map((o) => cstr(d.subarray(o, o + 0xff)));
  const heroes = HERO_CLASSES.map((cls, i): HeroDef => {
    const o = 0x9e4 + 16 * i;
    return { name: names[i]!, class: cls, strength: dv.getUint32(o, true), skill: dv.getUint32(o + 4, true), resistance: dv.getUint32(o + 8, true), magic: dv.getUint32(o + 12, true) };
  });
  let mapOffset = -1;
  for (let i = 0x727e; i < d.length - 2; i++) if (d[i] === 0x1f && d[i + 1] === 0x8b && d[i + 2] === 8) { mapOffset = i; break; }
  return {
    intro: cstr(d.subarray(0, 0x5dc)),
    final: cstr(d.subarray(0xa14, 0xff0)),
    missionName: cstr(d.subarray(0x5dc, 0x6e7)),
    heroes,
    mapFile: cstr(d.subarray(0x727e, 0x727e + 255)),
    mapOffset,
  };
}

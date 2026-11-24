#!/usr/bin/env python3
"""NightStone .adv adventure container reader.  python3 -I tools/adv.py <file.adv> [out_dir]

The file is a gzip stream written by the Delphi "Adventure Creator". Decompressed layout of Adv/Test.adv (132,799 B):

  0x00000  intro text, NUL padded                    (up to 0x5dc; Test.adv: "Enter the text that the player will read…")
  0x005dc  mission name "Lost Forest"                 255-byte fields at 0xff stride: 0x5dc mission, 0x6e7/0x7e6/0x8e5 hero names
  0x009e4  12 x u32  default attributes of the 3 heroes: strength, skill (dexterity), resistance, magic
                     Barbarian 32 24 30 11 | Amazon 22 28 22 14 | Sorceress 19 23 21 30
  0x00a14  final text, NUL padded
  0x00ff0  background-image names ("25.BMP"), then raw 24-bit images (hero portraits / backgrounds)
  0x0727e  mission file name "Lost Forrest.map" (255 B field + 8 B), then the .map as a gzip stream
  ...      mission description text (the .dsc) after the map

Only what Test.adv contains is verified. A multi-mission adventure would repeat the name/map records (unverified).
"""
import gzip
import json
import os
import struct
import sys
import zlib

HERO_NAMES = ['Barbarian', 'Amazon', 'Sorceress']
ATTRS = ['strength', 'skill', 'resistance', 'magic']


def cstr(b):
    return b.split(b'\0', 1)[0].decode('latin1')


def read_adv(path):
    d = gzip.decompress(open(path, 'rb').read())
    out = {'intro': cstr(d[0:0x5dc]).replace('\r\n', '\n'), 'final': cstr(d[0xa14:0xff0]).replace('\r\n', '\n')}
    out['mission_name'] = cstr(d[0x5dc:0x6e7])
    names = [cstr(d[o:o + 0xff]) for o in (0x6e7, 0x7e6, 0x8e5)]
    vals = struct.unpack_from('<12I', d, 0x9e4)
    out['heroes'] = [{'name': names[i], 'class': HERO_NAMES[i], **dict(zip(ATTRS, vals[4 * i:4 * i + 4]))} for i in range(3)]
    mp = d.find(b'\x1f\x8b\x08', 0x727e)
    out['map_file'] = cstr(d[0x727e:0x727e + 255])
    z = zlib.decompressobj(wbits=31)  # gzip member; what follows is the mission description text
    body = z.decompress(d[mp:])
    out['map_body_size'] = len(body)
    out['mission_text'] = cstr(z.unused_data).replace('\r\n', '\n')
    return out, body, d


if __name__ == '__main__':
    out, body, raw = read_adv(sys.argv[1])
    print(json.dumps(out, indent=1))
    if len(sys.argv) > 2:
        os.makedirs(sys.argv[2], exist_ok=True)
        json.dump(out, open(os.path.join(sys.argv[2], 'adventure.json'), 'w'), indent=1)

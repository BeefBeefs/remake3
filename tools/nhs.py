"""NHS archive reader (AData.Nhs, WData.Nhs, NightStone.NHS).

layout:  256 x 64-byte NUL-padded file names (entry 0 is always empty) | u32 offset[256] | u32 size[256] | data
Offsets are absolute file offsets; file contents are stored as bitwise NOT of the plain bytes when the archive was
written by the game's tool (text INI files); other archives may hold plain data - `plain` tells which was detected.
"""
import re
import struct

NAME = re.compile(rb'^[\w\-. ()]+$')


def read_nhs(path):
    d = open(path, 'rb').read()
    entries = []
    off = struct.unpack_from('<256I', d, 64 * 256)
    size = struct.unpack_from('<256I', d, 64 * 256 + 1024)
    for i in range(256):
        raw = d[i * 64:(i + 1) * 64].rstrip(b'\0')
        if not raw:
            continue
        if not NAME.match(raw):
            raise ValueError(f'{path}: bad name at entry {i}: {raw[:20]!r}')
        o, s = off[i], size[i]
        if o + s > len(d):
            raise ValueError(f'{path}: entry {raw!r} runs past EOF')
        blob = d[o:o + s]
        printable = sum(1 for b in blob[:200] if 32 <= b < 127 or b in (9, 10, 13))
        plain = printable > 0.9 * min(len(blob), 200)
        entries.append((raw.decode('latin1'), blob if plain else bytes(b ^ 0xFF for b in blob), plain))
    return entries


if __name__ == '__main__':
    import sys
    for p in sys.argv[1:]:
        try:
            e = read_nhs(p)
        except ValueError as ex:
            print(p, 'ERR', ex); continue
        print(p, len(e), 'files', sum(len(b) for _, b, _ in e), 'bytes; plain:', sum(1 for *_, pl in e if pl))
        print('  ', [n for n, _, _ in e[:8]])

"""Extract the game files from NST's Install-NST.exe ("Collection Chamber" custom installer).

Layout (reverse-engineered):
  PE overlay @ 0x49000: magic 'wwgT)H5' 0x14 0x01 0x00, then records:
      u32 csize (incl. method byte), u32 usize, u8 method (1=zlib, 2=bzip2), data
  rec6 = file table, rec7 = [zlib uninstall strings][per-file zlib blocks (method byte + stream)]
  file entry: 6B flags, u32 off, u32 csize, u32 0, u32 usize, u32 crc32, 14B misc,
              u32 index, 3x FILETIME, name\0, 8 zero bytes
"""
import struct, zlib, bz2, sys, os
src, out = sys.argv[1], sys.argv[2]
d = open(src,'rb').read()
BASE = 299008
pos = BASE + 10
recs = []
while pos < len(d) - 9:
    cs, us = struct.unpack_from('<II', d, pos)
    m = d[pos+8]
    recs.append((m, d[pos+9:pos+8+cs], us))
    pos += 8 + cs
table = (zlib.decompress(recs[6][1]) if recs[6][0]==1 else bz2.decompress(recs[6][1]))
r7 = recs[7][1]
# rec7 offsets are relative to the start of the record data *including* method byte
r7full = bytes([recs[7][0]]) + r7
i = table.index(b'DDraw.dll') - (6+20+14+4+24)
files = []
exp = struct.unpack_from('<I', table, i+6)[0]      # first block offset (= size of the uninstall-string zlib prefix)
while i < len(table) - 60:
    off, cs, z, us, crc = struct.unpack_from('<IIIII', table, i+6)
    if off == exp and z == 0 and table[i+1:i+6] == b'\0'*5 and cs >= 1:
        j = i+6+20+14+4+24
        k = table.index(b'\0', j)
        name = table[j:k].decode('latin-1')
        files.append((name, off, cs, us, crc, table[i]))
        exp = off + cs
        i = k + 1
    else:
        i += 1
n = 0; bad = 0; total = 0
print('entries', len(files))
for name, off, cs, us, crc, fl in files:
    blob = r7full[off:off+cs]
    assert blob[0] in (1, 2), (name, blob[0])
    raw = b'' if len(blob) == 1 else (zlib.decompress(blob[1:]) if blob[0] == 1 else bz2.decompress(blob[1:]))
    if len(raw) != us:
        bad += 1; print('SIZE MISMATCH', name, len(raw), us)
    p = os.path.join(out, name.replace('\\', '/'))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'wb').write(raw); total += len(raw)
print('written', len(files), 'bad', bad, 'bytes', total, 'final offset', files[-1][1]+files[-1][2], 'of', len(r7full))

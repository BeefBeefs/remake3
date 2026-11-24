"""NightStone .P16 sprite pack decoder (layout taken from the Nightstone.exe loader at 0x40aa50; see docs/FORMATS.md)."""
import struct
import numpy as np

KEY = 0xF81F


class P16:
    def __init__(self, path):
        d = open(path, 'rb').read()
        # Tables hold entries 1..1023 (entry 0 is not stored).
        self.w = np.frombuffer(d, '<u2', 1023, 0x000).astype(int)
        self.h = np.frombuffer(d, '<u2', 1023, 0x7fe).astype(int)
        self.off = np.frombuffer(d, '<u4', 1023, 0xffc).astype(np.int64)
        self.x = np.frombuffer(d, '<i2', 1023, 0x1ff8).astype(int)   # hotspot offset of the bitmap's left edge
        self.y = np.frombuffer(d, '<i2', 1023, 0x27f6).astype(int)   # hotspot offset of the bitmap's top edge
        n = struct.unpack_from('<I', d, 0x2ff4)[0]
        if 0x2ff8 + 2 * n != len(d):
            raise ValueError(f'{path}: size mismatch {0x2ff8 + 2 * n} != {len(d)}')
        self.data = np.frombuffer(d, '<u2', n, 0x2ff8)

    def ids(self):
        return [i + 1 for i in range(1023) if self.w[i] and self.h[i]]

    def frame(self, fid):
        """-> (h, w) uint16 RGB565 array (0xF81F = transparent); raises ValueError on a malformed stream."""
        i = fid - 1
        w, h, pos, D = int(self.w[i]), int(self.h[i]), int(self.off[i]), self.data
        out = np.full((h, w), KEY, np.uint16)
        for yy in range(h):
            xx = 0
            while xx < w:
                t = int(D[pos])
                if t == KEY:
                    xx += int(D[pos + 1]); pos += 2
                else:
                    if xx + t > w: raise ValueError(f'run overflows row (frame {fid} row {yy})')
                    out[yy, xx:xx + t] = D[pos + 1:pos + 1 + t]; xx += t; pos += 1 + t
            if xx != w: raise ValueError(f'row width {xx} != {w} (frame {fid} row {yy})')
            if pos + 1 < len(D) and D[pos] == KEY and D[pos + 1] == KEY: pos += 2
            else: raise ValueError(f'missing row terminator (frame {fid} row {yy}) at {pos}')
        return out, pos


def rgba(px):
    r = ((px >> 11) & 31) << 3; g = ((px >> 5) & 63) << 2; b = (px & 31) << 3
    r |= r >> 5; g |= g >> 6; b |= b >> 5
    return np.dstack([r, g, b, np.where(px == KEY, 0, 255)]).astype(np.uint8)

import test from 'node:test';
import assert from 'node:assert/strict';
import { cellToWorld, worldToCell, depthOf } from '../src/iso.ts';

test('cell <-> world round trip', () => {
  for (const [cx, cy] of [[0, 0], [10, 3], [3, 10], [47.5, 12.25]] as const) {
    const w = cellToWorld(cx, cy);
    const c = worldToCell(w.x, w.y);
    assert.ok(Math.abs(c.cx - cx) < 1e-9 && Math.abs(c.cy - cy) < 1e-9);
  }
});

test('iso axes: +cx goes down-right, +cy goes down-left', () => {
  const a = cellToWorld(1, 0), b = cellToWorld(0, 1);
  assert.ok(a.x > 0 && a.y < 0);
  assert.ok(b.x < 0 && b.y < 0);
  assert.ok(depthOf(5, 5) > depthOf(4, 5));
});

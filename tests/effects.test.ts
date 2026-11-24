import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { FX_TEXTURES, FLAME, ICE, fxLook, makeFx, spellFx, stepFx } from '../src/game/effects.ts';
import { SPELLS } from '../src/game/spells.ts';

test('every effect texture was converted', () => {
  for (const id of FX_TEXTURES) assert.ok(existsSync(new URL(`../public/assets/tex/gdi/3d/${id}.png`, import.meta.url)), `texture ${id}`);
  assert.equal(FLAME.length, 9);
  assert.equal(ICE.length, 14);
});

test('every parchment has an effect that uses known textures', () => {
  for (const id of Object.keys(SPELLS).map(Number)) {
    if (id === 94) continue; // vampire: needs other heroes
    const list = spellFx(id, 10, 10, 10, []);
    assert.ok(list.length > 0, `spell ${id}`);
    for (const f of list) for (const t of [f.tex].flat()) assert.ok(FX_TEXTURES.includes(t), `spell ${id} texture ${t}`);
  }
});

test('an effect waits for its delay, plays through its frames and fades out', () => {
  const list = [makeFx([1, 2, 3, 4], 0, 0, { life: 1, delay: 0.5, alpha0: 1, alpha1: 0, size0: 10, size1: 20 })];
  assert.equal(fxLook(list[0]!), null);
  stepFx(list, 0.5);
  assert.equal(fxLook(list[0]!)!.tex, 1);
  stepFx(list, 0.6);
  const mid = fxLook(list[0]!)!;
  assert.ok(mid.tex >= 3 && mid.alpha < 0.5 && mid.size > 15);
  stepFx(list, 0.5);
  assert.equal(list.length, 0);
});

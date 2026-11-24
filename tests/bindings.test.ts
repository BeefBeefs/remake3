import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assign, accepts, DEFAULT_BINDINGS, labelOf, parseBindings } from '../src/ui/bindings.ts';

test('defaults are the manual\'s: left button attacks, Ctrl runs, Shift sneaks, right button blocks', () => {
  assert.deepEqual(DEFAULT_BINDINGS, { attack: 'mouse0', run: 'key:control', stealth: 'key:shift', block: 'mouse2' });
  assert.deepEqual(['mouse0', 'key:control', 'key:shift', 'mouse2'].map(labelOf), ['Left button', 'Ctrl', 'Shift', 'Right button']);
});

test('each action only takes inputs it can use; game keys are reserved', () => {
  assert.equal(accepts('attack', 'key:x'), false);
  assert.equal(accepts('run', 'mouse1'), false);
  assert.equal(accepts('block', 'key:x'), true);
  assert.equal(accepts('run', 'key:w'), false);
  assert.equal(accepts('run', 'key:escape'), false);
  assert.equal(accepts('run', 'key:alt'), true);
});

test('assigning an input another action holds swaps them', () => {
  const swapped = assign(DEFAULT_BINDINGS, 'attack', 'mouse2');
  assert.equal(swapped.attack, 'mouse2');
  assert.equal(swapped.block, 'mouse0');
  const keys = assign(DEFAULT_BINDINGS, 'run', 'key:shift');
  assert.equal(keys.run, 'key:shift');
  assert.equal(keys.stealth, 'key:control');
  // block takes a key; the right button is then free for attack
  const b = assign(assign(DEFAULT_BINDINGS, 'block', 'key:x'), 'attack', 'mouse2');
  assert.deepEqual(b, { attack: 'mouse2', run: 'key:control', stealth: 'key:shift', block: 'key:x' });
  // a swap the other action cannot take falls back to its default
  const odd = assign(assign(DEFAULT_BINDINGS, 'block', 'key:x'), 'run', 'key:x');
  assert.equal(odd.run, 'key:x');
  assert.equal(odd.block, 'key:control');
  assert.equal(assign(DEFAULT_BINDINGS, 'attack', 'key:x'), DEFAULT_BINDINGS, 'rejected');
});

test('stored bindings are validated', () => {
  assert.deepEqual(parseBindings(undefined), DEFAULT_BINDINGS);
  assert.deepEqual(parseBindings({ attack: 'mouse1', run: 'key:alt', stealth: 'nonsense', block: 'mouse2' }), { attack: 'mouse1', run: 'key:alt', stealth: 'key:shift', block: 'mouse2' });
  assert.deepEqual(parseBindings({ attack: 'mouse0', block: 'mouse0' }), DEFAULT_BINDINGS, 'doubled inputs fall back');
});

import { parsePrefs, DEFAULT_PREFS, renderScale } from '../src/ui/prefs.ts';

test('preferences: old saves gain the new fields, bad values are clamped', () => {
  assert.deepEqual(parsePrefs({ music: 0.2, fx: 0.4, ambient: false, gamma: 1.1 }), { ...DEFAULT_PREFS, music: 0.2, fx: 0.4, ambient: false, gamma: 1.1 });
  const p = parsePrefs({ detail: 7, screen: 0.1, blood: 'yes', music: -3 });
  assert.equal(p.detail, 1); assert.equal(p.screen, 0.6); assert.equal(p.blood, true); assert.equal(p.music, 0);
  assert.equal(renderScale(0, 2), 1);
  assert.equal(renderScale(1, 3), 2);
});

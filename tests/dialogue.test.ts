import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDialogue, speechFor } from '../src/game/dialogue.ts';

const texts = JSON.parse(readFileSync(new URL('../public/assets/text/idioma.json', import.meta.url), 'utf8')) as Record<string, string>;

test('the Innkeeper speaks with three answers: sell to me, buy from me, good-bye', () => {
  const d = parseDialogue(speechFor(texts, '27', 0)!);
  assert.match(d.text, /^Greetings, stranger\./);
  assert.deepEqual(d.replies, ['What can you sell me?', 'I have some things that might interest you...', 'Nothing, good-bye.']);
});

test('an NPC with a single answer line gets it, and speeches without answers get "Continue"', () => {
  assert.deepEqual(parseDialogue(speechFor(texts, '28', 0)!).replies, ['You are drunk, you\'re pathetic.']);
  assert.deepEqual(parseDialogue('Just words.').replies, ['Continue']);
  assert.equal(parseDialogue('Just words.').text, 'Just words.');
});

test('the Princess says her second speech on every other visit; others repeat their only one', () => {
  assert.match(speechFor(texts, '63', 0)!, /^Stupid humans/);
  assert.match(speechFor(texts, '63', 1)!, /^You haven't achieved anything/);
  assert.match(speechFor(texts, '63', 2)!, /^Stupid humans/);
  assert.equal(speechFor(texts, '28', 1), speechFor(texts, '28', 0));
  assert.equal(speechFor(texts, '5', 0), null, 'monsters do not talk');
});

test('every speech in the language file parses into text and at least one answer', () => {
  let n = 0;
  for (const k of Object.keys(texts)) {
    if (!/^ACTORS\\ID-\d+\*+$/.test(k)) continue;
    const d = parseDialogue(texts[k]!);
    assert.ok(d.text.length > 10 && d.replies.length >= 1 && d.replies.every((r) => r.length > 0), k);
    n++;
  }
  assert.ok(n >= 38, `${n} speeches`);
});

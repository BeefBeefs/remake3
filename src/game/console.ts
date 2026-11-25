/**
 * The executable's F1 debug console (`0x43edb0` registers the words, handlers at `0x43e7f0`-`0x43ed50`). In the original the cheats
 * need F4 held while Enter is pressed; the remake runs them on Enter. Words and what their handlers do:
 * VIDA (life 999, mana and stamina topped up), MRFURIOSO (toggle god mode), FUERZA / RESISTENCIA / DESTREZA / MAGIA n (set that ability to n),
 * ITEM n (give item n), GETMONEY n / QUITMONEY n (gold), VAMONOS (end the mission); GRID, BBOX, DACTORS, FPS, SETFPS, VIDMEM, MCHECK, DROL and
 * CLS are debug views of the engine that have no meaning here.
 */
import type { Game } from './game.ts';

export interface ConsoleResult { ok: boolean; text: string }

const ABILITY = { FUERZA: 'strength', DESTREZA: 'skill', RESISTENCIA: 'resistance', MAGIA: 'magic' } as const;
const INERT = new Set(['GRID', 'BBOX', 'DACTORS', 'FPS', 'SETFPS', 'VIDMEM', 'MCHECK', 'DROL', 'CLS', 'C-DEBUG']);

export function runCommand(game: Game, line: string): ConsoleResult {
  const [word, arg] = line.trim().split(/\s+/);
  const cmd = (word ?? '').toUpperCase();
  const n = arg === undefined ? NaN : Number(arg);
  if (!cmd) return { ok: false, text: '' };
  if (INERT.has(cmd)) return { ok: true, text: `${cmd}: engine debug view, not available here` };
  switch (cmd) {
    case 'VIDA': game.cheatHeal(); return { ok: true, text: 'Ok' };
    case 'MRFURIOSO': game.godMode = !game.godMode; return { ok: true, text: game.godMode ? 'God mode on' : 'God mode off' };
    case 'FUERZA': case 'DESTREZA': case 'RESISTENCIA': case 'MAGIA':
      if (!Number.isFinite(n)) return { ok: false, text: `${cmd} needs a number` };
      game.cheatAbility(ABILITY[cmd], n);
      return { ok: true, text: 'Ok' };
    case 'ITEM': {
      if (!Number.isInteger(n)) return { ok: false, text: 'ITEM needs an item number' };
      return game.cheatItem(n) ? { ok: true, text: 'Ok' } : { ok: false, text: `no item ${n}, or no room` };
    }
    case 'GETMONEY': case 'QUITMONEY':
      if (!Number.isFinite(n)) return { ok: false, text: `${cmd} needs a number` };
      game.cheatGold(cmd === 'GETMONEY' ? n : -n);
      return { ok: true, text: 'Ok' };
    case 'VAMONOS': game.cheatSkipLevel(); return { ok: true, text: 'Ok' };
    default: return { ok: false, text: `unknown command ${cmd}` };
  }
}

/** Player preferences (the manual's "Controls" window): graphics, volumes, background sound, blood and the control configuration. Kept in localStorage. */
import { type Bindings, DEFAULT_BINDINGS, parseBindings } from './bindings.ts';

export interface Prefs {
  music: number; fx: number; ambient: boolean; gamma: number;
  /** 0..1: how sharp the picture is drawn (render scale) */
  detail: number;
  /** 0.6..1 of the window the game picture fills */
  screen: number;
  blood: boolean;
  keys: Bindings;
}

export const DEFAULT_PREFS: Prefs = { music: 0.35, fx: 0.55, ambient: true, gamma: 1, detail: 1, screen: 1, blood: true, keys: DEFAULT_BINDINGS };
const KEY = 'nst-prefs';

const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function parsePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFS;
  return {
    music: num(r.music, 0, 0.7, d.music), fx: num(r.fx, 0, 1, d.fx), ambient: typeof r.ambient === 'boolean' ? r.ambient : d.ambient, gamma: num(r.gamma, 0.7, 1.5, d.gamma),
    detail: num(r.detail, 0, 1, d.detail), screen: num(r.screen, 0.6, 1, d.screen), blood: typeof r.blood === 'boolean' ? r.blood : d.blood, keys: parseBindings(r.keys),
  };
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return parsePrefs(JSON.parse(raw));
  } catch { /* storage unavailable */ }
  return parsePrefs(undefined);
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

/** Render scale for the detail slider: 0 draws at half resolution, 1 at the screen's full pixel ratio (at most 2). */
export const renderScale = (detail: number, devicePixelRatio: number): number => Math.min(devicePixelRatio, 2) * (0.5 + 0.5 * detail);

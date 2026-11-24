/** Player preferences (the manual's "Controls" window): volumes, background sound and gamma. Kept in localStorage. */
export interface Prefs { music: number; fx: number; ambient: boolean; gamma: number }

export const DEFAULT_PREFS: Prefs = { music: 0.35, fx: 0.55, ambient: true, gamma: 1 };
const KEY = 'nst-prefs';

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch { /* storage unavailable */ }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

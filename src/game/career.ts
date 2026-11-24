/**
 * Saving between missions. The manual is explicit: "you cannot save whilst playing a mission", and "a good tip is to
 * save after each mission" (dying costs the carried items and a point of each ability). So a save is a *career*: the
 * hero as he stands between missions (abilities, level, experience, points, gold, backpack and worn gear), the
 * difficulty, and which territories are cleared. Slots live in localStorage.
 */
import type { HeroSave } from './game.ts';
import type { Slot } from './items.ts';

export interface Mission { id: string; name: string; map: string; /** place on the 640x480 world map picture */ at: { x: number; y: number } }
/** The missions this install has. (The adventure container of this install holds only the Lost Forest.) */
export const MISSIONS: Mission[] = [{ id: 'lost_forrest', name: 'Lost Forest', map: 'lost_forrest.map', at: { x: 265, y: 262 } }];

export interface Career {
  v: 1;
  /** 100 Barbarian, 101 Amazon, 102 Sorceress */
  classId: number;
  difficulty: 0 | 1 | 2;
  hero: HeroSave;
  /** ids of the cleared missions */
  done: string[];
  /** epoch milliseconds of the save */
  when: number;
}

export const SLOTS = 8;
export const SAVE_KEY = 'nst-saves';
const SLOT_NAMES: Slot[] = ['weapon', 'shield', 'armor', 'ring', 'amulet'];

export function newCareer(classId: number, difficulty: 0 | 1 | 2, hero: HeroSave): Career {
  return { v: 1, classId, difficulty, hero, done: [], when: Date.now() };
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Validates data read back from storage (or a tampered / older save); null when it cannot be used. */
export function parseCareer(raw: unknown): Career | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<Career>;
  if (c.v !== 1 || !isNum(c.classId) || ![100, 101, 102].includes(c.classId) || ![0, 1, 2].includes(c.difficulty as number)) return null;
  const h = c.hero as Partial<HeroSave> | undefined;
  if (!h || !h.attrs || !(['strength', 'skill', 'resistance', 'magic'] as const).every((k) => isNum(h.attrs![k]))) return null;
  if (!isNum(h.level) || !isNum(h.xp) || !isNum(h.points) || !isNum(h.gold)) return null;
  let inv: HeroSave['inv'];
  if (h.inv) {
    const slots = Array.isArray(h.inv.slots) && h.inv.slots.every(isNum) ? h.inv.slots.slice(0, 20) : null;
    const eq: HeroSave['inv'] extends infer T ? (T extends { equipped: infer E } ? E : never) : never = {};
    for (const s of SLOT_NAMES) { const v = (h.inv.equipped as Record<string, unknown> | undefined)?.[s]; if (isNum(v) && v > 0) eq[s] = v; }
    if (!slots) return null;
    const num = (v: unknown) => (isNum(v) && v >= 0 ? v : 0);
    const left = Array.isArray(h.inv.left) ? h.inv.left.slice(0, 20).map(num) : undefined;
    const eqLeft: NonNullable<HeroSave['inv']>['equippedLeft'] = {};
    for (const s of SLOT_NAMES) { const v = (h.inv.equippedLeft as Record<string, unknown> | undefined)?.[s]; if (isNum(v) && v > 0) eqLeft[s] = v; }
    inv = { slots, equipped: eq, ...(left ? { left } : {}), ...(Object.keys(eqLeft).length ? { equippedLeft: eqLeft } : {}) };
  }
  return {
    v: 1, classId: c.classId, difficulty: c.difficulty as 0 | 1 | 2,
    hero: { attrs: { ...h.attrs }, level: h.level, xp: h.xp, points: h.points, gold: h.gold, ...(inv ? { inv } : {}) } as HeroSave,
    done: Array.isArray(c.done) ? c.done.filter((d): d is string => typeof d === 'string') : [],
    when: isNum(c.when) ? c.when : 0,
  };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Eight save slots in one storage key. */
export class SaveStore {
  constructor(private readonly storage: Store | null, private readonly key = SAVE_KEY) {}

  list(): (Career | null)[] {
    let raw: unknown = null;
    try { raw = JSON.parse(this.storage?.getItem(this.key) ?? 'null'); } catch { /* corrupt: treat as empty */ }
    const arr = Array.isArray(raw) ? raw : [];
    return Array.from({ length: SLOTS }, (_, i) => parseCareer(arr[i]));
  }

  get any(): boolean { return this.list().some((c) => c); }

  /** Returns false when the browser refuses to store it (private mode, quota). */
  write(slot: number, career: Career): boolean {
    if (slot < 0 || slot >= SLOTS) return false;
    const all = this.list();
    all[slot] = { ...career, when: Date.now() };
    try { this.storage?.setItem(this.key, JSON.stringify(all)); return !!this.storage; } catch { return false; }
  }

  read(slot: number): Career | null { return this.list()[slot] ?? null; }

  remove(slot: number): void {
    const all = this.list();
    all[slot] = null;
    try { this.storage?.setItem(this.key, JSON.stringify(all)); } catch { /* nothing to do */ }
  }
}

/**
 * The "Control configuration" of the Controls window: four actions, each tied to one input.
 * An input is `mouse0` / `mouse1` / `mouse2` (left, middle, right button) or `key:<KeyboardEvent.key lower-cased>`.
 * Attack / Move / Activate takes a mouse button; Run and Stealth are held keys; Block mode / Block attack takes either.
 */
export type Action = 'attack' | 'run' | 'stealth' | 'block';
export type Bindings = Record<Action, string>;

export const ACTIONS: Action[] = ['attack', 'run', 'stealth', 'block'];
export const ACTION_LABELS: Record<Action, string> = { attack: 'Attack / Move / Activate', run: 'Run', stealth: 'Stealth', block: 'Block mode / Block attack' };
export const DEFAULT_BINDINGS: Bindings = { attack: 'mouse0', run: 'key:control', stealth: 'key:shift', block: 'mouse2' };

/** Keys the game itself uses; they cannot be given to an action. */
const RESERVED = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 'a', 's', 'd', 'i', 'c', 'q', ' ', 'escape', '1', '2', '3', '4', 'tab', 'enter']);

export const isMouse = (input: string): boolean => /^mouse[0-2]$/.test(input);
export const isKey = (input: string): boolean => input.startsWith('key:') && input.length > 4 && !RESERVED.has(input.slice(4));

/** Whether an action accepts this input at all. */
export function accepts(action: Action, input: string): boolean {
  if (action === 'attack') return isMouse(input);
  if (action === 'block') return isMouse(input) || isKey(input);
  return isKey(input);
}

export function labelOf(input: string): string {
  if (isMouse(input)) return ['Left button', 'Middle button', 'Right button'][Number(input.slice(5))]!;
  const k = input.slice(4);
  const names: Record<string, string> = { control: 'Ctrl', shift: 'Shift', alt: 'Alt' };
  return names[k] ?? (k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1));
}

/** Gives `action` the input. Another action that had it takes over what `action` had, or its default if it cannot use that. Returns the old bindings when rejected. */
export function assign(b: Bindings, action: Action, input: string): Bindings {
  if (!accepts(action, input)) return b;
  const out = { ...b };
  const other = ACTIONS.find((a) => a !== action && out[a] === input);
  if (other) out[other] = accepts(other, b[action]) ? b[action] : DEFAULT_BINDINGS[other];
  out[action] = input;
  // a default taken from a clash may itself clash: settle by giving the later action its default when it is free, else leave the swap
  return ACTIONS.every((a) => ACTIONS.filter((x) => out[x] === out[a]).length === 1) ? out : b;
}

/** Reads stored bindings, falling back to the defaults for anything invalid or doubled. */
export function parseBindings(raw: unknown): Bindings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_BINDINGS };
  for (const a of ACTIONS) if (typeof r[a] === 'string' && accepts(a, r[a] as string)) out[a] = r[a] as string;
  return ACTIONS.every((a) => ACTIONS.filter((x) => out[x] === out[a]).length === 1) ? out : { ...DEFAULT_BINDINGS };
}

/** The input a mouse event or key event stands for. */
export const mouseInput = (button: number): string => `mouse${button}`;
export const keyInput = (key: string): string => `key:${key.toLowerCase()}`;

import type { Skin } from './skin.ts';
import type { Prefs } from './prefs.ts';
import { ACTIONS, ACTION_LABELS, assign, labelOf, keyInput, mouseInput, type Action } from './bindings.ts';

/**
 * The Controls window (Overlay 50, 308x452; the coordinates of its fields follow Menu.ini's [Preferences] and the picture):
 * Graphics (detail, gamma, screen size, blood), Sound (music, fx, background) and Control configuration (click a box, then press
 * the key or mouse button). It lives on a 640x480 stage; the caller puts `element` on one and handles `onReturn`.
 */
export class ControlsPanel {
  readonly element = document.createElement('div');

  constructor(private readonly skin: Skin, private readonly prefs: Prefs, private readonly onPrefs: (p: Prefs) => void, private readonly onReturn: () => void) {
    this.element.style.cssText = 'position:absolute;left:0;top:0;width:640px;height:480px';
    this.build();
  }

  private slider(x: number, y: number, value: number, set: (v: number) => void, width = 120): void {
    const track = document.createElement('div');
    track.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:12px;cursor:pointer`;
    const knob = document.createElement('div');
    knob.style.cssText = 'position:absolute;top:-1px;width:6px;height:14px;background:#6b5426;border:1px solid #e8c85a;box-sizing:border-box';
    const paint = (v: number) => { knob.style.left = `${v * (width - 6)}px`; };
    paint(value);
    const move = (e: PointerEvent) => {
      const r = track.getBoundingClientRect();
      const v = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      paint(v); set(v);
    };
    track.addEventListener('pointerdown', (e) => { track.setPointerCapture(e.pointerId); move(e); track.onpointermove = move; });
    track.addEventListener('pointerup', () => { track.onpointermove = null; });
    track.appendChild(knob);
    this.element.appendChild(track);
  }

  private check(x: number, y: number, get: () => boolean, set: (v: boolean) => void): void {
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:12px;height:12px;cursor:pointer;color:#e8c85a;font:bold 13px/12px sans-serif;text-align:center`;
    const paint = () => { box.textContent = get() ? '✓' : ''; };
    paint();
    box.addEventListener('click', () => { set(!get()); paint(); this.onPrefs(this.prefs); });
    this.element.appendChild(box);
  }

  private build(): void {
    const x0 = 166, y0 = 5, el = this.element, p = this.prefs;
    el.replaceChildren(this.skin.sprite('overlay', 50, x0, y0));
    // graphics (the troughs at x 137..262 of the picture)
    this.slider(302, 70, p.detail, (v) => { p.detail = v; this.onPrefs(p); });
    this.slider(302, 90, (p.gamma - 0.7) / 0.8, (v) => { p.gamma = 0.7 + v * 0.8; this.onPrefs(p); });
    this.slider(302, 110, (p.screen - 0.6) / 0.4, (v) => { p.screen = 0.6 + v * 0.4; this.onPrefs(p); });
    this.check(303, 132, () => p.blood, (v) => { p.blood = v; });
    // sound (Menu.ini PMusic {191,184}, PFX {191,204}; the troughs are 125 px wide)
    this.slider(191, 184, p.music / 0.7, (v) => { p.music = v * 0.7; this.onPrefs(p); }, 125);
    this.slider(191, 204, p.fx, (v) => { p.fx = v; this.onPrefs(p); }, 125);
    this.check(303, 222, () => p.ambient, (v) => { p.ambient = v; });
    // control configuration: four boxes, 128 px wide, each showing the current input
    ACTIONS.forEach((a, i) => this.binding(a, 257, 290 + i * 36));
    const ret = this.skin.sprite('overlay', 51, 261, 431);
    ret.style.cursor = 'pointer';
    ret.addEventListener('pointerenter', () => { ret.style.filter = 'brightness(1.5)'; });
    ret.addEventListener('pointerleave', () => { ret.style.filter = ''; });
    ret.addEventListener('click', () => { this.stopCapture?.(); this.onReturn(); });
    el.appendChild(ret);
  }

  private stopCapture: (() => void) | null = null;

  private binding(action: Action, x: number, y: number): void {
    const z = document.createElement('div');
    z.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:128px;height:14px;cursor:pointer;display:flex;justify-content:center;overflow:hidden`;
    const show = (text: string, color: string) => { z.replaceChildren(this.skin.text(text, { color })); };
    const idle = () => show(labelOf(this.prefs.keys[action]), '#e9dfb8');
    idle();
    z.title = `${ACTION_LABELS[action]}: click, then press the key or mouse button`;
    z.addEventListener('click', () => {
      this.stopCapture?.();
      show('press a key…', '#f6e49a');
      let inputIsPointer = false;
      const finish = (input: string | null) => {
        window.removeEventListener('keydown', key, true);
        window.removeEventListener('pointerdown', mouse, true);
        window.removeEventListener('contextmenu', stop, true);
        this.stopCapture = null;
        if (input && inputIsPointer) window.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true }); // the click that follows this press is not meant for what is under it
        if (input) {
          this.prefs.keys = assign(this.prefs.keys, action, input);
          this.onPrefs(this.prefs);
        }
        this.build(); // every box may have changed (a swap)
      };
      const key = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); finish(e.key === 'Escape' ? null : keyInput(e.key)); };
      const mouse = (e: PointerEvent) => { if (z.contains(e.target as Node) && e.button === 0) return; e.preventDefault(); e.stopPropagation(); inputIsPointer = true; finish(mouseInput(e.button)); };
      const stop = (e: Event) => e.preventDefault();
      window.addEventListener('keydown', key, true);
      window.addEventListener('pointerdown', mouse, true);
      window.addEventListener('contextmenu', stop, true);
      this.stopCapture = () => finish(null);
    });
    this.element.appendChild(z);
  }
}

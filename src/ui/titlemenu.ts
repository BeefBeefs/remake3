/**
 * The main menu, built from the original art: NQuest frame 17 (logo on black), the Menu bank's buttons at the
 * coordinates in System/Menu.ini, the Select Hero dialog (MapGFX 32), the Difficulty dialog (Menu 62) and the
 * Controls window (Overlay 50). Everything lives on a 640x480 stage that is scaled to fit the window.
 */
import type { Skin } from './skin.ts';
import type { Prefs } from './prefs.ts';
import type { Career, SaveStore } from '../game/career.ts';
import { pickSlot } from './saveslots.ts';
import { pickMap } from './mappicker.ts';
import { ControlsPanel } from './controls.ts';
import type { MapEntry } from '../game/maplist.ts';

export type Difficulty = 0 | 1 | 2;
export const DIFFICULTY_NAMES = ['Apprentice', 'Expert', 'Hero'] as const;

/** A new game (hero + difficulty) or a saved career picked with Load game. */
export interface MenuResult { hero: number; difficulty: Difficulty; load?: Career; /** a map chosen with Select map: played on its own, outside the career */ map?: MapEntry }

export class TitleMenu {
  private readonly root = document.createElement('div');
  private readonly stage = document.createElement('div');
  private done: ((r: MenuResult) => void) | null = null;
  private hero = 0;
  private map: MapEntry | undefined;

  constructor(private readonly skin: Skin, private readonly prefs: Prefs, private readonly onPrefs: (p: Prefs) => void, private readonly heroNames: string[], private readonly store?: SaveStore) {
    this.root.style.cssText = 'position:fixed;inset:0;background:#000;z-index:20;display:flex;align-items:center;justify-content:center;user-select:none;overflow:hidden';
    this.stage.style.cssText = 'position:relative;width:640px;height:480px;flex:none;transform-origin:center center';
    this.root.appendChild(this.stage);
    window.addEventListener('resize', () => this.fit());
    this.fit();
  }

  private fit(): void {
    const s = Math.min(window.innerWidth / 640, window.innerHeight / 480);
    this.stage.style.transform = `scale(${s})`;
  }

  /** Shows the menu and resolves when a game is started. */
  run(start: 'main' | 'newgame' | 'hero' | 'difficulty' | 'controls' | 'credits' = 'main'): Promise<MenuResult> {
    document.body.appendChild(this.root);
    ({ main: () => this.main(), newgame: () => this.newGame(), hero: () => this.selectHero(), difficulty: () => this.difficulty(), controls: () => this.controls(), credits: () => this.credits() })[start]();
    return new Promise((resolve) => { this.done = (r) => { this.root.remove(); resolve(r); }; });
  }

  private clear(): void {
    this.stage.replaceChildren(this.skin.sprite('nquest', 17, 0, 0));
  }

  /** A clickable sprite: hover brightens, `enabled = false` dims it and ignores clicks. */
  private button(bank: Parameters<Skin['sprite']>[0], id: number, x: number, y: number, onClick: () => void, enabled = true, title?: string): HTMLDivElement {
    const b = this.skin.sprite(bank, id, x, y);
    if (bank === 'menu' && id <= 14) b.style.mixBlendMode = 'screen'; // the big menu words carry a black backdrop: add them to the picture
    b.style.cursor = enabled ? 'pointer' : 'default';
    if (!enabled) { b.style.opacity = '0.35'; if (title) b.title = title; }
    else {
      b.addEventListener('pointerenter', () => { b.style.filter = 'brightness(1.5)'; });
      b.addEventListener('pointerleave', () => { b.style.filter = ''; });
      b.addEventListener('click', onClick);
    }
    this.stage.appendChild(b);
    return b;
  }

  /** Main menu (coordinates from Menu.ini [Coordenadas]). */
  private main(): void {
    this.clear();
    this.button('menu', 2, 0, 251, () => this.newGame());
    this.button('menu', 3, 0, 301, () => undefined, false, 'Multiplayer comes later');
    this.button('menu', 4, 0, 351, () => {
      void pickSlot(this.skin, this.store!, 'load', this.stage).then((slot) => {
        const c = slot === null ? null : this.store!.read(slot);
        if (c) this.done?.({ hero: c.classId - 100, difficulty: c.difficulty, load: c });
      });
    }, !!this.store?.any, 'There is no saved game yet');
    this.button('menu', 5, 338, 251, () => this.controls());
    this.button('menu', 6, 338, 301, () => this.credits());
    this.button('menu', 7, 338, 351, () => { location.href = 'https://github.com/BeefBeefs/remake3'; });
  }

  /** "New game" submenu: Start game / Select map / Return (Menu.ini CStartGame, CCustomGame, CBackNewGame). */
  private newGame(): void {
    this.clear();
    this.button('menu', 12, 194, 302, () => { this.map = undefined; this.selectHero(); });
    this.button('menu', 13, 194, 338, () => {
      void pickMap(this.skin, this.stage).then((m) => { if (m) { this.map = m; this.selectHero(); } });
    });
    this.button('menu', 14, 194, 374, () => this.main());
  }

  private selectHero(): void {
    this.clear();
    const [w, h] = this.skin.size('mapgfx', 32);
    const x0 = (640 - w) / 2, y0 = (480 - h) / 2;
    this.stage.appendChild(this.skin.sprite('mapgfx', 32, x0, y0));
    const frames: HTMLDivElement[] = [];
    [62, 132, 202].forEach((px, i) => {
      const f = document.createElement('div');
      f.style.cssText = `position:absolute;left:${x0 + px - 2}px;top:${y0 + 73}px;width:44px;height:52px;border:2px solid transparent;cursor:pointer`;
      f.title = this.heroNames[i] ?? '';
      f.addEventListener('click', () => { this.hero = i; paint(); });
      f.addEventListener('dblclick', () => this.difficulty());
      this.stage.appendChild(f);
      frames.push(f);
    });
    const paint = () => frames.forEach((f, i) => { f.style.borderColor = i === this.hero ? '#e8c85a' : 'transparent'; f.style.boxShadow = i === this.hero ? '0 0 8px #e8c85a' : 'none'; });
    paint();
    this.button('menu', 60, x0 + 72, y0 + 156, () => this.difficulty());
    this.button('menu', 61, x0 + 170, y0 + 156, () => this.newGame());
  }

  private difficulty(): void {
    this.clear();
    const [w, h] = this.skin.size('menu', 62);
    const x0 = (640 - w) / 2, y0 = (480 - h) / 2;
    this.stage.appendChild(this.skin.sprite('menu', 62, x0, y0));
    [0, 1, 2].forEach((d) => {
      const z = document.createElement('div');
      z.style.cssText = `position:absolute;left:${x0 + 43}px;top:${y0 + 55 + d * 40}px;width:222px;height:28px;cursor:pointer`;
      z.title = ['Easy', 'Normal', 'Hard'][d]!;
      z.addEventListener('pointerenter', () => { z.style.background = 'rgba(255,230,150,.18)'; });
      z.addEventListener('pointerleave', () => { z.style.background = ''; });
      z.addEventListener('click', () => this.done?.({ hero: this.hero, difficulty: d as Difficulty, ...(this.map ? { map: this.map } : {}) }));
      this.stage.appendChild(z);
    });
    this.button('menu', 61, x0 + 120, y0 + 172, () => this.selectHero());
  }

  /** The Controls window: see controls.ts. */
  private controls(): void {
    this.clear();
    this.stage.appendChild(new ControlsPanel(this.skin, this.prefs, this.onPrefs, () => this.main()).element);
  }

  private credits(): void {
    this.clear();
    const [w, h] = this.skin.size('overlay', 66);
    const x0 = (640 - w) / 2, y0 = 100;
    this.stage.appendChild(this.skin.sprite('overlay', 66, x0, y0));
    const lines = [
      'NIGHTSTONE', '',
      'Original game: (c) 2001 Virgin Interactive.',
      'This is an unofficial fan remake that reads',
      'the files of your own installation.', '',
      'github.com/BeefBeefs/remake3',
    ];
    lines.forEach((l, i) => {
      if (!l) return;
      const t = this.skin.text(l, { color: i === 0 ? '#f1d98a' : '#e9dfb8' });
      t.style.cssText += `;position:absolute;left:${x0 + (w - this.skin.textWidth(l)) / 2}px;top:${y0 + 22 + i * 17}px`;
      this.stage.appendChild(t);
    });
    this.button('overlay', 51, 260, y0 + h + 10, () => this.main());
  }
}

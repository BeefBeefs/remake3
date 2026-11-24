/**
 * The land of NightStone between missions (MapGFX frame 1, a 1024 x 768 picture of the map table). Each territory is
 * a banner you click to enter; a cleared one shows a gold star ("the area will become flagged"). This is where the
 * manual says you save. Which spot on the picture is the Lost Forest is a guess (a ring of trees on the west).
 */
import { CLASSES } from '../game/game.ts';
import { MISSIONS, type Career, type SaveStore } from '../game/career.ts';
import { describe, pickSlot } from './saveslots.ts';
import type { Skin } from './skin.ts';

export type MapChoice = { action: 'enter'; mission: string } | { action: 'menu' };

export class WorldMap {
  private readonly root = document.createElement('div');
  private readonly stage = document.createElement('div');

  constructor(private readonly skin: Skin, private readonly store: SaveStore) {
    this.root.style.cssText = 'position:fixed;inset:0;background:#000;z-index:20;display:flex;align-items:center;justify-content:center;user-select:none;overflow:hidden';
    this.stage.style.cssText = 'position:relative;width:640px;height:480px;flex:none;transform-origin:center center';
    this.root.appendChild(this.stage);
    const fit = () => { this.stage.style.transform = `scale(${Math.min(window.innerWidth / 640, window.innerHeight / 480)})`; };
    window.addEventListener('resize', fit);
    fit();
  }

  /** Shows the map for a career; resolves when a mission is chosen or "Main menu" is clicked. */
  run(career: Career, hero: string, onSaved?: () => void): Promise<MapChoice> {
    const sk = this.skin;
    return new Promise((resolve) => {
      const finish = (c: MapChoice) => { this.root.remove(); resolve(c); };
      const draw = () => {
        this.stage.replaceChildren();
        const bg = sk.fill('mapgfx', 1, 640, 480);
        bg.style.imageRendering = 'auto';
        this.stage.appendChild(bg);
        const put = (el: HTMLElement, x: number, y: number) => { el.style.position = 'absolute'; el.style.left = `${x}px`; el.style.top = `${y}px`; this.stage.appendChild(el); return el; };
        const label = (t: string, x: number, y: number, color: string, center = 0) => {
          const c = sk.text(t, { color });
          c.style.pointerEvents = 'none';
          put(c, center ? x + (center - sk.textWidth(t)) / 2 : x, y);
        };
        for (const m of MISSIONS) {
          const cleared = career.done.includes(m.id);
          const pin = document.createElement('div');
          pin.style.cssText = `width:26px;height:26px;border-radius:50%;box-sizing:border-box;border:2px solid ${cleared ? '#e8c85a' : '#c8402a'};background:radial-gradient(circle,${cleared ? '#fff3b0' : '#ff9a6a'} 0,${cleared ? '#c79a2a' : '#8a1e10'} 70%);box-shadow:0 0 10px ${cleared ? '#ffd24a' : '#ff5a30'};cursor:pointer;display:flex;align-items:center;justify-content:center`;
          pin.title = `${m.name}${cleared ? ' (cleared)' : ''}: click to enter`;
          pin.addEventListener('click', () => finish({ action: 'enter', mission: m.id }));
          pin.addEventListener('pointerenter', () => { pin.style.transform = 'scale(1.2)'; });
          pin.addEventListener('pointerleave', () => { pin.style.transform = ''; });
          put(pin, m.at.x - 13, m.at.y - 13);
          if (cleared) { const star = sk.text('*', { color: '#5a3a00', shadow: false }); star.style.cssText += ';pointer-events:none'; pin.appendChild(star); }
          label(m.name, m.at.x - 60, m.at.y + 16, cleared ? '#f1d98a' : '#ffe9c8', 120);
        }
        // hero card, top right over the dark table edge
        const card = document.createElement('div');
        card.style.cssText = 'width:176px;height:76px;box-shadow:0 0 0 2px #9c7e48,0 4px 14px #000;overflow:hidden;position:relative';
        card.appendChild(sk.fill('overlay', 66, 176, 76));
        put(card, 456, 8);
        const d = describe(career);
        const hn = sk.text(hero ? `${hero}, ${CLASSES[career.classId as 100 | 101 | 102]?.name ?? ''}` : d.title, { color: '#f1d98a' }); hn.style.cssText += ';position:absolute;left:8px;top:6px';
        const l1 = sk.text(hero ? `level ${career.hero.level}` : d.detail, { color: '#e9dfb8' }); l1.style.cssText += ';position:absolute;left:8px;top:26px';
        const l2 = sk.text(hero ? `${career.hero.gold} gold` : ' ', { color: '#d8caa0' }); l2.style.cssText += ';position:absolute;left:8px;top:46px';
        card.append(hn, l1, l2);
        label('Choose a territory', 0, 10, '#2a1a08', 440);
        // buttons
        const msg = document.createElement('div');
        put(sk.plate('Save game', 120, 22, async () => {
          const slot = await pickSlot(sk, this.store, 'save', this.stage);
          if (slot === null) return;
          const ok = this.store.write(slot, { ...career, when: Date.now() });
          flash(ok ? `Saved in slot ${slot + 1}` : 'The browser would not store the save');
          if (ok) onSaved?.();
        }), 14, 448);
        put(sk.plate('Main menu', 120, 22, () => finish({ action: 'menu' })), 506, 448);
        const flash = (t: string) => { msg.replaceChildren(); const c = sk.text(t, { color: '#2a1a08', shadow: false }); msg.appendChild(c); put(msg, 150, 452); setTimeout(() => msg.replaceChildren(), 3000); };
        void msg;
      };
      draw();
      document.body.appendChild(this.root);
    });
  }
}

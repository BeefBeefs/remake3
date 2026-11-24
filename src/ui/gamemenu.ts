/** The in-game Options menu (Esc): MapGFX frame 10 with its baked Load / Save / Return / Exit buttons. */
import type { Skin } from './skin.ts';

export class GameMenu {
  private readonly root = document.createElement('div');
  isOpen = false;

  constructor(skin: Skin, onExit: () => void) {
    this.root.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45);z-index:15;user-select:none';
    const box = document.createElement('div');
    const [w, h] = skin.size('mapgfx', 10);
    box.style.cssText = `position:relative;width:${w}px;height:${h}px;flex:none`;
    box.appendChild(skin.sprite('mapgfx', 10, 0, 0));
    const zone = (y: number, label: string, fn?: () => void) => {
      const z = document.createElement('div');
      z.style.cssText = `position:absolute;left:22px;top:${y}px;width:90px;height:19px;cursor:${fn ? 'pointer' : 'default'}`;
      z.title = label;
      if (fn) {
        z.addEventListener('pointerenter', () => { z.style.background = 'rgba(255,230,150,.2)'; });
        z.addEventListener('pointerleave', () => { z.style.background = ''; });
        z.addEventListener('click', fn);
      } else z.style.background = 'rgba(0,0,0,.45)';
      box.appendChild(z);
    };
    zone(40, 'Load: saved games are loaded from the main menu');
    zone(70, 'Save: you cannot save whilst playing a mission; save between missions, on the map');
    zone(100, 'Return to the game', () => this.close());
    zone(131, 'Exit to the main menu', onExit);
    this.root.appendChild(box);
    document.body.appendChild(this.root);
    const fit = () => { box.style.transform = `scale(${window.innerHeight / 480})`; };
    window.addEventListener('resize', fit);
    fit();
  }

  toggle(): void { if (this.isOpen) this.close(); else this.open(); }
  open(): void { this.isOpen = true; this.root.style.display = 'flex'; }
  close(): void { this.isOpen = false; this.root.style.display = 'none'; }
}

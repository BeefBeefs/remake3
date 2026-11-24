/** The in-game Options menu (Esc): MapGFX frame 10 with its baked Load / Save / Return / Exit buttons. */
import type { Skin } from './skin.ts';
import type { Prefs } from './prefs.ts';
import { ControlsPanel } from './controls.ts';

export class GameMenu {
  private readonly root = document.createElement('div');
  isOpen = false;

  constructor(skin: Skin, onExit: () => void, prefs?: Prefs, onPrefs?: (p: Prefs) => void) {
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
    if (prefs && onPrefs) {
      // the baked frame has no Controls entry: a plate under it opens the Controls window (the manual puts it in the options)
      const plate = document.createElement('div');
      plate.style.cssText = `position:absolute;left:22px;top:${h + 6}px;width:90px;height:19px;cursor:pointer;background:#241a0e;border:1px solid #6b5426;box-sizing:border-box;display:flex;justify-content:center;align-items:center;overflow:hidden`;
      plate.appendChild(skin.text('Controls', { color: '#e9dfb8' }));
      plate.addEventListener('click', () => {
        const stage = document.createElement('div');
        stage.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);z-index:16';
        const inner = document.createElement('div');
        inner.style.cssText = 'position:relative;width:640px;height:480px;flex:none';
        const fitc = () => { inner.style.transform = `scale(${window.innerHeight / 480})`; };
        window.addEventListener('resize', fitc); fitc();
        inner.appendChild(new ControlsPanel(skin, prefs, onPrefs, () => { window.removeEventListener('resize', fitc); stage.remove(); }).element);
        stage.appendChild(inner);
        document.body.appendChild(stage);
      });
      box.appendChild(plate);
    }
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

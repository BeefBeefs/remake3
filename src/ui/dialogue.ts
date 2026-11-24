import type { Skin } from './skin.ts';
import type { Dialogue } from '../game/dialogue.ts';

const W = 420, BRONZE = '#9c7e48';

/** The speech window of an NPC: the original stone panel, the name on a black plate, the speech and the answers to pick from. */
export class DialogueWindow {
  private readonly root = document.createElement('div');
  isOpen = false;

  constructor(private readonly skin: Skin) {
    this.root.style.cssText = `position:fixed;left:50%;bottom:92px;width:${W}px;display:none;user-select:none;z-index:9;transform-origin:50% 100%`;
    document.body.appendChild(this.root);
    const fit = () => { this.root.style.transform = `translateX(-50%) scale(${window.innerHeight / 480})`; };
    window.addEventListener('resize', fit);
    fit();
  }

  /** Shows the speech; `onPick` gets the index of the chosen answer, then the window closes. */
  open(who: string, d: Dialogue, onPick: (i: number) => void): void {
    const sk = this.skin;
    this.isOpen = true;
    this.root.replaceChildren();
    const panel = document.createElement('div');
    panel.style.cssText = `position:relative;box-sizing:border-box;border:3px double ${BRONZE};box-shadow:0 0 0 1px #000,0 6px 24px #000c;padding:36px 16px 12px;overflow:hidden`;
    const bg = sk.fill('overlay', 66, W, 600);
    bg.style.cssText += ';position:absolute;left:0;top:0;z-index:0';
    panel.appendChild(bg);
    const title = document.createElement('div');
    title.style.cssText = `position:absolute;left:12px;top:8px;right:12px;height:22px;background:#000;border:1px solid ${BRONZE};box-sizing:border-box;z-index:1;display:flex;justify-content:center`;
    title.appendChild(sk.text(who, { color: '#f1d98a' }));
    panel.appendChild(title);
    const body = document.createElement('div');
    body.style.cssText = 'position:relative;z-index:1';
    for (const para of d.text.split('\n')) {
      const lines = para.trim() ? sk.wrap(para, W - 44) : [''];
      for (const l of lines) { const row = document.createElement('div'); row.style.cssText = 'height:17px'; if (l) row.appendChild(sk.text(l)); body.appendChild(row); }
    }
    panel.appendChild(body);
    const answers = document.createElement('div');
    answers.style.cssText = 'position:relative;z-index:1;margin-top:10px;display:flex;flex-direction:column;gap:4px';
    d.replies.forEach((r, i) => {
      const b = document.createElement('div');
      b.style.cssText = `cursor:pointer;border:1px solid ${BRONZE};background:#0009;padding:1px 8px;box-sizing:border-box`;
      b.appendChild(sk.text(r, { color: '#d8caa0' }));
      b.addEventListener('click', () => { this.close(); onPick(i); });
      b.addEventListener('pointerenter', () => { b.style.background = '#3a2a10cc'; });
      b.addEventListener('pointerleave', () => { b.style.background = '#0009'; });
      answers.appendChild(b);
    });
    panel.appendChild(answers);
    this.root.appendChild(panel);
    this.root.style.display = 'block';
  }

  close(): void { this.isOpen = false; this.root.style.display = 'none'; }
}

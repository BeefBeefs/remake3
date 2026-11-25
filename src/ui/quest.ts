import type { Skin } from './skin.ts';

// The window is the original picture `Pack/Quest.g16` (429 x 331): a title bar ("Quest" is drawn into it, so we cover it with the
// mission title), a text box with a scroll bar (x 14-394, y 40-280) and a "Return to game" button (x 154-276, y 296-316).
const W = 429, H = 331;

/** The mission text window (the Q key, and the briefing when a mission starts). */
export class QuestWindow {
  private readonly root = document.createElement('div');
  isOpen = false;

  constructor(private readonly skin: Skin) {
    this.root.style.cssText = `position:fixed;left:50%;top:50%;width:${W}px;height:${H}px;display:none;user-select:none;z-index:9`;
    document.body.appendChild(this.root);
    const fit = () => { this.root.style.transform = `translate(-50%,-50%) scale(${window.innerHeight / 480})`; };
    window.addEventListener('resize', fit);
    fit();
  }

  open(title: string, text: string): void {
    const sk = this.skin;
    this.isOpen = true;
    this.root.replaceChildren();
    const bg = document.createElement('div');
    bg.style.cssText = `position:absolute;inset:0;background:url(${sk.base}screens/quest.png);filter:drop-shadow(0 6px 18px #000c)`;
    this.root.appendChild(bg);
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:150px;top:8px;width:130px;height:17px;background:#000;display:flex;justify-content:center';
    bar.appendChild(sk.text(title, { color: '#f1d98a' }));
    this.root.appendChild(bar);
    const body = document.createElement('div');
    body.style.cssText = 'position:absolute;left:20px;top:44px;width:366px;height:232px;overflow-y:auto;scrollbar-width:none';
    for (const para of text.split('\n')) {
      for (const l of para.trim() ? sk.wrap(para, 360) : ['']) {
        const row = document.createElement('div');
        row.style.cssText = 'height:17px';
        if (l) row.appendChild(sk.text(l));
        body.appendChild(row);
      }
    }
    this.root.appendChild(body);
    const btn = document.createElement('div');
    btn.title = 'Return to game';
    btn.style.cssText = 'position:absolute;left:154px;top:296px;width:122px;height:20px;cursor:pointer';
    btn.addEventListener('click', () => this.close());
    btn.addEventListener('pointerenter', () => { btn.style.background = '#ffffff22'; });
    btn.addEventListener('pointerleave', () => { btn.style.background = ''; });
    this.root.appendChild(btn);
    this.root.style.display = 'block';
  }

  close(): void { this.isOpen = false; this.root.style.display = 'none'; }
}

/**
 * The loading screen: the original picture `Pack/Loading.g16` (640 x 480) with the bar of `Pack/LoadBar.g16` (170 x 8) filling
 * the empty frame at x 235, y 446.
 */
export class LoadingScreen {
  private readonly root = document.createElement('div');
  private readonly fill = document.createElement('div');

  constructor(base: string) {
    this.root.style.cssText = 'position:fixed;inset:0;background:#000;z-index:50;display:flex;align-items:center;justify-content:center';
    const stage = document.createElement('div');
    stage.style.cssText = `position:relative;width:640px;height:480px;flex:none;background:url(${base}screens/loading.png)`;
    this.fill.style.cssText = `position:absolute;left:235px;top:446px;width:0;height:8px;background:url(${base}screens/loadbar.png)`;
    stage.appendChild(this.fill);
    this.root.appendChild(stage);
    const fit = () => { stage.style.transform = `scale(${Math.min(window.innerWidth / 640, window.innerHeight / 480)})`; };
    window.addEventListener('resize', fit);
    fit();
    document.body.appendChild(this.root);
  }

  /** 0..1 */
  progress(f: number): void { this.fill.style.width = `${Math.round(170 * Math.max(0, Math.min(1, f)))}px`; }

  hide(): void { this.progress(1); this.root.remove(); }
}

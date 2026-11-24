/** Sound effects: numeric id -> converted Ogg (data/sfx.json). Overlapping plays clone the cached element. */
export class Sfx {
  private readonly cache = new Map<number, HTMLAudioElement>();
  private playing = 0;
  enabled = false;
  volume = 0.55;

  constructor(private readonly base: string, private readonly index: Record<string, string>) {}

  play(id: number): void {
    if (!this.enabled || this.playing > 12) return;
    const file = this.index[String(id)];
    if (!file) return;
    let a = this.cache.get(id);
    if (!a) { a = new Audio(`${this.base}${file}`); a.preload = 'auto'; this.cache.set(id, a); }
    const c = a.cloneNode() as HTMLAudioElement;
    c.volume = this.volume;
    this.playing++;
    const done = () => { this.playing = Math.max(0, this.playing - 1); };
    c.addEventListener('ended', done, { once: true });
    c.addEventListener('error', done, { once: true });
    void c.play().catch(done);
  }
}

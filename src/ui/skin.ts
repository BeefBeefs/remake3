/**
 * The original interface art, used from plain DOM. Every GUI bank (`GDI/Graphics/*.b16`, converted to an atlas by
 * tools/convert_assets.py) is a packed PNG plus an id -> [x, y, w, h] table; a "sprite" is a div showing one frame.
 * Text uses the original bitmap font: overlay frame 200 is a 16x16 grid of 16-px cells in Windows-1252 order, and
 * System/Fnt.dat gives each character's advance (data/fonts.json).
 */
import type { AtlasJson } from '../assets/atlas.ts';

export type GuiBank = 'menu' | 'nquest' | 'mapgfx' | 'score' | 'overlay' | 'inventory' | 'hdp';
const BANKS: GuiBank[] = ['menu', 'nquest', 'mapgfx', 'score', 'overlay', 'inventory', 'hdp'];

export interface TextStyle { color?: string; shadow?: boolean }

export class Skin {
  private readonly json = new Map<GuiBank, AtlasJson>();
  private readonly url = new Map<GuiBank, string>();
  private glyphs: HTMLCanvasElement | null = null;
  private widths: number[] = [];

  private constructor(readonly base: string) {}

  static async load(base: string): Promise<Skin> {
    const s = new Skin(base);
    await Promise.all(BANKS.map(async (b) => {
      const j = (await (await fetch(`${base}atlas/gdi/graphics/${b}.json`)).json()) as AtlasJson;
      s.json.set(b, j);
      s.url.set(b, `${base}${j.image}`);
      await new Promise<void>((ok) => { const i = new Image(); i.onload = () => ok(); i.onerror = () => ok(); i.src = `${base}${j.image}`; });
    }));
    s.widths = ((await (await fetch(`${base}data/fonts.json`)).json()) as Record<string, number[]>).Fnt!;
    // glyph sheet: white letters on black -> white letters with alpha, so they can be tinted
    const img = new Image();
    img.src = s.url.get('overlay')!;
    await img.decode();
    const [x, y, w, h] = s.rect('overlay', 200);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.drawImage(img, x, y, w, h, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h);
    for (let i = 0; i < data.data.length; i += 4) {
      const a = Math.max(data.data[i]!, data.data[i + 1]!, data.data[i + 2]!);
      data.data[i] = data.data[i + 1] = data.data[i + 2] = 255;
      data.data[i + 3] = a;
    }
    g.putImageData(data, 0, 0);
    s.glyphs = c;
    return s;
  }

  rect(bank: GuiBank, id: number): [number, number, number, number] {
    const r = this.json.get(bank)?.frames[String(id)];
    if (!r) throw new Error(`gui frame ${bank}/${id} missing`);
    return [r[0], r[1], r[2], r[3]];
  }

  size(bank: GuiBank, id: number): [number, number] {
    const r = this.rect(bank, id);
    return [r[2], r[3]];
  }

  /** A div showing one frame at its natural size, positioned absolutely at (x, y) when given. */
  sprite(bank: GuiBank, id: number, x?: number, y?: number): HTMLDivElement {
    const [fx, fy, w, h] = this.rect(bank, id);
    const [aw, ah] = this.json.get(bank)!.size;
    const d = document.createElement('div');
    d.style.cssText = `width:${w}px;height:${h}px;background:url(${this.url.get(bank)}) -${fx}px -${fy}px / ${aw}px ${ah}px no-repeat;image-rendering:pixelated;flex:none`;
    if (x !== undefined && y !== undefined) { d.style.position = 'absolute'; d.style.left = `${x}px`; d.style.top = `${y}px`; }
    return d;
  }

  /** A frame stretched to w x h (for plain textures such as the stone panel). */
  fill(bank: GuiBank, id: number, w: number, h: number): HTMLDivElement {
    const [fx, fy, fw, fh] = this.rect(bank, id);
    const [aw, ah] = this.json.get(bank)!.size;
    const kx = w / fw, ky = h / fh;
    const d = document.createElement('div');
    d.style.cssText = `width:${w}px;height:${h}px;background:url(${this.url.get(bank)}) -${fx * kx}px -${fy * ky}px / ${aw * kx}px ${ah * ky}px no-repeat;image-rendering:pixelated;flex:none`;
    return d;
  }

  /** Pixel width of a string in the bitmap font. */
  textWidth(s: string): number {
    let w = 0;
    for (const ch of s) w += this.widths[code(ch)] ?? 8;
    return w;
  }

  /** Draws a string with the original font into a canvas (height 16). */
  text(s: string, style: TextStyle = {}): HTMLCanvasElement {
    const w = Math.max(1, this.textWidth(s) + 1);
    const c = document.createElement('canvas');
    c.width = w; c.height = 18;
    c.style.cssText = `width:${w}px;height:18px;image-rendering:pixelated;display:block`;
    const g = c.getContext('2d')!;
    const tint = document.createElement('canvas');
    tint.width = w; tint.height = 16;
    const t = tint.getContext('2d')!;
    let x = 0;
    for (const ch of s) {
      const k = code(ch);
      t.drawImage(this.glyphs!, (k & 15) * 16, (k >> 4) * 16, 16, 16, x, 0, 16, 16);
      x += this.widths[k] ?? 8;
    }
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = style.color ?? '#e9dfb8';
    t.fillRect(0, 0, w, 16);
    if (style.shadow !== false) {
      g.globalAlpha = 0.85;
      g.drawImage(this.tintBlack(tint), 1, 2);
      g.globalAlpha = 1;
    }
    g.drawImage(tint, 0, 1);
    return c;
  }

  private tintBlack(src: HTMLCanvasElement): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /** Word-wraps a message into lines no wider than `max` pixels. */
  wrap(s: string, max: number): string[] {
    const out: string[] = [];
    let line = '';
    for (const word of s.split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (line && this.textWidth(t) > max) { out.push(line); line = word; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }
}

/** Windows-1252 code of a character (the font sheet's order); anything else becomes '?'. */
function code(ch: string): number {
  const c = ch.codePointAt(0) ?? 63;
  return c < 256 ? c : 63;
}

/** A layer that scales 640x480-pixel UI art so the screen's height shows 480 units, like the game camera does. */
export function scaleFactor(): number {
  return window.innerHeight / 480;
}

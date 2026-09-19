/**
 * The temple's carved stone: one painted atlas of relief bands — gavaksha mesh (jala) for the
 * shikhara's latā, a creeper scroll for door jambs, lotus petals, rosettes, a chain-and-bell
 * garland (ghantamala) — and three panels: the sukanasa's great arch, the turtle (kasav) set in the
 * mandapa floor, and the gate's plaque. A height field is painted first; the albedo (with baked
 * cavity grime) and a normal map are derived from it, so the relief catches the low evening sun.
 *
 * Layout: horizontal strips spanning the full width, so any band tiles along u and picks its strip
 * with v. Bands that run vertically (jambs, the latā) lay u up the band; their motifs point +x here.
 */
import { MeshStandardMaterial, Vector2 } from 'three';
import { rng } from './canvasTextures';
import type { ArtContext } from './runtime';

const S = 1024;
/** Pixels kept clear at each strip edge so mip filtering never bleeds into a neighbour. */
const PAD = 5;

export const STRIP = {
  jala: [0, 256],
  scroll: [256, 384],
  lotus: [384, 512],
  rosette: [512, 640],
  chain: [640, 768],
  panel: [768, 1024],
} as const;
export type StripName = keyof typeof STRIP;

/** A strip's v range: [bottom edge, top edge] (canvas rows are flipped into v). */
export function stripV(name: StripName): [number, number] {
  const [r0, r1] = STRIP[name];
  return [1 - (r1 - PAD) / S, 1 - (r0 + PAD) / S];
}

/** The panels' u ranges inside the last strip. */
export const PANEL = { arch: [0.004, 0.246], turtle: [0.254, 0.496], plaque: [0.504, 0.996] } as const;

const DEVANAGARI = '"Kohinoor Devanagari", "Noto Sans Devanagari", "Nirmala UI", "Mangal", "Devanagari Sangam MN", sans-serif';
const PLAQUE_TEXT = '॥ श्री गणेश मंदिर ॥';

/** The shared carved-stone material: albedo × vertex colour (sandstone or basalt), relief normals. */
export function carvedMaterial(a: ArtContext): MeshStandardMaterial {
  return a.kit.custom('temple:carved', () => {
    const h = heightField();
    const albedo = a.bank.canvas('temple:carved-albedo', [S, S], (g) => paintAlbedo(g, h));
    const normal = a.bank.canvas('temple:carved-normal', [S, S], (g) => paintNormal(g, h), false);
    return new MeshStandardMaterial({ map: albedo, normalMap: normal, normalScale: new Vector2(1.15, 1.15), roughness: 0.9, metalness: 0, vertexColors: true });
  });
}

// ---- Height field -----------------------------------------------------------------------------

type P = [number, number];
/** Maps motif space (u = up the motif, w = across it) to canvas pixels. */
type Frame = (u: number, w: number) => P;

const gray = (v: number) => {
  const c = Math.round(Math.min(Math.max(v, 0), 1) * 255);
  return `rgb(${c},${c},${c})`;
};

function shape(g: CanvasRenderingContext2D, pts: P[], f: Frame, v: number): void {
  g.beginPath();
  pts.forEach(([u, w], i) => {
    const [x, y] = f(u, w);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.closePath();
  g.fillStyle = gray(v);
  g.fill();
}

function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, v: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = gray(v);
  g.fill();
}

/** A gavaksha — the horseshoe "window" of Nagara ornament: legs at u = −0.95R, a pointed crown. */
function gavaksha(R: number, n = 36): P[] {
  const pts: P[] = [[-0.95 * R, -0.8 * R]];
  const a0 = (125 * Math.PI) / 180;
  for (let i = 0; i <= n; i++) {
    const th = -a0 + (2 * a0 * i) / n;
    const cusp = 0.42 * R * Math.max(0, 1 - Math.abs(th) / 0.9) ** 2;
    pts.push([R * Math.cos(th) + cusp, R * Math.sin(th)]);
  }
  pts.push([-0.95 * R, 0.8 * R]);
  return pts;
}

/** A pointed petal from its base (u = 0) to its tip (u = len). */
function petal(len: number, half: number, n = 16): P[] {
  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = half * Math.sin(Math.PI * (0.15 + 0.85 * t)) ** 0.8;
    left.push([len * t, -w]);
    right.unshift([len * t, w]);
  }
  return [...left, ...right];
}

function heightField(): Float32Array {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas unavailable');
  g.fillStyle = gray(0.5);
  g.fillRect(0, 0, S, S);
  const clip = (y0: number, h: number, paint: () => void) => {
    g.save();
    g.beginPath();
    g.rect(0, y0, S, h);
    g.clip();
    paint();
    g.restore();
  };
  clip(STRIP.jala[0], 256, () => jala(g, STRIP.jala[0]));
  clip(STRIP.scroll[0], 128, () => scroll(g, STRIP.scroll[0]));
  clip(STRIP.lotus[0], 128, () => lotus(g, STRIP.lotus[0]));
  clip(STRIP.rosette[0], 128, () => rosettes(g, STRIP.rosette[0]));
  clip(STRIP.chain[0], 128, () => chain(g, STRIP.chain[0]));
  clip(STRIP.panel[0], 256, () => panels(g, STRIP.panel[0]));
  const img = g.getImageData(0, 0, S, S).data;
  const h = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) h[i] = img[i * 4] / 255;
  return blur(blur(h, 1), 1);
}

/** Honeycomb of interlocking gavakshas, pointing up the tower (+x). Repeats every 1024 px. */
function jala(g: CanvasRenderingContext2D, y0: number): void {
  g.fillStyle = gray(0.28);
  g.fillRect(0, y0, S, 256);
  const cells: P[] = [];
  for (let c = -1; c <= 16; c++) for (let j = -1; j <= 2; j++) cells.push([c * 64 + 32, y0 + 64 + j * 128 + (c % 2 ? 64 : 0)]);
  const at = (cx: number, cy: number): Frame => (u, w) => [cx + u, cy + w];
  for (const [x, y] of cells) shape(g, gavaksha(43), at(x, y), 0.88);
  for (const [x, y] of cells) shape(g, gavaksha(33), at(x, y), 0.6);
  for (const [x, y] of cells) shape(g, gavaksha(25), at(x, y), 0.1);
  for (const [x, y] of cells) disc(g, x + 5, y, 8, 0.55);
}

/** A creeper (patra-lata) between beaded borders, running up the band (+x). */
function scroll(g: CanvasRenderingContext2D, y0: number): void {
  g.fillStyle = gray(0.36);
  g.fillRect(0, y0, S, 128);
  for (const y of [y0 + 7, y0 + 113]) {
    g.fillStyle = gray(0.72);
    g.fillRect(0, y, S, 8);
    for (let x = 8; x < S + 16; x += 16) disc(g, x, y + 4, 4.5, 0.92);
  }
  const mid = y0 + 64;
  const wave = (x: number) => mid + 22 * Math.sin((2 * Math.PI * x) / 128);
  g.strokeStyle = gray(0.86);
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-8, wave(-8));
  for (let x = -6; x <= S + 8; x += 2) g.lineTo(x, wave(x));
  g.stroke();
  // A curling leaf in each loop of the stem, and a bud at the turn.
  for (let k = 0; k < 17; k++) {
    const x = 32 + k * 64;
    const up = k % 2 === 0 ? 1 : -1;
    const y = wave(x);
    const at: Frame = (u, w) => [x + w * 0.8 - 12, y + up * (u + 6)];
    shape(g, petal(34, 11), at, 0.8);
    g.strokeStyle = gray(0.84);
    g.lineWidth = 4;
    g.beginPath();
    g.arc(x + 14, y + up * 20, 9, 0, Math.PI * 1.5);
    g.stroke();
    disc(g, x - 16, y - up * 14, 5, 0.9);
  }
}

/** Two rows of lotus petals (padma), pointing up, over a bead string. */
function lotus(g: CanvasRenderingContext2D, y0: number): void {
  g.fillStyle = gray(0.4);
  g.fillRect(0, y0, S, 128);
  g.fillStyle = gray(0.7);
  g.fillRect(0, y0 + 6, S, 7);
  const base = y0 + 106;
  for (let x = 0; x <= S + 32; x += 64) shape(g, petal(86, 27), (u, w) => [x + 32 + w, base - u], 0.56);
  for (let x = 0; x <= S; x += 64) {
    shape(g, petal(80, 25), (u, w) => [x + w, base - u], 0.86);
    shape(g, petal(60, 3), (u, w) => [x + w, base - 6 - u], 0.64);
  }
  for (let x = 6; x < S + 12; x += 12) disc(g, x, y0 + 116, 5, 0.82);
}

/** Square panels, each with an eight-petalled rosette (one every 128 px). */
function rosettes(g: CanvasRenderingContext2D, y0: number): void {
  g.fillStyle = gray(0.74);
  g.fillRect(0, y0, S, 128);
  for (let k = 0; k < 8; k++) {
    const cx = k * 128 + 64;
    const cy = y0 + 64;
    g.fillStyle = gray(0.34);
    g.fillRect(cx - 52, cy - 52, 104, 104);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      shape(g, petal(40, 13), (u, w) => [cx + Math.cos(a) * (u + 8) - Math.sin(a) * w, cy + Math.sin(a) * (u + 8) + Math.cos(a) * w], 0.84);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      shape(g, petal(26, 8), (u, w) => [cx + Math.cos(a) * (u + 8) - Math.sin(a) * w, cy + Math.sin(a) * (u + 8) + Math.cos(a) * w], 0.66);
    }
    disc(g, cx, cy, 15, 0.6);
    disc(g, cx, cy, 10, 0.97);
    for (const [dx, dy] of [[-44, -44], [44, -44], [-44, 44], [44, 44]]) disc(g, cx + dx, cy + dy, 5, 0.9);
  }
}

/** Ghantamala: swags of beads with bells on chains, hanging from a fillet. */
function chain(g: CanvasRenderingContext2D, y0: number): void {
  g.fillStyle = gray(0.38);
  g.fillRect(0, y0, S, 128);
  g.fillStyle = gray(0.8);
  g.fillRect(0, y0 + 5, S, 12);
  for (let x = 0; x < S + 8; x += 5) {
    const t = (x % 128) / 128;
    disc(g, x, y0 + 22 + 34 * Math.sin(Math.PI * t), 4.2, 0.86);
  }
  for (let k = 0; k <= 8; k++) {
    const x = k * 128;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse(x, y0 + 26 + i * 11, 4, 6, 0, 0, Math.PI * 2);
      g.strokeStyle = gray(0.85);
      g.lineWidth = 3;
      g.stroke();
    }
    // The bell: a dome with a flared lip, and its clapper.
    shape(g, [[0, -16], [8, -16], [26, -10], [34, -4], [38, 0], [34, 4], [26, 10], [8, 16], [0, 16]], (u, w) => [x + w, y0 + 104 - u], 0.9);
    g.fillStyle = gray(0.7);
    g.fillRect(x - 17, y0 + 101, 34, 4);
    disc(g, x, y0 + 110, 4, 0.8);
  }
}

function panels(g: CanvasRenderingContext2D, y0: number): void {
  // ---- The sukanasa's great arch (0–256 px) ----
  g.fillStyle = gray(0.44);
  g.fillRect(0, y0, 256, 256);
  const up = (cx: number, cy: number): Frame => (u, w) => [cx + w, cy - u];
  for (const x of [34, 222]) {
    shape(g, gavaksha(30), up(x, y0 + 214), 0.8);
    shape(g, gavaksha(20), up(x, y0 + 214), 0.18);
  }
  const ac = up(128, y0 + 150);
  shape(g, gavaksha(80), ac, 0.86);
  shape(g, gavaksha(70), ac, 0.56);
  shape(g, gavaksha(61), ac, 0.9);
  shape(g, gavaksha(50), ac, 0.16);
  disc(g, 128, y0 + 142, 34, 0.74);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    shape(g, petal(26, 9), (u, w) => [128 + Math.cos(a) * (u + 6) - Math.sin(a) * w, y0 + 142 + Math.sin(a) * (u + 6) + Math.cos(a) * w], 0.93);
  }
  disc(g, 128, y0 + 142, 8, 1);

  // ---- The turtle (kasav) in the mandapa floor, head toward the sanctum (256–512 px) ----
  const tx = 384;
  const ty = y0 + 128;
  g.fillStyle = gray(0.5);
  g.fillRect(256, y0, 256, 256);
  g.beginPath();
  g.arc(tx, ty, 116, 0, Math.PI * 2);
  g.strokeStyle = gray(0.62);
  g.lineWidth = 7;
  g.stroke();
  const limb = (x: number, y: number, rx: number, ry: number, rot: number) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fillStyle = gray(0.76);
    g.fill();
  };
  limb(tx - 50, ty - 40, 26, 12, 0.7);
  limb(tx + 50, ty - 40, 26, 12, -0.7);
  limb(tx - 46, ty + 46, 22, 11, -0.6);
  limb(tx + 46, ty + 46, 22, 11, 0.6);
  limb(tx, ty - 72, 15, 22, 0);
  shape(g, [[0, -7], [-18, 0], [0, 7]], (u, w) => [tx + w, ty + 70 - u], 0.72);
  g.beginPath();
  g.ellipse(tx, ty, 50, 62, 0, 0, Math.PI * 2);
  g.fillStyle = gray(0.9);
  g.fill();
  g.strokeStyle = gray(0.68);
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(tx, ty, 50, 62, 0, 0, Math.PI * 2);
  g.stroke();
  // Scutes: a hexagon in the middle, and rays out to the rim.
  const hex: P[] = [];
  for (let i = 0; i < 6; i++) hex.push([tx + Math.cos((i / 6) * Math.PI * 2) * 20, ty + Math.sin((i / 6) * Math.PI * 2) * 24]);
  g.beginPath();
  hex.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.stroke();
  for (const [x, y] of hex) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(tx + (x - tx) * 2.45, ty + (y - ty) * 2.5);
    g.stroke();
  }

  // ---- The gate's plaque (512–1024 px) ----
  g.fillStyle = gray(0.5);
  g.fillRect(512, y0, 512, 256);
  g.fillStyle = gray(0.86);
  roundRect(g, 524, y0 + 12, 488, 232, 22);
  g.fillStyle = gray(0.6);
  roundRect(g, 546, y0 + 34, 444, 188, 14);
  for (const [x, y] of [[540, y0 + 28], [996, y0 + 28], [540, y0 + 228], [996, y0 + 228]]) disc(g, x, y, 8, 0.95);
  g.fillStyle = gray(0.22);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 70px ${DEVANAGARI}`;
  g.fillText(PLAQUE_TEXT, 768, y0 + 132, 420);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

/** Separable box blur; wraps in x (the strips tile), clamps in y. */
function blur(src: Float32Array, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = r * 2 + 1;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[y * S + ((x + k + S) % S)];
      tmp[y * S + x] = s / n;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(Math.max(y + k, 0), S - 1) * S + x];
      out[y * S + x] = s / n;
    }
  }
  return out;
}

// ---- Albedo and normals -------------------------------------------------------------------------

function paintAlbedo(g: CanvasRenderingContext2D, h: Float32Array): void {
  const wide = blur(blur(h, 6), 6);
  const img = g.createImageData(S, S);
  const r = rng(808);
  for (let i = 0; i < h.length; i++) {
    // Raised edges worn pale, hollows holding grime; a fine grain over all of it.
    const cav = Math.min(Math.max(0.5 + (h[i] - wide[i]) * 3.2, 0), 1);
    const k = (0.66 + 0.34 * h[i]) * (0.78 + 0.34 * cav) * (0.94 + r() * 0.1);
    img.data[i * 4] = Math.min(255, 232 * k);
    img.data[i * 4 + 1] = Math.min(255, 222 * k);
    img.data[i * 4 + 2] = Math.min(255, 204 * k);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // The plaque's letters are picked out in vermilion, its frame in faded saffron.
  const y0 = STRIP.panel[0];
  g.globalCompositeOperation = 'multiply';
  g.strokeStyle = '#e2a25a';
  g.lineWidth = 16;
  g.strokeRect(535, y0 + 23, 466, 210);
  g.fillStyle = '#c23a1e';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 70px ${DEVANAGARI}`;
  g.fillText(PLAQUE_TEXT, 768, y0 + 132, 420);
  g.globalCompositeOperation = 'source-over';
}

function paintNormal(g: CanvasRenderingContext2D, h: Float32Array): void {
  const img = g.createImageData(S, S);
  const k = 5.5;
  for (let y = 0; y < S; y++) {
    const yu = Math.max(y - 1, 0);
    const yd = Math.min(y + 1, S - 1);
    for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
      // Canvas rows run down; v (and the normal map's green) runs up.
      const dy = h[yd * S + x] - h[yu * S + x];
      let nx = -dx * k;
      let ny = dy * k;
      const l = Math.hypot(nx, ny, 1);
      nx /= l;
      ny /= l;
      const i = (y * S + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (0.5 / l + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

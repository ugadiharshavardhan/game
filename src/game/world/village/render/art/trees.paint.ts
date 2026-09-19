/**
 * The vegetation atlas: every plant the shared leaf atlas doesn't cover, painted once on a canvas —
 * the peepal's heart-shaped leaves, the field crops (bajra, jowar, sugarcane, brinjal, chilli,
 * greens), the Ganeshotsav flowers (marigold, terda balsam, hibiscus), monsoon wildflowers,
 * colocasia by the water and seeding grass for the verges.
 *
 * One texture, so all of it is drawn by one instanced mesh. Plants stand on the bottom edge of
 * their cell (v0) and grow toward its top. Every cell is painted with a faint blurred halo of its
 * own colours, so bilinear filtering at alpha-tested edges blends toward leaf colour, not black.
 */
import type { CanvasTexture } from 'three';
import { rng } from './canvasTextures';
import type { TextureBank } from './textures';
import type { Cell } from './trees.gpu';

const SIZE = 1024;

/** Canvas rectangles [x, y, w, h] of each plant (y down, as painted). */
const RECTS = {
  peepal: [0, 0, 512, 512],
  bajra: [512, 0, 128, 512],
  jowar: [640, 0, 128, 512],
  cane: [768, 0, 128, 512],
  tallGrass: [896, 0, 128, 512],
  marigold: [0, 512, 256, 256],
  brinjal: [256, 512, 256, 256],
  chilli: [512, 512, 256, 256],
  greens: [768, 512, 256, 256],
  sonki: [0, 768, 256, 256],
  balsam: [256, 768, 256, 256],
  colocasia: [512, 768, 256, 256],
  hibiscus: [768, 768, 128, 128],
  fallen: [896, 768, 128, 128],
  durva: [768, 896, 256, 128],
} as const;

export type Plant = keyof typeof RECTS;

/** UV rectangle of a plant in the atlas (CanvasTexture flips y: v = 1 at the canvas top). */
export const VEG: Record<Plant, Cell> = Object.fromEntries(
  Object.entries(RECTS).map(([k, [x, y, w, h]]) => [k, { u: x / SIZE, v: 1 - (y + h) / SIZE, w: w / SIZE, h: h / SIZE }]),
) as Record<Plant, Cell>;

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;
type G = CanvasRenderingContext2D;
type R = () => number;

export function vegAtlas(bank: TextureBank): CanvasTexture {
  return bank.canvas('trees:veg-atlas', [SIZE, SIZE], (g) => {
    const layer = document.createElement('canvas');
    layer.width = layer.height = SIZE;
    const p = layer.getContext('2d');
    if (!p) throw new Error('2D canvas unavailable');
    const cell = (name: Plant, paint: (g: G, w: number, h: number, r: R) => void, seed: number) => {
      const [x, y, w, h] = RECTS[name];
      p.save();
      p.translate(x, y);
      p.beginPath();
      p.rect(3, 3, w - 6, h - 6);
      p.clip();
      paint(p, w, h, rng(seed));
      p.restore();
    };
    cell('peepal', peepal, 101);
    cell('bajra', (g, w, h, r) => millet(g, w, h, r, false), 102);
    cell('jowar', (g, w, h, r) => millet(g, w, h, r, true), 103);
    cell('cane', sugarcane, 104);
    cell('tallGrass', tallGrass, 105);
    cell('marigold', marigold, 106);
    cell('brinjal', brinjal, 107);
    cell('chilli', chilli, 108);
    cell('greens', greens, 109);
    cell('sonki', sonki, 110);
    cell('balsam', balsam, 111);
    cell('colocasia', colocasia, 112);
    cell('hibiscus', hibiscusBloom, 113);
    cell('fallen', fallenLeaves, 114);
    cell('durva', durva, 115);
    // Colour halo under the sharp layer (stays below the alpha-test threshold).
    g.clearRect(0, 0, SIZE, SIZE);
    g.filter = 'blur(3px)';
    g.globalAlpha = 0.34;
    g.drawImage(layer, 0, 0);
    g.filter = 'none';
    g.globalAlpha = 1;
    g.drawImage(layer, 0, 0);
  }, true, false);
}

// ---- drawing primitives -----------------------------------------------------------------------

/**
 * A strap leaf (grass, millet, cane) from (x, y), heading `ang` (0 = up, + = right), turning by
 * `bend` radians over its length — negative-and-outward bends make it arch over and droop.
 */
function strap(g: G, x: number, y: number, ang: number, len: number, wid: number, bend: number, fill: string, rib?: string): [number, number] {
  const n = 16;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const mid: [number, number][] = [];
  let px = x;
  let py = y;
  let a = ang;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = (wid / 2) * (0.55 + 0.45 * Math.sin(Math.min(t * 3, 1) * Math.PI * 0.5)) * (1 - t ** 1.6);
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    left.push([px - nx * w, py - ny * w]);
    right.push([px + nx * w, py + ny * w]);
    mid.push([px, py]);
    px += Math.sin(a) * (len / n);
    py -= Math.cos(a) * (len / n);
    a += bend / n;
  }
  g.beginPath();
  g.moveTo(left[0][0], left[0][1]);
  for (const q of left) g.lineTo(q[0], q[1]);
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (rib) {
    g.strokeStyle = rib;
    g.lineWidth = Math.max(wid * 0.12, 0.8);
    g.beginPath();
    mid.slice(0, n - 2).forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
    g.stroke();
  }
  return [px, py];
}

/** An ovate leaf with a midrib, pointing along `ang` from its base at (x, y). */
function oval(g: G, x: number, y: number, ang: number, len: number, wid: number, fill: string, vein: string, wavy = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const w = wid * Math.sin(Math.PI * t ** 0.8) * (1 + wavy * Math.sin(t * 19));
    g.lineTo(w, -len * t);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const w = wid * Math.sin(Math.PI * t ** 0.8) * (1 + wavy * Math.cos(t * 17));
    g.lineTo(-w, -len * t);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = vein;
  g.lineWidth = Math.max(len * 0.035, 0.7);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -len * 0.92);
  g.stroke();
  g.restore();
}

/** The peepal's leaf: a heart with a long drip tip. Base at (x, y), tip along `ang`. */
function heartLeaf(g: G, x: number, y: number, ang: number, s: number, fill: string, vein: string) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(s * 0.5, s * 0.16, s * 0.56, -s * 0.46, s * 0.14, -s * 0.74);
  g.quadraticCurveTo(s * 0.03, -s * 0.86, 0, -s * 1.12);
  g.quadraticCurveTo(-s * 0.03, -s * 0.86, -s * 0.14, -s * 0.74);
  g.bezierCurveTo(-s * 0.56, -s * 0.46, -s * 0.5, s * 0.16, 0, 0);
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = vein;
  g.lineWidth = Math.max(s * 0.03, 0.6);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -s * 0.95);
  for (const t of [0.2, 0.4, 0.6]) {
    for (const side of [-1, 1]) {
      g.moveTo(0, -s * t);
      g.quadraticCurveTo(side * s * 0.2, -s * (t + 0.05), side * s * 0.34, -s * (t + 0.16));
    }
  }
  g.stroke();
  g.restore();
}

function line(g: G, pts: [number, number][], width: number, colour: string) {
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
  g.stroke();
}

function dot(g: G, x: number, y: number, r: number, fill: string) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

/** A flower of `n` rounded petals facing the viewer. */
function bloom(g: G, x: number, y: number, r: number, n: number, petal: string, centre: string, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = petal;
  for (let i = 0; i < n; i++) {
    g.rotate((Math.PI * 2) / n);
    g.beginPath();
    g.ellipse(0, -r * 0.55, r * 0.3, r * 0.52, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  dot(g, x, y, r * 0.28, centre);
}

// ---- plants -------------------------------------------------------------------------------------

/** Heart-shaped leaves on long, fluttering petioles, gathered round a few twigs. */
function peepal(g: G, w: number, h: number, r: R) {
  const cx = w / 2;
  const cy = h / 2;
  // Twigs first, so leaves sit over them.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.5;
    const len = w * (0.25 + r() * 0.15);
    line(g, [[cx, cy], [cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.5 + 6], [cx + Math.cos(a) * len, cy + Math.sin(a) * len]], 2.6, hsl(25, 25, 32));
  }
  for (let i = 0; i < 118; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * w * 0.38;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.92;
    const light = 1 - y / h;
    const young = r() < 0.07;
    const s = w * (0.085 + r() * 0.035);
    // Leaves hang outward and a little down from the petiole's end.
    const tipAng = a + Math.PI / 2 + (r() - 0.5) * 1.2 + 0.35;
    const px = x + Math.cos(tipAng - Math.PI / 2) * s * 0.35;
    const py = y + Math.sin(tipAng - Math.PI / 2) * s * 0.35;
    line(g, [[x, y], [px, py]], 1.2, hsl(60, 25, 40));
    const fill = young ? hsl(12 + r() * 16, 42 + r() * 12, 42 + r() * 8) : hsl(86 + r() * 18, 36 + r() * 18, 27 + light * 16 + r() * 7);
    heartLeaf(g, px, py, tipAng, s, fill, hsl(75, 30, 55, 0.55));
  }
}

/** Bajra (pearl millet, candle-like spike) or jowar (sorghum, compact grain head). */
function millet(g: G, w: number, h: number, r: R, jowar: boolean) {
  const stalks = jowar ? [0] : [0, -1, 1];
  for (const k of stalks) {
    const main = k === 0;
    const bx = w / 2 + k * 9;
    const top = main ? h * 0.1 : h * (0.2 + r() * 0.1);
    const lean = main ? (r() - 0.5) * 8 : k * (10 + r() * 8);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push([bx + lean * t * t, h - 4 - (h - 4 - top) * t]);
    }
    const lw = main ? (jowar ? 5 : 4) : 3;
    // Leaves from the nodes, alternating; the lowest are yellowing.
    const nodes = main ? 7 : 4;
    for (let i = 0; i < nodes; i++) {
      const t = 0.12 + (i / nodes) * 0.7;
      const [x, y] = pts[Math.round(t * 8)];
      const side = i % 2 ? 1 : -1;
      const dry = i < 2 && r() < 0.7;
      const len = h * (jowar ? 0.42 : 0.38) * (1 - t * 0.35) * (0.85 + r() * 0.3);
      const fill = dry ? hsl(42 + r() * 10, 38, 48 + r() * 8) : hsl(88 + r() * 16, 36 + r() * 16, 30 + t * 12 + r() * 6);
      strap(g, x, y, side * (0.28 + r() * 0.3), len, jowar ? 15 : 11, side * (1.5 + r() * 0.8), fill, jowar ? hsl(70, 25, 75, 0.8) : hsl(80, 30, 55, 0.6));
    }
    line(g, pts, lw, hsl(70, 28, 40));
    for (let i = 1; i < 8; i++) dot(g, pts[i][0], pts[i][1], lw * 0.6, hsl(50, 30, 34));
    const [tx, ty] = pts[8];
    if (jowar) {
      // A compact oval panicle of cream and rust grain.
      for (let i = 0; i < 90; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r());
        dot(g, tx + Math.cos(a) * d * 11, ty - 22 + Math.sin(a) * d * 26, 2.6 + r() * 1.2, r() < 0.4 ? hsl(28, 45, 38 + r() * 10) : hsl(44, 40, 62 + r() * 12));
      }
    } else {
      // The candle: a cylindrical spike, bristly and grey-tan.
      const sl = main ? 64 : 44;
      g.fillStyle = hsl(46, 22, 44);
      g.beginPath();
      g.ellipse(tx, ty - sl / 2 + 4, main ? 6.5 : 5, sl / 2, 0, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 70; i++) dot(g, tx + (r() - 0.5) * 12, ty + 4 - r() * sl, 1.1, r() < 0.5 ? hsl(60, 20, 60) : hsl(40, 25, 32));
    }
  }
}

/** A clump of sugarcane: jointed purple-green canes, long arching blades, dry leaves low down. */
function sugarcane(g: G, w: number, h: number, r: R) {
  const canes = 5;
  const tops: [number, number][] = [];
  for (let c = 0; c < canes; c++) {
    const bx = w / 2 + (c - (canes - 1) / 2) * 7 + (r() - 0.5) * 4;
    const top = h * (0.36 + r() * 0.14);
    const lean = (c - (canes - 1) / 2) * (4 + r() * 5);
    const purple = r() < 0.5;
    const col = purple ? hsl(330 + r() * 15, 22, 34) : hsl(62, 32, 44);
    let y = h - 3;
    let seg = 0;
    while (y > top) {
      const len = 26 + r() * 10;
      const t0 = (h - y) / (h - top);
      const t1 = Math.min((h - y + len) / (h - top), 1);
      const x0 = bx + lean * t0 * t0;
      const x1 = bx + lean * t1 * t1;
      line(g, [[x0, y], [x1, y - len]], 7, col);
      // Node ring and the waxy band above it.
      line(g, [[x1 - 4, y - len], [x1 + 4, y - len]], 2.2, hsl(35, 30, 24));
      line(g, [[x1 - 3.5, y - len - 3], [x1 + 3.5, y - len - 3]], 1.4, hsl(70, 15, 72, 0.7));
      // Dry leaf sheaths hang from the lower joints.
      if (seg < 4 && r() < 0.55) strap(g, x1, y - len, (r() < 0.5 ? -1 : 1) * (1.8 + r() * 0.8), 50 + r() * 50, 7, 0.4, hsl(36, 34, 46 + r() * 10));
      y -= len;
      seg++;
    }
    tops.push([bx + lean, top]);
  }
  // The green crown: blades fanning from each cane's top, arching over.
  for (const [tx, ty] of tops) {
    for (let i = 0; i < 7; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const up = i < 2;
      strap(g, tx, ty + 10 + r() * 30, side * (up ? r() * 0.3 : 0.35 + r() * 0.6), h * (up ? 0.3 : 0.4 + r() * 0.2), 7.5, side * (up ? 0.4 : 1.6 + r() * 1.2), hsl(84 + r() * 18, 34 + r() * 14, 30 + r() * 12), hsl(80, 25, 60, 0.6));
    }
  }
}

/** Monsoon grass gone to seed: fine blades and feathery heads, for verges and field edges. */
function tallGrass(g: G, w: number, h: number, r: R) {
  for (let i = 0; i < 34; i++) {
    const x = w / 2 + (r() - 0.5) * w * 0.4;
    const side = r() < 0.5 ? -1 : 1;
    strap(g, x, h - 2, side * r() * 0.35, h * (0.25 + r() * 0.45), 4 + r() * 3, side * (0.3 + r() * 1.4), hsl(64 + r() * 26, 30 + r() * 18, 30 + r() * 20));
  }
  for (let i = 0; i < 7; i++) {
    const x0 = w / 2 + (r() - 0.5) * 20;
    const lean = (r() - 0.5) * 50;
    const top = h * (0.05 + r() * 0.25);
    const pts: [number, number][] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push([x0 + lean * t * t, h - 2 - (h - 2 - top) * t]);
    }
    line(g, pts, 1.6, hsl(50, 30, 50));
    // Feathery seed head.
    const [hx, hy] = pts[6];
    for (let k = 0; k < 40; k++) {
      const t = r();
      const bx = hx - lean * 0.12 * t;
      const by = hy + t * 60;
      line(g, [[bx, by], [bx + (r() - 0.5) * 14, by - 6 - r() * 6]], 1, hsl(40 + r() * 15, 30, 62 + r() * 15));
    }
  }
}

/** A marigold plant: feathery dark leaves under a crowd of orange and yellow pompoms. */
function marigold(g: G, w: number, h: number, r: R) {
  for (let i = 0; i < 90; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6;
    const d = r() * w * 0.36;
    const x = w / 2 + Math.cos(a) * d;
    const y = h * 0.95 + Math.sin(a) * d * 1.2;
    oval(g, x, y, a + Math.PI / 2 + (r() - 0.5), 14 + r() * 12, 3 + r() * 2, hsl(100 + r() * 20, 40, 20 + r() * 12), hsl(95, 30, 35, 0.5));
  }
  for (let i = 0; i < 13; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
    const d = w * (0.12 + r() * 0.26);
    const x = w / 2 + Math.cos(a) * d;
    const y = h * 0.62 + Math.sin(a) * d * 0.9;
    const rad = 14 + r() * 8;
    const yellow = r() < 0.35;
    line(g, [[x, y], [x + (r() - 0.5) * 8, h * 0.95]], 2, hsl(95, 35, 28));
    dot(g, x, y, rad, yellow ? hsl(42, 90, 46) : hsl(26, 90, 44));
    for (let k = 0; k < 34; k++) {
      const aa = r() * Math.PI * 2;
      const dd = Math.sqrt(r()) * rad * 0.9;
      dot(g, x + Math.cos(aa) * dd, y + Math.sin(aa) * dd, rad * (0.16 + r() * 0.1), yellow ? hsl(46 + r() * 8, 95, 52 + r() * 12) : hsl(28 + r() * 10, 95, 48 + r() * 12));
    }
    dot(g, x, y - rad * 0.1, rad * 0.22, yellow ? hsl(38, 85, 40) : hsl(18, 85, 34));
  }
}

/** Brinjal: broad grey-green leaves, glossy purple fruit, lavender star flowers. */
function brinjal(g: G, w: number, h: number, r: R) {
  line(g, [[w / 2, h - 2], [w / 2 + 4, h * 0.35]], 5, hsl(300, 15, 30));
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6;
    const d = w * (0.05 + r() * 0.3);
    const x = w / 2 + Math.cos(a) * d * 0.6;
    const y = h * 0.8 + Math.sin(a) * d * 1.3;
    oval(g, x, y, a + Math.PI / 2 + (r() - 0.5) * 0.8, 44 + r() * 26, 17 + r() * 7, hsl(95 + r() * 20, 22 + r() * 10, 30 + r() * 10), hsl(290, 20, 45, 0.6), 0.08);
  }
  for (let i = 0; i < 4; i++) {
    const x = w * (0.3 + r() * 0.4);
    const y = h * (0.5 + r() * 0.25);
    g.save();
    g.translate(x, y);
    g.rotate((r() - 0.5) * 0.8);
    g.fillStyle = hsl(290, 45, 16);
    g.beginPath();
    g.ellipse(0, 18, 11, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hsl(290, 30, 52, 0.7);
    g.beginPath();
    g.ellipse(-4, 12, 3, 9, 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hsl(100, 35, 30);
    g.beginPath();
    g.moveTo(-10, 0);
    g.lineTo(0, 8);
    g.lineTo(10, 0);
    g.lineTo(0, -4);
    g.fill();
    g.restore();
  }
  for (let i = 0; i < 5; i++) bloom(g, w * (0.25 + r() * 0.5), h * (0.3 + r() * 0.3), 7, 5, hsl(270, 45, 72), hsl(50, 90, 55));
}

/** Chilli: a bushy plant of small glossy leaves hung with red and green pods. */
function chilli(g: G, w: number, h: number, r: R) {
  for (let i = 0; i < 5; i++) line(g, [[w / 2, h - 2], [w / 2 + (r() - 0.5) * w * 0.6, h * (0.35 + r() * 0.2)]], 2.5, hsl(95, 30, 28));
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.8;
    const d = w * (0.06 + r() * 0.34);
    const x = w / 2 + Math.cos(a) * d;
    const y = h * 0.68 + Math.sin(a) * d * 0.8;
    oval(g, x, y, a + Math.PI / 2 + (r() - 0.5), 18 + r() * 12, 5 + r() * 3, hsl(105 + r() * 15, 45, 20 + r() * 12), hsl(100, 30, 40, 0.5));
  }
  for (let i = 0; i < 14; i++) {
    const x = w * (0.22 + r() * 0.56);
    const y = h * (0.4 + r() * 0.35);
    const red = r() < 0.55;
    const c = red ? hsl(4 + r() * 6, 80, 38 + r() * 8) : hsl(100, 50, 30);
    const sway = (r() - 0.5) * 10;
    line(g, [[x, y], [x + sway * 0.4, y + 14], [x + sway, y + 30]], 4.2, c);
  }
  for (let i = 0; i < 6; i++) bloom(g, w * (0.25 + r() * 0.5), h * (0.35 + r() * 0.3), 5, 5, hsl(60, 20, 94), hsl(60, 60, 60));
}

/** Leafy greens (palak, methi): a low rosette of round, bright leaves. */
function greens(g: G, w: number, h: number, r: R) {
  for (let i = 0; i < 34; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.4;
    const len = h * (0.22 + r() * 0.3);
    const x = w / 2 + (r() - 0.5) * w * 0.3;
    oval(g, x, h - 2, a + Math.PI / 2, len, len * 0.33, hsl(92 + r() * 18, 45 + r() * 15, 28 + r() * 16), hsl(85, 35, 60, 0.6), 0.04);
  }
}

/** Sonki and tridax: the yellow daisies that cover the Sahyadri meadows in September. */
function sonki(g: G, w: number, h: number, r: R) {
  for (let i = 0; i < 18; i++) {
    const side = r() < 0.5 ? -1 : 1;
    strap(g, w / 2 + (r() - 0.5) * w * 0.4, h - 2, side * r() * 0.5, h * (0.2 + r() * 0.2), 6, side * r() * 1.2, hsl(90 + r() * 20, 35, 26 + r() * 12));
  }
  for (let i = 0; i < 16; i++) {
    const x0 = w / 2 + (r() - 0.5) * w * 0.3;
    const x = w * (0.12 + r() * 0.76);
    const y = h * (0.12 + r() * 0.5);
    line(g, [[x0, h - 2], [(x0 + x) / 2, (h + y) / 2], [x, y]], 1.6, hsl(95, 30, 32));
    bloom(g, x, y, 10 + r() * 5, 8, hsl(46 + r() * 6, 92, 52 + r() * 8), hsl(32, 80, 32), r() * 2);
  }
}

/** Terda (garden balsam): upright stems with narrow leaves and pink, magenta and white flowers. */
function balsam(g: G, w: number, h: number, r: R) {
  const colours = [hsl(338, 72, 60), hsl(350, 65, 52), hsl(345, 40, 90), hsl(330, 60, 46)];
  for (let s = 0; s < 4; s++) {
    const x0 = w / 2 + (s - 1.5) * 16;
    const top = h * (0.1 + r() * 0.2);
    const lean = (s - 1.5) * 12;
    const col = colours[Math.floor(r() * colours.length)];
    line(g, [[x0, h - 2], [x0 + lean * 0.5, (h + top) / 2], [x0 + lean, top]], 3.5, hsl(100, 30, 45));
    for (let k = 0; k < 9; k++) {
      const t = 0.15 + k * 0.09;
      const x = x0 + lean * t;
      const y = h - 2 - (h - 2 - top) * t;
      const side = k % 2 ? 1 : -1;
      oval(g, x, y, side * (0.7 + r() * 0.5), 30 + r() * 14, 6, hsl(105, 40, 28 + r() * 10), hsl(100, 30, 50, 0.5));
      if (k > 2) bloom(g, x - side * 6, y + 4, 7 + r() * 3, 5, col, hsl(50, 80, 70), r() * 2);
    }
  }
}

/** Colocasia (alu): big arrow-heart leaves on long stalks, by wells and the tank. */
function colocasia(g: G, w: number, h: number, r: R) {
  for (let i = 0; i < 5; i++) {
    const tx = w * (0.2 + r() * 0.6);
    const ty = h * (0.2 + r() * 0.3);
    line(g, [[w / 2 + (r() - 0.5) * 16, h - 2], [tx, ty + 20]], 4, hsl(90, 30, 40));
    // Peltate blade, tip hanging down.
    heartLeaf(g, tx, ty, Math.PI + (r() - 0.5) * 0.9, w * (0.3 + r() * 0.08), hsl(110 + r() * 15, 38, 22 + r() * 10), hsl(90, 25, 58, 0.6));
  }
}

/** A single red hibiscus (jaswand) — Ganesha's own flower. */
function hibiscusBloom(g: G, w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  const rad = w * 0.44;
  for (let i = 0; i < 5; i++) {
    g.save();
    g.translate(cx, cy);
    g.rotate((i / 5) * Math.PI * 2 + 0.3);
    const grad = g.createLinearGradient(0, 0, 0, -rad);
    grad.addColorStop(0, hsl(350, 80, 18));
    grad.addColorStop(0.3, hsl(355, 85, 38));
    grad.addColorStop(1, hsl(358, 80, 48));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(rad * 0.75, -rad * 0.3, rad * 0.55, -rad * 1.05, 0, -rad * 0.95);
    g.bezierCurveTo(-rad * 0.55, -rad * 1.05, -rad * 0.75, -rad * 0.3, 0, 0);
    g.fill();
    g.restore();
  }
  line(g, [[cx, cy], [cx + rad * 0.45, cy - rad * 0.55]], 3, hsl(350, 60, 55));
  for (let i = 0; i < 8; i++) dot(g, cx + rad * (0.38 + i * 0.012), cy - rad * (0.48 + i * 0.012), 2.2, hsl(48, 90, 58));
}

/** Leaf litter: dry fallen leaves under the big trees. */
function fallenLeaves(g: G, w: number, h: number, r: R) {
  for (let i = 0; i < 26; i++) {
    const x = w * (0.1 + r() * 0.8);
    const y = h * (0.1 + r() * 0.8);
    oval(g, x, y, r() * Math.PI * 2, 14 + r() * 10, 5 + r() * 3, hsl(28 + r() * 20, 35 + r() * 20, 30 + r() * 20), hsl(30, 30, 20, 0.5));
  }
}

/** Durva grass: fine creeping blades, low and bright. */
function durva(g: G, w: number, h: number, r: R) {
  for (let i = 0; i < 60; i++) {
    const x = w * (0.05 + r() * 0.9);
    const side = r() < 0.5 ? -1 : 1;
    strap(g, x, h - 2, side * (0.2 + r() * 0.7), h * (0.2 + r() * 0.55), 4, side * r() * 0.8, hsl(85 + r() * 20, 40 + r() * 15, 28 + r() * 14));
  }
}

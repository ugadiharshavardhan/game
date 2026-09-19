/**
 * Procedurally painted textures — foliage, rangoli, signs, cloth, flame. Painted once at load on a
 * 2D canvas: zero download cost, full art direction. Deterministic (seeded), so every run matches.
 */
import type { CanvasTexture } from 'three';
import type { TextureBank } from './textures';

export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEVANAGARI = '"Kohinoor Devanagari", "Noto Sans Devanagari", "Nirmala UI", "Mangal", "Devanagari Sangam MN", sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

// ---- Foliage --------------------------------------------------------------------------------

/** One leaf, drawn pointing along +y from the origin. */
function leaf(g: CanvasRenderingContext2D, len: number, wid: number, fill: string, vein: string, tip = 0.5) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid, len * 0.25, wid * 0.9, len * (1 - tip * 0.4), 0, len);
  g.bezierCurveTo(-wid * 0.9, len * (1 - tip * 0.4), -wid, len * 0.25, 0, 0);
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = vein;
  g.lineWidth = Math.max(len * 0.03, 0.6);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, len * 0.92);
  g.stroke();
}

type Species = 'neem' | 'mango' | 'banyan' | 'shrub';

/** A leafy cluster filling a square cell, dense in the middle and ragged at the edges. */
function leafCluster(g: CanvasRenderingContext2D, x0: number, y0: number, size: number, species: Species, seed: number) {
  const r = rng(seed);
  const cx = x0 + size / 2;
  const cy = y0 + size / 2;
  const count = { neem: 420, mango: 150, banyan: 190, shrub: 260 }[species];
  g.save();
  g.beginPath();
  g.rect(x0, y0, size, size);
  g.clip();
  for (let i = 0; i < count; i++) {
    // Gaussian-ish scatter: most leaves near the middle.
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * size * 0.46 * (0.75 + 0.25 * r());
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.92;
    // Upper leaves catch the sky: lighter.
    const light = 1 - (y - y0) / size;
    g.save();
    g.translate(x, y);
    g.rotate(a + Math.PI / 2 + (r() - 0.5) * 1.6);
    if (species === 'neem') {
      const l = size * (0.05 + r() * 0.03);
      leaf(g, l, l * 0.18, hsl(88 + r() * 16, 42 + r() * 18, 24 + light * 16 + r() * 8), hsl(80, 30, 40, 0.5), 0.9);
    } else if (species === 'mango') {
      const l = size * (0.12 + r() * 0.06);
      const young = r() < 0.08;
      leaf(g, l, l * 0.2, young ? hsl(18 + r() * 12, 45, 34 + light * 10) : hsl(105 + r() * 18, 45 + r() * 15, 17 + light * 14 + r() * 6), hsl(90, 25, 38, 0.6), 0.7);
    } else if (species === 'banyan') {
      const l = size * (0.08 + r() * 0.04);
      leaf(g, l, l * 0.42, hsl(95 + r() * 20, 38 + r() * 18, 20 + light * 16 + r() * 7), hsl(85, 25, 42, 0.55), 0.35);
    } else {
      const l = size * (0.05 + r() * 0.03);
      leaf(g, l, l * 0.38, hsl(100 + r() * 20, 40 + r() * 15, 20 + light * 14 + r() * 8), hsl(90, 25, 40, 0.5), 0.5);
      if (r() < 0.07) hibiscus(g, l * 0.9, r);
    }
    g.restore();
  }
  g.restore();
}

function hibiscus(g: CanvasRenderingContext2D, s: number, r: () => number) {
  g.save();
  g.translate(0, s * 0.8);
  for (let p = 0; p < 5; p++) {
    g.rotate((Math.PI * 2) / 5);
    g.beginPath();
    g.ellipse(0, s * 0.35, s * 0.26, s * 0.38, 0, 0, Math.PI * 2);
    g.fillStyle = hsl(354 + r() * 8, 78, 42 + r() * 8);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, s * 0.08, 0, Math.PI * 2);
  g.fillStyle = hsl(48, 90, 60);
  g.fill();
  g.restore();
}

/** 2×2 atlas: neem · mango / banyan-peepal · flowering shrub. UV quadrant per species. */
export function leafAtlas(bank: TextureBank): CanvasTexture {
  return bank.canvas('leaf-atlas', [1024, 1024], (g) => {
    g.clearRect(0, 0, 1024, 1024);
    leafCluster(g, 0, 0, 512, 'neem', 11);
    leafCluster(g, 512, 0, 512, 'mango', 12);
    leafCluster(g, 0, 512, 512, 'banyan', 13);
    leafCluster(g, 512, 512, 512, 'shrub', 14);
  }, true, false);
}

export const LEAF_QUAD: Record<Species, [number, number]> = { neem: [0, 0.5], mango: [0.5, 0.5], banyan: [0, 0], shrub: [0.5, 0] };

/** A coconut palm frond: rachis up the middle, leaflets swept toward the tip. Base at the bottom. */
export function palmFrond(bank: TextureBank): CanvasTexture {
  return bank.canvas('palm-frond', [256, 1024], (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(21);
    for (let i = 0; i < 70; i++) {
      const t = 0.06 + (i / 70) * 0.92; // along the frond, base → tip
      const y = h - t * h;
      const len = w * 0.5 * Math.sin(Math.min(t * 1.25, 1) * Math.PI * 0.95) * (0.85 + r() * 0.2);
      for (const side of [-1, 1]) {
        if (r() < 0.06) continue; // a few missing leaflets
        g.save();
        g.translate(w / 2, y);
        g.rotate(side * (0.95 + r() * 0.15));
        g.scale(side, 1);
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(len * 0.5, -len * 0.08, len, -len * 0.02);
        g.quadraticCurveTo(len * 0.5, len * 0.06, 0, 5);
        g.fillStyle = hsl(78 + r() * 18, 45 + r() * 12, 26 + t * 14 + r() * 6);
        g.fill();
        g.restore();
      }
    }
    g.strokeStyle = hsl(52, 35, 38);
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(w / 2, h);
    g.lineTo(w / 2, h * 0.03);
    g.stroke();
  }, true, false);
}

/** A banana leaf with its torn edges — the most recognisable plant in a Konkan garden. */
export function bananaLeaf(bank: TextureBank): CanvasTexture {
  return bank.canvas('banana-leaf', [256, 1024], (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(31);
    const half = (t: number) => w * 0.47 * Math.sin(Math.min(t * 1.08, 1) * Math.PI) ** 0.6;
    g.beginPath();
    g.moveTo(w / 2, h);
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      g.lineTo(w / 2 + half(t), h - t * h);
    }
    for (let i = 60; i >= 0; i--) {
      const t = i / 60;
      g.lineTo(w / 2 - half(t), h - t * h);
    }
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, hsl(82, 55, 30));
    grad.addColorStop(0.5, hsl(86, 58, 40));
    grad.addColorStop(1, hsl(80, 52, 30));
    g.fillStyle = grad;
    g.fill();
    // Lateral veins.
    g.strokeStyle = hsl(80, 45, 48, 0.35);
    g.lineWidth = 1.2;
    for (let i = 0; i < 90; i++) {
      const y = h - (i / 90) * h;
      g.beginPath();
      g.moveTo(w / 2, y);
      g.lineTo(w, y - 18);
      g.moveTo(w / 2, y);
      g.lineTo(0, y - 18);
      g.stroke();
    }
    // Wind tears: thin transparent slits from the edge toward the midrib.
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 22; i++) {
      const y = h * (0.1 + r() * 0.85);
      const side = r() < 0.5 ? -1 : 1;
      g.beginPath();
      g.moveTo(w / 2 + side * w * 0.5, y);
      g.lineTo(w / 2 + side * w * (0.03 + r() * 0.1), y - 22);
      g.lineWidth = 1.5 + r() * 2.5;
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    // Browned edges.
    g.strokeStyle = hsl(40, 40, 35, 0.5);
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = hsl(60, 40, 62);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(w / 2, h);
    g.lineTo(w / 2, 0);
    g.stroke();
  }, true, false);
}

/** Tufts of monsoon grass, some going to seed. */
export function grassTuft(bank: TextureBank): CanvasTexture {
  return bank.canvas('grass-tuft', [256, 256], (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(41);
    for (let i = 0; i < 46; i++) {
      const x = w * (0.2 + r() * 0.6);
      const lean = (r() - 0.5) * w * 0.5;
      const top = h * (0.05 + r() * 0.45);
      g.beginPath();
      g.moveTo(x - 3, h);
      g.quadraticCurveTo(x + lean * 0.3, h * 0.55, x + lean, top);
      g.quadraticCurveTo(x + lean * 0.3 + 2, h * 0.55, x + 3, h);
      g.fillStyle = hsl(68 + r() * 22, 34 + r() * 20, 28 + r() * 18);
      g.fill();
    }
  }, true, false);
}

/** Layered straw for the farm hut. Tileable. */
export function thatch(bank: TextureBank): CanvasTexture {
  return bank.canvas('thatch', [512, 512], (g, w, h) => {
    g.fillStyle = hsl(40, 38, 42);
    g.fillRect(0, 0, w, h);
    const r = rng(51);
    for (let row = 0; row < 8; row++) {
      const y0 = (row / 8) * h;
      const shade = g.createLinearGradient(0, y0, 0, y0 + h / 8);
      shade.addColorStop(0, 'rgba(0,0,0,0.0)');
      shade.addColorStop(1, 'rgba(40,25,10,0.35)');
      for (let i = 0; i < 520; i++) {
        const x = r() * w;
        const y = y0 + r() * (h / 8);
        const len = 18 + r() * 34;
        g.strokeStyle = hsl(38 + r() * 12, 30 + r() * 25, 38 + r() * 30, 0.8);
        g.lineWidth = 1 + r() * 1.4;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 6, y + len);
        g.stroke();
        if (x < 40) {
          g.beginPath();
          g.moveTo(x + w, y);
          g.lineTo(x + w + (r() - 0.5) * 6, y + len);
          g.stroke();
        }
      }
      g.fillStyle = shade;
      g.fillRect(0, y0, w, h / 8);
    }
  });
}

// ---- Rangoli ----------------------------------------------------------------------------------

export type RangoliStyle = 'flower' | 'kolam' | 'lotus';

/** Rangoli on the threshold: coloured powder (flower, lotus) or white rice-flour kolam. */
export function rangoli(bank: TextureBank, style: RangoliStyle, seed: number): CanvasTexture {
  return bank.canvas(`rangoli-${style}-${seed}`, [512, 512], (g, w) => {
    g.clearRect(0, 0, w, w);
    const r = rng(seed * 97 + 5);
    const c = w / 2;
    const palettes = [
      ['#f08a1c', '#d23c6e', '#f5c233', '#2f8a4a', '#f4efe4'],
      ['#e24a2a', '#f5b52e', '#7a3fa0', '#3f8f5a', '#f4efe4'],
      ['#f0a020', '#e0457a', '#3a7fc0', '#f7d44a', '#f4efe4'],
    ];
    const p = palettes[seed % palettes.length];
    const petalRing = (count: number, rad: number, len: number, wid: number, fill: string, rot = 0) => {
      for (let i = 0; i < count; i++) {
        g.save();
        g.translate(c, c);
        g.rotate(rot + (i / count) * Math.PI * 2);
        g.beginPath();
        g.moveTo(0, rad);
        g.quadraticCurveTo(wid, rad + len * 0.5, 0, rad + len);
        g.quadraticCurveTo(-wid, rad + len * 0.5, 0, rad);
        g.fillStyle = fill;
        g.fill();
        g.restore();
      }
    };
    const dots = (count: number, rad: number, size: number, fill: string) => {
      g.fillStyle = fill;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        g.beginPath();
        g.arc(c + Math.cos(a) * rad, c + Math.sin(a) * rad, size, 0, Math.PI * 2);
        g.fill();
      }
    };
    if (style === 'kolam') {
      // Rice-flour dots with loops drawn around them (sikku kolam).
      const n = 5;
      const step = w / (n + 1.2);
      g.strokeStyle = '#f2ede2';
      g.fillStyle = '#f2ede2';
      g.lineWidth = 7;
      g.lineCap = 'round';
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const x = step * (i + 1.1);
          const y = step * (j + 1.1);
          if (Math.abs(i - 2) + Math.abs(j - 2) > 2) continue;
          g.beginPath();
          g.arc(x, y, 7, 0, Math.PI * 2);
          g.fill();
          g.beginPath();
          g.arc(x, y, step * 0.42, (i + j) % 2 ? 0 : Math.PI / 2, ((i + j) % 2 ? 0 : Math.PI / 2) + Math.PI * 1.5);
          g.stroke();
        }
      g.beginPath();
      g.arc(c, c, w * 0.44, 0, Math.PI * 2);
      g.lineWidth = 6;
      g.stroke();
    } else if (style === 'lotus') {
      g.beginPath();
      g.arc(c, c, w * 0.47, 0, Math.PI * 2);
      g.fillStyle = p[3];
      g.fill();
      g.beginPath();
      g.arc(c, c, w * 0.43, 0, Math.PI * 2);
      g.fillStyle = '#2b1d14';
      g.fill();
      petalRing(8, w * 0.1, w * 0.3, w * 0.12, p[1]);
      petalRing(8, w * 0.08, w * 0.22, w * 0.07, p[0], Math.PI / 8);
      g.beginPath();
      g.arc(c, c, w * 0.09, 0, Math.PI * 2);
      g.fillStyle = p[2];
      g.fill();
      dots(24, w * 0.45, 6, p[4]);
      dots(8, w * 0.045, 5, p[4]);
    } else {
      g.beginPath();
      g.arc(c, c, w * 0.48, 0, Math.PI * 2);
      g.fillStyle = p[4];
      g.fill();
      g.beginPath();
      g.arc(c, c, w * 0.455, 0, Math.PI * 2);
      g.fillStyle = p[3];
      g.fill();
      petalRing(16, w * 0.24, w * 0.2, w * 0.07, p[0]);
      petalRing(12, w * 0.12, w * 0.15, w * 0.06, p[1], 0.2);
      petalRing(8, w * 0.03, w * 0.11, w * 0.05, p[2]);
      g.beginPath();
      g.arc(c, c, w * 0.05, 0, Math.PI * 2);
      g.fillStyle = p[4];
      g.fill();
      dots(32, w * 0.465, 5, p[4]);
      dots(16, w * 0.22, 4, p[4]);
    }
    // Powder: grain, and edges that aren't perfectly crisp.
    const img = g.getImageData(0, 0, w, w);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] === 0) continue;
      const n = 0.82 + r() * 0.3;
      img.data[i] *= n;
      img.data[i + 1] *= n;
      img.data[i + 2] *= n;
      if (r() < 0.05) img.data[i + 3] *= 0.6;
    }
    g.putImageData(img, 0, 0);
  }, true, false);
}

// ---- Signs, cloth, flame ------------------------------------------------------------------------

/** A hand-painted shop signboard: Marathi above, English below. */
export function signboard(bank: TextureBank, key: string, local: string, english: string, bg: string, fg: string): CanvasTexture {
  return bank.canvas(`sign-${key}`, [1024, 256], (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // Brush grain.
    const r = rng(key.length * 13);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 30 + r() * 80, 1);
    }
    g.strokeStyle = fg;
    g.lineWidth = 8;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.lineWidth = 2;
    g.strokeRect(28, 28, w - 56, h - 56);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 92px ${DEVANAGARI}`;
    g.fillText(local, w / 2, h * 0.42);
    g.font = `italic 40px ${SERIF}`;
    g.fillText(english.toUpperCase(), w / 2, h * 0.78);
  }, true, false);
}

/** The pandal's painted backdrop: maroon cloth, a golden halo, garland borders, a blessing. */
export function pandalBackdrop(bank: TextureBank): CanvasTexture {
  return bank.canvas('pandal-backdrop', [1024, 768], (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#5e1420');
    bg.addColorStop(1, '#3a0c14');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // Cloth pleats.
    for (let x = 0; x < w; x += 32) {
      const pl = g.createLinearGradient(x, 0, x + 32, 0);
      pl.addColorStop(0, 'rgba(0,0,0,0.18)');
      pl.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      pl.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = pl;
      g.fillRect(x, 0, 32, h);
    }
    // Halo (prabhavali).
    const cx = w / 2;
    const cy = h * 0.58;
    for (let i = 0; i < 48; i++) {
      g.save();
      g.translate(cx, cy);
      g.rotate((i / 48) * Math.PI * 2);
      g.fillStyle = i % 2 ? '#e0a83a' : '#f2c65a';
      g.beginPath();
      g.moveTo(-8, 190);
      g.lineTo(0, 270);
      g.lineTo(8, 190);
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.arc(cx, cy, 190, 0, Math.PI * 2);
    g.fillStyle = '#f0c152';
    g.fill();
    g.beginPath();
    g.arc(cx, cy, 170, 0, Math.PI * 2);
    g.fillStyle = '#7a1a26';
    g.fill();
    g.strokeStyle = '#f0c152';
    g.lineWidth = 3;
    for (let rr = 60; rr < 170; rr += 26) {
      g.beginPath();
      g.arc(cx, cy, rr, 0, Math.PI * 2);
      g.stroke();
    }
    // Marigold border.
    const r = rng(61);
    for (let x = 12; x < w; x += 22) {
      for (const y of [16, h - 16]) {
        g.beginPath();
        g.arc(x, y, 11, 0, Math.PI * 2);
        g.fillStyle = r() < 0.5 ? '#f09a1c' : '#f5c233';
        g.fill();
      }
    }
    g.fillStyle = '#f5d27a';
    g.textAlign = 'center';
    g.font = `bold 64px ${DEVANAGARI}`;
    g.fillText('॥ श्री गणेशाय नमः ॥', cx, 110);
  }, true, false);
}

/** A saffron cloth banner strung across the road. */
export function festivalBanner(bank: TextureBank): CanvasTexture {
  return bank.canvas('festival-banner', [1024, 192], (g, w, h) => {
    g.fillStyle = '#e8872b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#b8441c';
    g.fillRect(0, 0, w, 18);
    g.fillRect(0, h - 18, w, 18);
    for (let x = 0; x < w; x += 36) {
      g.beginPath();
      g.moveTo(x, h - 18);
      g.lineTo(x + 18, h - 36);
      g.lineTo(x + 36, h - 18);
      g.fill();
    }
    g.fillStyle = '#5a1410';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 72px ${DEVANAGARI}`;
    g.fillText('गणेशोत्सव', w * 0.3, h * 0.48);
    g.font = `italic 44px ${SERIF}`;
    g.fillText('Ganeshotsav', w * 0.72, h * 0.5);
  }, true, false);
}

/** A lamp flame: white-hot core, orange skirt, soft edges. */
export function flame(bank: TextureBank): CanvasTexture {
  return bank.canvas('flame', [64, 128], (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grad = g.createRadialGradient(w / 2, h * 0.7, 2, w / 2, h * 0.62, h * 0.5);
    grad.addColorStop(0, 'rgba(255,255,240,1)');
    grad.addColorStop(0.18, 'rgba(255,225,140,0.95)');
    grad.addColorStop(0.45, 'rgba(255,150,40,0.6)');
    grad.addColorStop(1, 'rgba(255,90,10,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(w / 2, 4);
    g.bezierCurveTo(w * 0.95, h * 0.55, w * 0.85, h * 0.95, w / 2, h * 0.96);
    g.bezierCurveTo(w * 0.15, h * 0.95, w * 0.05, h * 0.55, w / 2, 4);
    g.fill();
  }, true, false);
}

/** A soft round glow — halos around lamps and a warm pool of light on the ground beneath them. */
export function glow(bank: TextureBank): CanvasTexture {
  return bank.canvas('glow', [128, 128], (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  }, false, false);
}

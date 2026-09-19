/**
 * Painted textures for the festival: one cloth atlas (the pandal backdrop, the road banner and the
 * mandal's name board — so every painted cloth in the square shares a single material) and the big
 * rangoli laid on the road in the middle of the festival ground.
 */
import type { CanvasTexture } from 'three';
import { festivalBanner, pandalBackdrop, rng } from './canvasTextures';
import type { TextureBank } from './textures';

const DEVANAGARI = '"Kohinoor Devanagari", "Noto Sans Devanagari", "Nirmala UI", "Mangal", "Devanagari Sangam MN", sans-serif';

const ATLAS_W = 1024;
const ATLAS_H = 1088;

/** Rows of the cloth atlas, in canvas pixels [top, bottom). */
const ROWS = {
  backdrop: [0, 768],
  banner: [768, 960],
  board: [960, 1088],
} as const;

export type AtlasRegion = keyof typeof ROWS;

/** The v range of a region (CanvasTexture flips y: v = 1 at the canvas top). */
export function atlasV(region: AtlasRegion): [number, number] {
  const [y0, y1] = ROWS[region];
  return [1 - y1 / ATLAS_H, 1 - y0 / ATLAS_H];
}

export function clothAtlas(bank: TextureBank): CanvasTexture {
  return bank.canvas('festival:atlas', [ATLAS_W, ATLAS_H], (g, w) => {
    const draw = (tex: CanvasTexture, region: AtlasRegion) => {
      const [y0, y1] = ROWS[region];
      g.drawImage(tex.image as HTMLCanvasElement, 0, y0, w, y1 - y0);
    };
    draw(pandalBackdrop(bank), 'backdrop');
    draw(festivalBanner(bank), 'banner');
    const [b0, b1] = ROWS.board;
    mandalBoard(g, 0, b0, w, b1 - b0);
  }, true, false);
}

/**
 * The mandal's name board over the pandal entrance: maroon, gold lettering, a marigold border —
 * "सार्वजनिक गणेशोत्सव मंडळ" (the village's public Ganeshotsav committee).
 */
function mandalBoard(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number): void {
  const bg = g.createLinearGradient(0, y0, 0, y0 + h);
  bg.addColorStop(0, '#6a1622');
  bg.addColorStop(1, '#4a0e18');
  g.fillStyle = bg;
  g.fillRect(x0, y0, w, h);
  const r = rng(71);
  // Marigold beads along the top and bottom edges.
  for (let x = 6; x < w; x += 13) {
    for (const y of [y0 + 7, y0 + h - 7]) {
      g.beginPath();
      g.arc(x0 + x, y, 6, 0, Math.PI * 2);
      g.fillStyle = r() < 0.55 ? '#f09a1c' : '#f5c233';
      g.fill();
    }
  }
  g.strokeStyle = '#e2b24c';
  g.lineWidth = 3;
  g.strokeRect(x0 + 10, y0 + 18, w - 20, h - 36);
  // Paisley corners.
  for (const sx of [1, -1]) {
    g.save();
    g.translate(sx > 0 ? x0 + 60 : x0 + w - 60, y0 + h / 2);
    g.scale(sx, 1);
    g.fillStyle = '#e2b24c';
    g.beginPath();
    g.moveTo(0, 18);
    g.bezierCurveTo(-30, 12, -26, -26, 4, -22);
    g.bezierCurveTo(22, -18, 20, 4, 0, 18);
    g.fill();
    g.fillStyle = '#6a1622';
    g.beginPath();
    g.arc(0, -6, 7, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.fillStyle = '#f3cf6a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 58px ${DEVANAGARI}`;
  g.fillText('सार्वजनिक गणेशोत्सव मंडळ', x0 + w / 2, y0 + h * 0.53);
  // Brush grain.
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
    g.fillRect(x0 + r() * w, y0 + 18 + r() * (h - 36), 20 + r() * 60, 1);
  }
}

/**
 * The square's big rangoli, laid in coloured powder on the packed earth of the road: a lotus heart,
 * rings of petals, mango (kairi) paisleys, a marigold-petal band and a white dotted border.
 */
export function squareRangoli(bank: TextureBank): CanvasTexture {
  return bank.canvas('festival:rangoli', [1024, 1024], (g, w) => {
    g.clearRect(0, 0, w, w);
    const c = w / 2;
    const r = rng(83);
    const C = {
      white: '#f3eee2',
      red: '#c8321e',
      pink: '#cf3f6c',
      orange: '#ee8a1e',
      yellow: '#f3c238',
      green: '#2f7d45',
      blue: '#2a5176',
      purple: '#5e2f58',
      earth: '#3a2418',
    };
    const disc = (rad: number, fill: string) => {
      g.beginPath();
      g.arc(c, c, rad, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
    };
    const ring = (count: number, rad: number, fn: () => void, rot = 0) => {
      for (let i = 0; i < count; i++) {
        g.save();
        g.translate(c, c);
        g.rotate(rot + (i / count) * Math.PI * 2);
        g.translate(0, rad);
        fn();
        g.restore();
      }
    };
    const petal = (len: number, wid: number, fill: string) => {
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(wid, len * 0.5, 0, len);
      g.quadraticCurveTo(-wid, len * 0.5, 0, 0);
      g.fillStyle = fill;
      g.fill();
    };
    const dots = (count: number, rad: number, size: number, fill: string, rot = 0) => ring(count, rad, () => {
      g.beginPath();
      g.arc(0, 0, size, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
    }, rot);

    // Outer border: white dots, a green leaf band, a marigold petal band.
    disc(w * 0.495, C.white);
    disc(w * 0.485, C.green);
    ring(72, w * 0.485, () => petal(-w * 0.035, w * 0.012, '#4f9a55'));
    disc(w * 0.45, C.orange);
    ring(96, w * 0.45, () => petal(-w * 0.03, w * 0.011, C.yellow), 0.02);
    disc(w * 0.415, C.white);
    disc(w * 0.405, C.purple);
    // Kairi (mango paisley) motifs.
    ring(12, w * 0.33, () => {
      g.rotate(Math.PI);
      g.beginPath();
      g.moveTo(0, -w * 0.06);
      g.bezierCurveTo(w * 0.07, -w * 0.05, w * 0.06, w * 0.07, 0, w * 0.06);
      g.bezierCurveTo(-w * 0.05, w * 0.05, -w * 0.035, -w * 0.02, w * 0.012, -w * 0.02);
      g.bezierCurveTo(-w * 0.01, -w * 0.035, -w * 0.02, -w * 0.05, 0, -w * 0.06);
      g.fillStyle = C.yellow;
      g.fill();
      g.beginPath();
      g.arc(w * 0.01, w * 0.02, w * 0.022, 0, Math.PI * 2);
      g.fillStyle = C.pink;
      g.fill();
      g.beginPath();
      g.arc(w * 0.01, w * 0.02, w * 0.009, 0, Math.PI * 2);
      g.fillStyle = C.white;
      g.fill();
    });
    dots(12, w * 0.33, w * 0.012, C.white, Math.PI / 12);
    disc(w * 0.265, C.white);
    disc(w * 0.255, C.blue);
    // Lotus: two rings of petals.
    ring(16, w * 0.07, () => petal(w * 0.17, w * 0.05, C.pink));
    ring(16, w * 0.07, () => petal(w * 0.12, w * 0.028, '#f07aa0'));
    ring(8, w * 0.045, () => petal(w * 0.12, w * 0.045, C.orange), Math.PI / 16);
    ring(8, w * 0.045, () => petal(w * 0.08, w * 0.022, C.yellow), Math.PI / 16);
    disc(w * 0.06, C.red);
    disc(w * 0.04, C.yellow);
    dots(8, w * 0.02, w * 0.007, C.red);
    dots(32, w * 0.258, w * 0.007, C.white);
    dots(48, w * 0.407, w * 0.006, C.yellow);
    dots(64, w * 0.49, w * 0.006, C.earth);

    // Powder: grain, uneven density, and edges that aren't crisp.
    const img = g.getImageData(0, 0, w, w);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const n = 0.8 + r() * 0.3;
      d[i] *= n;
      d[i + 1] *= n;
      d[i + 2] *= n;
      if (r() < 0.06) d[i + 3] *= 0.5;
    }
    g.putImageData(img, 0, 0);
    // A few footprints' worth of scuffing — people have already walked round it.
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const rad = w * (0.44 + r() * 0.06);
      g.beginPath();
      g.ellipse(c + Math.cos(a) * rad, c + Math.sin(a) * rad, 6 + r() * 10, 3 + r() * 5, r() * 3, 0, Math.PI * 2);
      g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.4})`;
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }, true, false);
}

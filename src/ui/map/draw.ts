/**
 * Drawing the village as a map: the ground, the lanes, the houses and shops with their names, and
 * on top of it the player and whatever the player knows about the offerings.
 *
 * North is always the top (−z), east the right. The base is painted once per size and reused; only
 * the markers are drawn each update, which keeps the map cheap enough for a phone.
 */
import { ITEMS } from '../../shared/items';
import type { MapPlayer, MapSpot } from '../../shared/map';
import { VILLAGE } from '../../game/world/village/layout';

const B = VILLAGE.bounds;
export const MIN_X = B.minX;
export const MIN_Z = B.minZ;
export const WORLD_W = B.maxX - B.minX;
export const WORLD_H = B.maxZ - B.minZ;

/** Metres of ground a faint hint covers: "somewhere near here", not a pin. */
const HINT_RADIUS_M = 8;

const AREA_FILL: Record<string, string> = {
  home: '#2b2a1c',
  square: '#332b1c',
  temple: '#3a2d1a',
  garden: '#23341f',
  farm: '#27351f',
  orchard: '#22321f',
  grove: '#22301f',
  pond: '#1f3a52',
  kirana: '#30271a',
  sweets: '#30271a',
};

/** Landmarks worth a dot and a name on the full map. */
const LANDMARK_NAME: Record<string, string> = {
  pandal: 'Pandal',
  well: 'Well',
  'flower-stall': 'Flowers',
  potter: 'Potter',
  'fruit-stall': 'Fruit',
  'puja-stall': 'Puja stall',
};

export interface Transform {
  /** Pixels per metre. */
  ppm: number;
  /** Pixel position of the world point (MIN_X, MIN_Z). */
  ox: number;
  oz: number;
}

export const px = (t: Transform, x: number): number => (x - MIN_X) * t.ppm + t.ox;
export const pz = (t: Transform, z: number): number => (z - MIN_Z) * t.ppm + t.oz;

function rect(g: CanvasRenderingContext2D, t: Transform, x: number, z: number, w: number, d: number, rot: number): void {
  g.save();
  g.translate(px(t, x), pz(t, z));
  g.rotate(-rot);
  g.beginPath();
  g.rect((-w / 2) * t.ppm, (-d / 2) * t.ppm, w * t.ppm, d * t.ppm);
  g.restore();
}

function line(g: CanvasRenderingContext2D, t: Transform, points: { x: number; z: number }[]): void {
  g.beginPath();
  points.forEach((p, i) => (i ? g.lineTo(px(t, p.x), pz(t, p.z)) : g.moveTo(px(t, p.x), pz(t, p.z))));
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, alpha = 0.8): void {
  g.font = `600 ${size}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Keep a name inside the map rather than cut off at its edge.
  const half = g.measureText(text).width / 2 + 2;
  x = Math.min(Math.max(x, half), Math.max(g.canvas.width - half, half));
  g.lineWidth = Math.max(2, size / 3);
  g.strokeStyle = 'rgba(10,12,8,0.85)';
  g.strokeText(text, x, y);
  g.fillStyle = `rgba(255,238,205,${alpha})`;
  g.fillText(text, x, y);
}

/** The ground and everything fixed on it. `names` adds the labels the full map needs. */
export function paintBase(g: CanvasRenderingContext2D, t: Transform, names: boolean, fontPx = 10): void {
  g.fillStyle = '#182014';
  g.fillRect(px(t, MIN_X), pz(t, MIN_Z), WORLD_W * t.ppm, WORLD_H * t.ppm);

  for (const a of VILLAGE.areas) {
    g.fillStyle = AREA_FILL[a.kind] ?? '#22301f';
    rect(g, t, a.x, a.z, a.w, a.d, 0);
    g.fill();
  }
  for (const f of VILLAGE.fields) {
    g.fillStyle = f.crop === 'sugarcane' ? '#3f5d2b' : f.crop === 'millet' ? '#4d5a2c' : '#35572f';
    rect(g, t, f.x, f.z, f.w, f.d, f.rot);
    g.fill();
  }

  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const r of VILLAGE.roads) {
    g.strokeStyle = r.kind === 'main' ? '#7a664b' : r.kind === 'lane' ? '#5f5040' : '#4b4034';
    g.lineWidth = Math.max(r.width * t.ppm, 1.5);
    line(g, t, r.points);
    g.stroke();
  }

  for (const w of VILLAGE.walls) {
    g.strokeStyle = w.kind === 'temple' ? '#b39a62' : '#8a7a5c';
    g.lineWidth = Math.max(1.5, t.ppm * 0.5);
    line(g, t, w.points);
    g.stroke();
  }

  g.fillStyle = 'rgba(52,96,48,0.85)';
  for (const tree of VILLAGE.trees) {
    g.beginPath();
    g.arc(px(t, tree.x), pz(t, tree.z), Math.max(1.4 * t.ppm, 1.5), 0, Math.PI * 2);
    g.fill();
  }

  for (const h of VILLAGE.houses) {
    g.fillStyle = h.shelter ? '#c99a52' : '#6d5642';
    g.strokeStyle = '#2a2016';
    g.lineWidth = 1;
    rect(g, t, h.x, h.z, h.width, h.depth, h.rot);
    g.fill();
    g.stroke();
  }
  for (const s of VILLAGE.shops) {
    g.fillStyle = '#c47a35';
    g.strokeStyle = '#2a2016';
    g.lineWidth = 1;
    rect(g, t, s.x, s.z, s.width, s.depth, s.rot);
    g.fill();
    g.stroke();
  }
  const tp = VILLAGE.temple;
  g.fillStyle = '#d8b25c';
  g.strokeStyle = '#4a3a1c';
  rect(g, t, tp.x, tp.z, tp.platformW, tp.platformD, 0);
  g.fill();
  g.stroke();

  for (const l of VILLAGE.landmarks) {
    if (!LANDMARK_NAME[l.kind]) continue;
    g.fillStyle = '#e6c88a';
    g.beginPath();
    g.arc(px(t, l.x), pz(t, l.z), Math.max(0.9 * t.ppm, 2), 0, Math.PI * 2);
    g.fill();
  }

  if (!names) return;
  for (const a of VILLAGE.areas) {
    if (a.kind === 'kirana' || a.kind === 'sweets' || a.kind === 'temple' || a.kind === 'home') continue;
    label(g, a.name, px(t, a.x), pz(t, a.z + a.d / 2 - 1.5), fontPx * 1.05, 0.5);
  }
  for (const h of VILLAGE.houses) {
    const name = h.family === 'your family' ? 'Home' : h.kind === 'hut' ? 'Hut' : h.family.replace(/^the /, '');
    label(g, name, px(t, h.x), pz(t, h.z), fontPx * 0.85, 0.85);
  }
  for (const s of VILLAGE.shops) label(g, s.kind === 'kirana' ? 'Kirana' : 'Mithai', px(t, s.x), pz(t, s.z), fontPx * 0.85, 0.95);
  for (const l of VILLAGE.landmarks) {
    const name = LANDMARK_NAME[l.kind];
    if (name) label(g, name, px(t, l.x), pz(t, l.z) - fontPx * 0.9, fontPx * 0.8, 0.8);
  }
  label(g, 'Temple', px(t, tp.x), pz(t, tp.z), fontPx * 1.3, 1);
}

export interface MarkerStyle {
  /** Pin radius, pixels. */
  pin: number;
  /** Draw item names and quantities next to pins. */
  words: boolean;
  fontPx: number;
}

/** Where the player knows an offering is — the glow of a hint, or the pin of something seen. */
export function paintSpots(g: CanvasRenderingContext2D, t: Transform, spots: readonly MapSpot[], style: MarkerStyle): void {
  for (const s of spots) {
    const x = px(t, s.x);
    const y = pz(t, s.z);
    if (s.state === 'hinted') {
      const r = HINT_RADIUS_M * t.ppm;
      const glow = g.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, 'rgba(255,205,110,0.42)');
      glow.addColorStop(1, 'rgba(255,205,110,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.setLineDash([3, 4]);
      g.strokeStyle = 'rgba(255,214,140,0.55)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, r * 0.62, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      if (style.words) label(g, `${ITEMS[s.item].glyph}?`, x, y, style.fontPx * 1.1, 0.9);
    } else {
      g.fillStyle = '#f2c46a';
      g.strokeStyle = '#3a2a0e';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, style.pin, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (style.words) {
        g.font = `${style.pin * 1.15}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText(ITEMS[s.item].glyph, x, y + 0.5);
        label(g, `${ITEMS[s.item].name} ×${s.quantity}`, x, y + style.pin + style.fontPx * 0.9, style.fontPx * 0.9, 1);
      }
    }
  }
}

export function paintPlayer(g: CanvasRenderingContext2D, t: Transform, p: MapPlayer, size: number): void {
  g.save();
  g.translate(px(t, p.x), pz(t, p.z));
  // yaw 0 faces +z (down the map); the arrow is drawn pointing up, then turned to match.
  g.rotate(Math.PI - p.yaw);
  g.beginPath();
  g.moveTo(0, -size);
  g.lineTo(size * 0.72, size * 0.75);
  g.lineTo(0, size * 0.35);
  g.lineTo(-size * 0.72, size * 0.75);
  g.closePath();
  g.fillStyle = '#fff6d8';
  g.strokeStyle = '#1b1508';
  g.lineWidth = 1.5;
  g.fill();
  g.stroke();
  g.restore();
}

/** The temple, wherever it is: a gold marker, pinned to the edge of a view that cannot show it. */
export function paintTempleMarker(g: CanvasRenderingContext2D, t: Transform, w: number, h: number, size: number): void {
  const tp = VILLAGE.temple;
  let x = px(t, tp.x);
  let y = pz(t, tp.z);
  const m = size + 4;
  const off = x < m || x > w - m || y < m || y > h - m;
  x = Math.min(Math.max(x, m), w - m);
  y = Math.min(Math.max(y, m), h - m);
  g.fillStyle = '#ffd36a';
  g.strokeStyle = '#3a2a0e';
  g.lineWidth = 1.5;
  g.beginPath();
  if (off) {
    // A diamond on the border: the temple is that way.
    g.moveTo(x, y - size);
    g.lineTo(x + size, y);
    g.lineTo(x, y + size);
    g.lineTo(x - size, y);
    g.closePath();
  } else {
    g.arc(x, y, size * 0.7, 0, Math.PI * 2);
  }
  g.fill();
  g.stroke();
  g.fillStyle = '#2a1c05';
  g.font = `700 ${size}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('T', x, y + 0.5);
}

/**
 * The small life of the ground: the tulsi garden's marigold beds and hibiscus bushes, weeds at the
 * foot of walls, monsoon wildflowers in the grass, colocasia by the wells and the tank, leaf litter
 * under the big trees, and a band of scrub along the village edge that softens the boundary.
 */
import { Color, Vector3 } from 'three';
import type { VillageLayout } from '../../types';
import { LEAF_QUAD, rng } from './canvasTextures';
import type { Ground } from './ground';
import { type CardSet, quadCell } from './trees.gpu';
import { bush, noise2, plant, type Site } from './trees.land';
import { VEG } from './trees.paint';
import type { Rnd } from './trees.shape';

const TAU = Math.PI * 2;
const SHRUB = quadCell(LEAF_QUAD.shrub);

interface Beds {
  leaves: CardSet;
  /** Small plants: no shadows. */
  small: CardSet;
  site: Site;
  layout: VillageLayout;
  ground: Ground | null;
  height: (x: number, z: number) => number;
  grass: (x: number, z: number) => number;
}

/** Keep plantings off offering spots so the festival props sit clear. */
const nearOffering = (L: VillageLayout, x: number, z: number, d: number) => L.offerings.some((o) => Math.hypot(o.x - x, o.z - z) < d);

// ---- Tulsi garden -------------------------------------------------------------------------------------

export function garden(b: Beds, seed: number): void {
  const r = rng(seed);
  const area = b.layout.areas.find((a) => a.kind === 'garden');
  if (!area) return;
  const x0 = area.x - area.w / 2 + 1.0;
  const x1 = area.x + area.w / 2 - 1.0;
  const z0 = area.z - area.d / 2 + 1.0;
  const z1 = area.z + area.d / 2 - 1.0;
  const ok = (x: number, z: number, pad = 0) => !b.site.blocked(x, z) && !b.site.blocked(x + pad, z) && !b.site.blocked(x - pad, z) && !b.site.blocked(x, z + pad) && !b.site.blocked(x, z - pad) && !nearOffering(b.layout, x, z, 1.3);
  const marigold = (x: number, z: number) => {
    if (!ok(x, z, 0.2)) return;
    plant(b.small, new Vector3(x, 0, z), VEG.marigold, 0.62 + r() * 0.2, 0.62 + r() * 0.22, new Color(1, 1, 1).multiplyScalar(0.9 + 0.2 * r()), r, { sway: 0.04 });
  };
  // Marigold beds along the south and west walls, rows 0.35 m apart.
  for (let x = x0 + 1.8; x < x1; x += 0.36) for (const z of [z1 - 0.15, z1 - 0.5]) marigold(x + (r() - 0.5) * 0.08, z + (r() - 0.5) * 0.08);
  for (let z = z0 + 3.5; z < z1 - 2.5; z += 0.36) for (const x of [x0 + 0.1, x0 + 0.45]) marigold(x + (r() - 0.5) * 0.08, z + (r() - 0.5) * 0.08);
  // A ring of marigolds round the tulsi, open toward the gate.
  const tulsi = b.layout.landmarks.find((l) => l.kind === 'tulsi' && Math.abs(l.x - area.x) < area.w / 2 && Math.abs(l.z - area.z) < area.d / 2);
  if (tulsi) {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      if (Math.cos(a) > 0.8) continue;
      marigold(tulsi.x + Math.cos(a) * 1.15, tulsi.z + Math.sin(a) * 1.15);
    }
  }
  // Hibiscus (jaswand) bushes in the corners and by the gate, starred with red flowers.
  for (const [hx, hz] of [[x1 + 0.35, z0 - 0.35], [x0 - 0.2, z0 - 0.3], [x1 + 0.3, z1 + 0.25], [x1 + 0.3, z0 + 2.2], [(x0 + x1) / 2 + 1.5, z0 - 0.3]]) {
    if (!ok(hx, hz)) continue;
    hibiscusBush(b, hx, hz, 1.25 + r() * 0.35, r);
  }
  // Terda balsam by the gate path.
  for (let i = 0; i < 10; i++) {
    const x = x1 - 0.2 - r() * 1.2;
    const z = area.z + 1.8 + r() * 2.2;
    if (ok(x, z, 0.15)) plant(b.small, new Vector3(x, 0, z), VEG.balsam, 0.55, 0.6 + r() * 0.2, new Color(1, 1, 1), r);
  }
}

function hibiscusBush(b: Beds, x: number, z: number, size: number, r: Rnd): void {
  bush(b.leaves, x, 0, z, size, SHRUB, new Color(0.8, 0.95, 0.78), r, 11);
  for (let i = 0; i < 14; i++) {
    const a = r() * TAU;
    const up = 0.2 + r() * 0.75;
    const d = size * 0.48 * Math.sqrt(1 - up * up * 0.6);
    const p = new Vector3(x + Math.cos(a) * d, size * (0.3 + up * 0.55), z + Math.sin(a) * d);
    const out = new Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), out).normalize();
    const upv = new Vector3().crossVectors(out, right);
    b.small.add({ p, right, up: upv, w: 0.17, h: 0.17, cell: VEG.hibiscus, colour: new Color(1, 1, 1), bend: out, sway: 0.02 });
  }
}

// ---- Scatter over the village ------------------------------------------------------------------------------

export function undergrowth(b: Beds, seed: number): void {
  const r = rng(seed);
  const L = b.layout;
  const flowers = noise2(seed + 7);
  const bounds = L.bounds;

  // Weeds and small bushes at the foot of walls and houses: where grass meets something built.
  for (let z = bounds.minZ + 1; z < bounds.maxZ - 1; z += 1.1) {
    for (let x = bounds.minX + 1; x < bounds.maxX - 1; x += 1.1) {
      const px = x + (r() - 0.5) * 0.9;
      const pz = z + (r() - 0.5) * 0.9;
      const g = b.grass(px, pz);
      if (g < 0.15 || nearOffering(L, px, pz, 1.5)) continue;
      const hug = [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].some(([dx, dz]) => b.site.blocked(px + dx, pz + dz));
      if (hug && r() < 0.28) {
        if (r() < 0.35) bush(b.leaves, px, -0.05, pz, 0.6 + r() * 0.4, SHRUB, new Color(0.85, 0.95, 0.78), r, 5);
        else plant(b.small, new Vector3(px, 0, pz), VEG.tallGrass, 0.34 + r() * 0.12, 0.7 + r() * 0.5, new Color(1, 1, 0.9).multiplyScalar(0.85 + 0.25 * r()), r, { sway: 0.08 });
        continue;
      }
      // Wildflowers in patches through the grass: yellow sonki, pink terda, durva.
      const f = flowers(px * 0.14, pz * 0.14);
      if (g > 0.4 && f > 0.62 && r() < 0.5) {
        const kind = f > 0.8 && r() < 0.5 ? VEG.balsam : r() < 0.7 ? VEG.sonki : VEG.durva;
        const n = 2 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const qx = px + (r() - 0.5) * 1.2;
          const qz = pz + (r() - 0.5) * 1.2;
          if (b.grass(qx, qz) < 0.2) continue;
          const s = kind === VEG.durva ? 0.5 : 0.42 + r() * 0.2;
          plant(b.small, new Vector3(qx, 0, qz), kind, s, s * (kind === VEG.durva ? 0.5 : 1), new Color(1, 1, 1).multiplyScalar(0.9 + 0.2 * r()), r, { sway: 0.06 });
        }
      }
    }
  }

  // Colocasia where the ground stays wet: round the wells, the handpump and the tank.
  for (const lm of L.landmarks) {
    const ring = lm.kind === 'well' ? [1.3, 2.1, 9] : lm.kind === 'handpump' ? [0.9, 1.5, 4] : lm.kind === 'pond' ? [5.2, 6.4, 16] : null;
    if (!ring) continue;
    for (let i = 0; i < ring[2]; i++) {
      const a = r() * TAU;
      const d = ring[0] + r() * (ring[1] - ring[0]);
      const x = lm.x + Math.cos(a) * d * (lm.kind === 'pond' ? 1 : 1);
      const z = lm.z + Math.sin(a) * d * (lm.kind === 'pond' ? 0.78 : 1);
      if (b.site.blocked(x, z) || b.grass(x, z) < 0.05 || nearOffering(L, x, z, 1.2)) continue;
      plant(b.small, new Vector3(x, 0, z), VEG.colocasia, 0.75 + r() * 0.3, 0.8 + r() * 0.35, new Color(1, 1, 1).multiplyScalar(0.85 + 0.25 * r()), r, { sway: 0.05 });
    }
  }

  // Leaf litter under the big shade trees.
  for (const t of L.trees) {
    if (!['neem', 'mango', 'peepal', 'banyan'].includes(t.kind)) continue;
    const rad = { banyan: 6, peepal: 5, neem: 3, mango: 3 }[t.kind as 'neem'] * t.scale;
    for (let i = 0; i < rad * 3; i++) {
      const a = r() * TAU;
      const d = (t.kind === 'banyan' ? 3.5 : 0.6) + r() * rad;
      const x = t.x + Math.cos(a) * d;
      const z = t.z + Math.sin(a) * d;
      if (b.site.blocked(x, z)) continue;
      const s = b.ground?.surfaceAt(x, z);
      if (s && s.paving > 0.3) continue;
      const yaw = r() * TAU;
      b.small.add({ p: new Vector3(x, 0.025, z), right: new Vector3(Math.cos(yaw), 0, Math.sin(yaw)), up: new Vector3(-Math.sin(yaw), 0, Math.cos(yaw)), w: 0.55, h: 0.55, cell: VEG.fallen, colour: new Color(0.9, 0.85, 0.8), bend: new Vector3(0, 1, 0), sway: 0, rooted: true });
    }
  }

  // Scrub along the village edge: bushes and seeding grass just beyond the boundary.
  if (b.ground) {
    const g = b.ground;
    const e = 7;
    for (let z = bounds.minZ - e; z < bounds.maxZ + e; z += 1.6) {
      for (let x = bounds.minX - e; x < bounds.maxX + e; x += 1.6) {
        const px = x + (r() - 0.5) * 1.4;
        const pz = z + (r() - 0.5) * 1.4;
        const d = g.outside(px, pz);
        if (d < 0.6 || d > 7) continue;
        const y = b.height(px, pz);
        const k = r();
        if (k < 0.3) bush(b.leaves, px, y - 0.1, pz, 1.1 + r() * 1.1 * Math.min(1, d / 3), r() < 0.7 ? SHRUB : quadCell(LEAF_QUAD.neem), new Color(0.82, 0.93, 0.78), r, 7);
        else if (k < 0.75) plant(b.small, new Vector3(px, y - 0.05, pz), VEG.tallGrass, 0.4 + r() * 0.2, 0.9 + r() * 0.6, new Color(1, 0.97, 0.85).multiplyScalar(0.85 + 0.2 * r()), r, { sway: 0.08 });
        else if (k < 0.82) plant(b.small, new Vector3(px, y - 0.05, pz), VEG.sonki, 0.5, 0.5, new Color(1, 1, 1), r);
      }
    }
  }
}

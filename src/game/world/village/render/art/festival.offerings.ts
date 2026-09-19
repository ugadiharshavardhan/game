/**
 * The twelve offerings the puja asks for, each laid out where the layout puts it, the way a
 * family would set it aside: modak on a brass thali with a square of banana leaf, durva tied in
 * bundles of twenty-one, a tall basket of red hibiscus, coconuts in a basket or on a cloth, a
 * woven tray of clay diyas, a brass karanda of kumkum, cut banana leaves tied in a stack, a basket
 * of marigolds and a garland, a holder of burning incense.
 *
 * No markers, no glow: they're found by looking. Each is a group named `offering:<id>`, which the
 * inventory hides when it's collected; its mesh inside is what the culler toggles with distance.
 *
 * Where a spot's height matches a counter or stall (solids.ts), the prop rests on that surface,
 * pulled onto its footprint if the spot sits just in front of it.
 */
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, Matrix4, Vector3 } from 'three';
import type { BoxSolid } from '../../solids';
import type { OfferingItem, OfferingSpotDef } from '../../types';
import { rng } from './canvasTextures';
import { clothGrid } from './festival.cloth';
import { FestBatch } from './festival.kit';
import { basket, coconut, durva, flowerHeap, heap, hibiscus, MARIGOLDS, mangoLeaf, modak, speckle, thali, vati } from './festival.things';
import { hashf, lathe, place } from './geom';
import { TONE } from './palette';
import type { ArtContext } from './runtime';

/** Offerings are small: hide them past this distance. */
const CULL = 45;

interface Rest {
  x: number;
  y: number;
  z: number;
  /** Facing: the prop's local +z points this way (toward whoever stands at the counter). */
  yaw: number;
  on: 'ground' | 'counter';
  /** On the ground, the height the layout asks the offering to be presented at (a basket's top). */
  lift: number;
}

export function buildOfferings(a: ArtContext): void {
  const seen = new Map<OfferingItem, number>();
  for (const o of a.layout.offerings) {
    const variant = seen.get(o.item) ?? 0;
    seen.set(o.item, variant + 1);
    const at = restingPlace(a, o);
    const group = new Group();
    group.name = `offering:${o.id}`;
    group.position.set(at.x, at.y, at.z);
    group.rotation.y = at.yaw;
    const b = new FestBatch();
    BUILD[o.item](b, variant, at);
    const art = b.build(a, { name: `offering:${o.id}:art`, cast: false });
    group.add(art);
    a.culler.add(art, new Vector3(at.x, 0, at.z), CULL);
    a.root.add(group);
  }
}

/**
 * Where the prop rests. A spot at counter height sits on the counter or stall whose top matches,
 * clamped inside its footprint (the layout puts spots where the player stands, just in front).
 */
function restingPlace(a: ArtContext, o: OfferingSpotDef): Rest {
  const yaw = hashf(o.x, o.z, 3) * Math.PI * 2;
  const ground: Rest = { x: o.x, y: a.ground?.heightAt(o.x, o.z) ?? 0, z: o.z, yaw, on: 'ground', lift: o.y };
  if (o.y < 0.1) return ground;
  let best: { p: Rest; d: number } | null = null;
  for (const s of a.level.solids) {
    if (s.kind !== 'box' || s.layer === 'none') continue;
    const top = s.y + s.sy / 2;
    if (Math.abs(top - o.y) > 0.08 || s.sx < 0.6 || s.sz < 0.5) continue;
    const p = clampOnto(s, o.x, o.z, 0.2);
    const d = Math.hypot(p.x - o.x, p.z - o.z);
    if (d < 2 && (!best || d < best.d)) best = { p: { x: p.x, y: top, z: p.z, yaw: s.rot, on: 'counter', lift: 0 }, d };
  }
  return best?.p ?? ground;
}

function clampOnto(s: BoxSolid, x: number, z: number, margin: number): { x: number; z: number } {
  const c = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  const dx = x - s.x;
  const dz = z - s.z;
  // Into the box's frame (inverse of toWorld), clamp, and back.
  const lx = Math.min(Math.max(dx * c - dz * sn, -s.sx / 2 + margin), s.sx / 2 - margin);
  const lz = Math.min(Math.max(dx * sn + dz * c, -s.sz / 2 + margin), s.sz / 2 - margin);
  return { x: s.x + lx * c + lz * sn, z: s.z - lx * sn + lz * c };
}

type Builder = (b: FestBatch, variant: number, at: Rest) => void;

const BUILD: Record<OfferingItem, Builder> = {
  modak: (b) => {
    thali(b, new Matrix4(), 0.16);
    // A square of banana leaf on the plate, the modak piled on it: seven, three, one.
    b.add('paint', leafSquare(0.2, 0.012), '#4f7d2c');
    for (let i = 0; i < 7; i++) {
      const t = (i / 7) * Math.PI * 2;
      modak(b, place(Math.cos(t) * 0.072, 0.016, Math.sin(t) * 0.072, t));
    }
    for (let i = 0; i < 3; i++) {
      const t = (i / 3) * Math.PI * 2 + 0.5;
      modak(b, place(Math.cos(t) * 0.03, 0.045, Math.sin(t) * 0.03, t));
    }
    modak(b, place(0, 0.085, 0, 0.2));
    // A hibiscus tucked beside, for Bappa.
    hibiscus(b, place(0.1, 0.014, -0.08, 0.8), 0.7);
  },

  incense: (b) => {
    // A small brass stand with three sticks burning, and a tied bundle waiting on a leaf.
    b.add('brass', lathe([[0.001, 0], [0.05, 0], [0.052, 0.008], [0.03, 0.015], [0.018, 0.03], [0.022, 0.05], [0.001, 0.055]], 14));
    const r = rng(5);
    for (let i = 0; i < 3; i++) {
      const ax = (r() - 0.5) * 0.25;
      const az = (r() - 0.5) * 0.25;
      const m = new Matrix4().makeRotationX(ax).premultiply(new Matrix4().makeRotationZ(az)).setPosition((i - 1) * 0.008, 0.05, (r() - 0.5) * 0.01);
      stick(b, m, 0.23, true);
    }
    b.add('paint', leafSquare(0.26, 0.004).scale(1, 1, 0.5).translate(0.1, 0, 0.12), '#557f2e');
    for (let i = 0; i < 14; i++) {
      const m = new Matrix4().makeRotationZ(-Math.PI / 2).setPosition(0.0, 0.012 + (i % 3) * 0.004, 0.105 + (i % 5) * 0.0045 + ((i * 7) % 3) * 0.002);
      stick(b, m.premultiply(new Matrix4().makeTranslation(-0.02, 0, 0)), 0.23, false);
    }
    b.add('paint', new CylinderGeometry(0.016, 0.016, 0.012, 8, 1, true).rotateZ(Math.PI / 2).translate(0.07, 0.018, 0.114), TONE.vermilion);
    // Two paper packets beside.
    b.add('paint', new BoxGeometry(0.06, 0.015, 0.14).rotateY(0.3).translate(-0.12, 0.0075, 0.06), '#3a5a9a');
    b.add('paint', new BoxGeometry(0.06, 0.015, 0.14).rotateY(0.45).translate(-0.13, 0.0225, 0.055), '#b8322a');
  },

  durva: (b, v) => {
    if (v === 0) {
      // On a flat basalt stone by the tank: a leaf plate (patravali) holding three bundles.
      const stone = lathe([[0.001, 0], [0.24, 0], [0.27, 0.02], [0.26, 0.05], [0.2, 0.065], [0.001, 0.068]], 12);
      stone.scale(1.15, 1, 0.85);
      speckle(stone, '#5a5750', 0.2, 4);
      b.add('paint', stone);
      b.add('paint', patravali(0.15).translate(0, 0.068, 0));
      for (let i = 0; i < 3; i++) durva(b, place(-0.08 + i * 0.012, 0.074 + i * 0.006, -0.05 + i * 0.045, -0.15 + i * 0.12), 11 + i);
    } else {
      // At the field's edge: bundles laid on a cut piece of banana leaf.
      b.add('banana', bananaCut(0.52, 0.3, 0.3), '#e8f0d0');
      for (let i = 0; i < 2; i++) durva(b, place(-0.12 + i * 0.03, 0.012 + i * 0.006, -0.04 + i * 0.07, 0.1 - i * 0.2), 21 + i);
      // A few loose blades.
      durva(b, place(0.12, 0.012, 0.09, 2.2), 31, 5);
    }
  },

  hibiscus: (b, _v, at) => {
    // A tall topli standing in the garden, heaped with red jaswand — the top at the spot's height.
    const h = at.on === 'ground' ? Math.max(0.3, at.lift - 0.08) : 0.12;
    basket(b, new Matrix4(), 0.2, h, 6);
    const r = rng(8);
    for (let i = 0; i < 13; i++) {
      const t = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 0.15;
      const y = h - 0.01 + 0.05 * (1 - (d / 0.15) ** 2);
      const m = place(Math.cos(t) * d, y, Math.sin(t) * d, r() * 6.28);
      m.multiply(new Matrix4().makeRotationX((r() - 0.5) * 0.7));
      hibiscus(b, m, 0.9 + r() * 0.2);
    }
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * Math.PI * 2 + 0.3;
      const leaf = mangoLeaf(0.09, 0.05);
      leaf.rotateX(-0.25);
      leaf.rotateY(t);
      leaf.translate(Math.sin(t) * 0.14, h + 0.015, Math.cos(t) * 0.14);
      b.add('paint', leaf, i % 2 ? '#3f6a2a' : '#4d7a30');
    }
  },

  'banana-leaf': (b) => {
    // Cut leaves, folded along the midrib and stacked, tied round the middle with coir.
    const r = rng(12);
    for (let i = 0; i < 5; i++) {
      const g = bananaCut(0.86, 0.36, 0.3 + (i % 3) * 0.1);
      g.rotateY((r() - 0.5) * 0.12);
      g.translate((r() - 0.5) * 0.04, i * 0.007, (r() - 0.5) * 0.03);
      b.add('banana', g, i % 2 ? '#e2ecc8' : '#d6e2b8');
    }
    b.add('paint', lathe([[0.2, -0.012], [0.205, 0], [0.2, 0.012]], 12).scale(1, 2.2, 0.1).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0.02, 0), '#6a5236');
    b.add('paint', new BoxGeometry(0.012, 0.004, 0.4).translate(0.05, 0.045, 0), '#6a5236');
  },

  coconut: (b, v) => {
    if (v === 0) {
      // Orchard: gathered into a basket.
      basket(b, new Matrix4(), 0.24, 0.13, 9);
      coconut(b, place(-0.07, 0.03, 0.04, 0.4), 'brown', false, 1);
      coconut(b, place(0.08, 0.035, -0.02, 2.0), 'brown', false, 2);
      coconut(b, place(-0.01, 0.03, -0.1, 4.1), 'brown', false, 3);
      coconut(b, place(0.02, 0.1, 0.05, 1.2), 'green', false, 4);
    } else if (v === 1) {
      // By home: the family's offering on a low wooden pat — a coconut with a tilak, betel leaves.
      b.add('teak', new BoxGeometry(0.46, 0.035, 0.32).translate(0, 0.055, 0), '#6a472d');
      for (const sx of [-0.19, 0.19]) for (const sz of [-0.12, 0.12]) b.add('teak', new BoxGeometry(0.04, 0.04, 0.04).translate(sx, 0.02, sz), '#5d3f28');
      const top = 0.0725;
      thali(b, place(0, top, 0), 0.15);
      for (const [x, t] of [[-0.06, 0.4], [0.05, -0.5]] as const) {
        const leaf = mangoLeaf(0.12, 0.08);
        leaf.rotateY(t);
        leaf.translate(x, top + 0.012, -0.05);
        b.add('paint', leaf, '#3f6e2a');
      }
      coconut(b, place(0, top + 0.01, 0.01, 0), 'brown', true, 5);
      b.add('paint', new IcosahedronGeometry(0.012, 1).scale(1, 1.4, 0.4).translate(0, top + 0.1, 0.078), TONE.sindoor);
      hibiscus(b, place(0.09, top + 0.01, 0.07, 1.1), 0.75);
      heap(b, place(-0.08, top + 0.01, 0.07), 0.03, 0.012, '#ece3c8');
    } else {
      // Grove: fresh-picked, on a folded jute sack.
      b.add('cloth', sack(0.62, 0.45), '#8a6d48');
      coconut(b, place(-0.12, 0.03, 0.05, 0.3), 'green', false, 6);
      coconut(b, place(0.1, 0.03, -0.06, 2.6), 'green', false, 7);
      coconut(b, place(0.12, 0.025, 0.12, 1.4), 'brown', false, 8);
      coconut(b, place(-0.1, 0.025, -0.12, 3.9), 'brown', false, 9);
      coconut(b, place(0.0, 0.12, 0.0, 5.0), 'brown', false, 10);
    }
  },

  diya: (b) => {
    // A woven tray from the potter's: stacks of new clay diyas, still unlit.
    b.add('paint', lathe([[0.001, 0], [0.26, 0], [0.28, 0.045], [0.29, 0.05], [0.265, 0.048], [0.25, 0.012], [0.001, 0.012]], 22), '#b08850');
    const top = 0.012;
    const stacks: [number, number, number][] = [[-0.1, 0.06, 6], [0.08, 0.08, 5], [0.02, -0.1, 4], [-0.14, -0.08, 1], [0.16, -0.05, 1]];
    const r = rng(14);
    for (const [x, z, n] of stacks) {
      for (let k = 0; k < n; k++) {
        const clay = new Color('#9c4a2a').multiplyScalar(0.85 + r() * 0.3);
        clayDiya(b, place(x + (r() - 0.5) * 0.004, top + k * 0.017, z + (r() - 0.5) * 0.004, r() * 6.28), clay);
      }
    }
  },

  kumkum: (b) => {
    // A small thali: an open karanda of kumkum, a vati of haldi, akshata, and the closed box.
    thali(b, new Matrix4(), 0.12);
    const on = (x: number, z: number) => place(x, 0.009, z);
    vati(b, on(-0.04, 0.03), TONE.vermilion, 0.04);
    vati(b, on(0.05, 0.04), TONE.turmeric, 0.032);
    heap(b, on(0.02, -0.06), 0.03, 0.012, '#ece3c8');
    // The karanda: a round brass box with a domed, knobbed lid, set beside the plate.
    b.add('brass', lathe([[0.001, 0], [0.04, 0], [0.045, 0.006], [0.045, 0.035], [0.047, 0.04], [0.035, 0.055], [0.012, 0.062], [0.016, 0.075], [0.001, 0.085]], 16).translate(0.17, 0, -0.03));
  },

  marigold: (b) => {
    // A basket heaped with marigolds, a finished garland coiled on top.
    basket(b, new Matrix4(), 0.2, 0.1, 2);
    flowerHeap(b, place(0, 0.08, 0), 0.18, 0.07, 64, MARIGOLDS, 3);
    for (let i = 0; i < 26; i++) {
      const t = (i / 26) * Math.PI * 2;
      const g = new IcosahedronGeometry(0.03, 0).translate(Math.cos(t) * 0.11, 0.17 - 0.02 * Math.cos(t * 2), Math.sin(t) * 0.11);
      b.add('paint', g, i % 5 === 0 ? '#c0283a' : i % 2 ? TONE.marigold : TONE.marigoldYellow);
    }
  },
};

// ---- Pieces ----------------------------------------------------------------------------------

/** A flat square of cut leaf, lying on y = lift, corners slightly curled. */
function leafSquare(size: number, lift: number): BufferGeometry {
  const g = lathe([[size * 0.7, lift + 0.004], [0.001, lift]], 4);
  g.rotateY(Math.PI / 4);
  return g;
}

/** A leaf plate of stitched sal leaves: a flat disc with a slightly raised rim. */
function patravali(r: number): BufferGeometry {
  const g = lathe([[r, 0.012], [r * 0.9, 0.006], [r * 0.3, 0.003], [0.001, 0.003]], 16);
  speckle(g, '#8a8546', 0.14, 9);
  return g;
}

/** A section cut from a banana leaf: its midrib along x, the halves curving up. `v` picks the texture band. */
function bananaCut(len: number, wid: number, v: number): BufferGeometry {
  const nx = 4;
  const nz = 4;
  const pos: number[] = [];
  const uv: number[] = [];
  const P = (i: number, j: number) => {
    const x = -len / 2 + (i / nx) * len;
    const s = (j / nz) * 2 - 1;
    return [x, 0.004 + 0.035 * s * s + 0.006 * Math.sin((i / nx) * Math.PI), (s * wid) / 2];
  };
  const T = (i: number, j: number) => [0.04 + (j / nz) * 0.92, v + (i / nx) * 0.28];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
      const t = [T(i, j), T(i + 1, j), T(i + 1, j + 1), T(i, j + 1)];
      for (const k of [0, 2, 1, 0, 3, 2]) {
        pos.push(...q[k]);
        uv.push(...t[k]);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A folded jute sack lying flat, a little lumpy. */
function sack(w: number, d: number): BufferGeometry {
  const white = new Color(1, 1, 1);
  return clothGrid(6, 5, (u, v) => new Vector3((u - 0.5) * w, 0.012 + 0.012 * Math.sin(u * 9 + v * 4) * Math.sin(v * Math.PI), (0.5 - v) * d), () => white, [w, d], (u, v) => 0.85 + 0.15 * Math.sin(u * 9 + v * 4));
}

/** A clay diya, unlit: a shallow bowl with a pinched spout. */
function clayDiya(b: FestBatch, m: Matrix4, color: Color): void {
  const g = lathe([[0.001, 0], [0.04, 0.004], [0.06, 0.02], [0.066, 0.034], [0.056, 0.031], [0.001, 0.017]], 10);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    // Pinch the spout.
    const x = pos.getX(i);
    if (x > 0.035) pos.setX(i, x + (x - 0.035) * 0.45 * Math.max(0, 1 - Math.abs(pos.getZ(i)) / 0.03));
  }
  g.computeVertexNormals();
  b.add('paint', g, m, color);
}

/** An incense stick: bamboo core, the dark masala coat on its upper part, a glowing tip if lit. */
function stick(b: FestBatch, m: Matrix4, len: number, lit: boolean): void {
  b.add('paint', new BoxGeometry(0.0025, len * 0.3, 0.0025).translate(0, len * 0.15, 0), m, '#b08850');
  b.add('paint', new BoxGeometry(0.0045, len * 0.68, 0.0045).translate(0, len * 0.3 + len * 0.34, 0), m, '#3b2618');
  if (lit) {
    b.add('lamplit', new BoxGeometry(0.005, 0.008, 0.005).translate(0, len * 0.98 + 0.004, 0), m);
    b.add('paint', new BoxGeometry(0.0048, 0.012, 0.0048).translate(0, len * 0.98 - 0.006, 0), m, '#8a8680');
  }
}


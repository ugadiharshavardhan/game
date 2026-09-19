/**
 * Shared pieces of the festival module: its two materials (woven cloth and the painted-cloth
 * atlas), a batch that accepts them, bamboo, rope, and the instanced ornaments — marigolds, mango
 * leaves, bulbs, bunting, flags and paper lanterns — that hang all over the square in six draws.
 */
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  type Group,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import { rng } from './canvasTextures';
import { type AtlasRegion, atlasV, clothAtlas } from './festival.paint';
import { Batch, hashf, lathe, orient } from './geom';
import type { MaterialKit, MatKey } from './materials';
import type { ArtContext } from './runtime';

// ---- Materials and batching --------------------------------------------------------------------

/** The kit's shared materials, plus this module's own: woven cloth and the painted-cloth atlas. */
export type FestKey = MatKey | 'cloth' | 'atlas';

function festMaterial(a: ArtContext, key: FestKey): Material {
  if (key === 'cloth') {
    // Vertex colour is the dye; the weave comes from the fabric set's normal map alone.
    return a.kit.custom('festival:cloth', () => new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.78,
      side: DoubleSide,
      normalMap: a.bank.set('Fabric061').normalMap,
      normalScale: new Vector2(0.5, 0.5),
    }));
  }
  if (key === 'atlas') {
    return a.kit.custom('festival:atlas', () => new MeshStandardMaterial({ map: clothAtlas(a.bank), vertexColors: true, roughness: 0.88 }));
  }
  return a.kit.get(key);
}

/** A Batch whose keys may also be the festival's own materials. */
export class FestBatch {
  private readonly b = new Batch();

  add(key: FestKey, geo: BufferGeometry, placeOrColor?: Matrix4 | Color | string, color?: Color | string): this {
    this.b.add(key as MatKey, geo, placeOrColor, color);
    return this;
  }

  get empty(): boolean {
    return this.b.empty;
  }

  build(a: ArtContext, opts: { cast?: boolean; receive?: boolean; name?: string; noShadow?: MatKey[] } = {}): Group {
    // Batch resolves materials through `get`; route this module's keys to its own materials.
    const kit = { get: (k: FestKey) => festMaterial(a, k) } as unknown as MaterialKit;
    return this.b.build(kit, opts);
  }
}

/** A plane showing one region of the cloth atlas, facing +z, centred at the origin. */
export function atlasPlane(region: AtlasRegion, w: number, h: number): BufferGeometry {
  const g = new PlaneGeometry(w, h);
  const [v0, v1] = atlasV(region);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  return g;
}

// ---- Bamboo and rope ---------------------------------------------------------------------------

const BAMBOO = new Color('#b59b63');
const BAMBOO_GREEN = new Color('#9f9a5e');
const NODE = new Color('#6e5832');

/** A bamboo culm from a to b: node rings every ~0.4 m, dry tan with darker, slightly swollen nodes. */
export function bamboo(a: Vector3, b: Vector3, r: number, seed = 0): BufferGeometry {
  const len = a.distanceTo(b);
  const rr = rng(seed * 31 + 7);
  // Each node is a narrow swollen band: two profile points, darker than the culm between.
  const prof: [number, number][] = [[r, -len / 2]];
  let y = -len / 2 + 0.25 + rr() * 0.25;
  while (y < len / 2 - 0.15) {
    prof.push([r * 1.08, y - 0.014], [r * 1.08, y + 0.014]);
    y += 0.42 + rr() * 0.18;
  }
  prof.push([r * 0.96, len / 2]);
  const g = lathe(prof, r >= 0.07 ? 7 : r > 0.03 ? 6 : 5);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const base = BAMBOO.clone().lerp(BAMBOO_GREEN, rr() * 0.6);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const node = Math.hypot(pos.getX(i), pos.getZ(i)) > r * 1.04 ? 1 : 0;
    const n = 0.9 + hashf(seed, pos.getY(i) * 3.1, 0) * 0.16;
    c.copy(base).lerp(NODE, node * 0.75).multiplyScalar(n);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return orient(g, a, b);
}

/** Rope or wire along a polyline: thin three-sided tubes, one per segment. */
export function rope(b: FestBatch, pts: Vector3[], r: number, color: string): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const len = pts[i].distanceTo(pts[i + 1]);
    if (len < 1e-4) continue;
    b.add('paint', orient(tube3(r, len), pts[i], pts[i + 1]), color);
  }
}

function tube3(r: number, len: number): BufferGeometry {
  const pos: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2;
    const a1 = ((k + 1) / 3) * Math.PI * 2;
    const [x0, z0, x1, z1] = [Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r];
    pos.push(x0, -len / 2, z0, x1, len / 2, z1, x1, -len / 2, z1, x0, -len / 2, z0, x0, len / 2, z0, x1, len / 2, z1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A lashing: a few turns of coir rope round a joint. */
export function lashing(at: Vector3, r: number, dir: Vector3 = new Vector3(0, 1, 0)): BufferGeometry {
  const g = lathe([[r * 1.3, -0.05], [r * 1.42, -0.03], [r * 1.42, 0.03], [r * 1.3, 0.05]], 7);
  return orient(g, at.clone().addScaledVector(dir, -0.05), at.clone().addScaledVector(dir, 0.05));
}

// ---- Walking a line ----------------------------------------------------------------------------

/** Calls fn at equal arc-length steps along a polyline, with the unit tangent there. */
export function along(pts: Vector3[], spacing: number, fn: (p: Vector3, dir: Vector3, i: number) => void, offset = spacing / 2): void {
  let seg = 0;
  let segStart = 0;
  let d = offset;
  let i = 0;
  const lens = pts.slice(1).map((p, k) => p.distanceTo(pts[k]));
  const total = lens.reduce((s, l) => s + l, 0);
  while (d <= total) {
    while (seg < lens.length - 1 && d > segStart + lens[seg]) segStart += lens[seg++];
    const t = lens[seg] > 0 ? (d - segStart) / lens[seg] : 0;
    const p = new Vector3().lerpVectors(pts[seg], pts[seg + 1], t);
    const dir = new Vector3().subVectors(pts[seg + 1], pts[seg]).normalize();
    fn(p, dir, i++);
    d += spacing;
  }
}

// ---- Instanced ornaments -----------------------------------------------------------------------

type Kind = 'marigold' | 'leaf' | 'bulb' | 'bunting' | 'dhwaj' | 'lantern';

/** Garland colours: marigold orange and yellow, with the odd deep-orange head. */
const GARLAND = ['#ee8f1a', '#f09a1c', '#e27514', '#f5c233', '#f2b82a'];
const BUNTING = ['#e8872b', '#7a1f28', '#f2b82a', '#3d6b2a', '#e8872b', '#efe3c8'];
/** Warm bulbs, HDR so the bloom pass picks them up. A few amber and marigold among the white. */
const BULB = [new Color(3.4, 2.4, 1.15), new Color(3.4, 2.4, 1.15), new Color(3.3, 1.75, 0.55), new Color(3.2, 1.45, 0.38)];

const _q = new Quaternion();
const _q2 = new Quaternion();
const _s = new Vector3();
const _m = new Matrix4();
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/**
 * Collects every repeated ornament in the festival and draws each kind as one InstancedMesh.
 * Positions are world-space; the helpers lay ornaments along ropes and garland lines.
 */
export class Ornaments {
  private readonly items = new Map<Kind, { m: Matrix4[]; c: Color[] }>();
  private readonly r = rng(1234);
  /** Shared clock for the swaying cloth (bunting, flags). */
  readonly clock = { value: 0 };

  put(kind: Kind, m: Matrix4, c: Color | string): void {
    let set = this.items.get(kind);
    if (!set) this.items.set(kind, (set = { m: [], c: [] }));
    set.m.push(m.clone());
    set.c.push(c instanceof Color ? c.clone() : new Color(c));
  }

  /** A marigold garland along a line: heads nearly touching, in bands of orange and yellow. */
  garland(pts: Vector3[], o: { spacing?: number; band?: number; palette?: string[]; scale?: number } = {}): void {
    const pal = o.palette ?? GARLAND;
    const band = o.band ?? 7;
    along(pts, o.spacing ?? 0.062, (p, _d, i) => {
      const yellow = Math.floor(i / band) % 3 === 2;
      const hex = yellow ? pal[3 + (i % 2)] : pal[(i * 7 + Math.floor(this.r() * 3)) % 3];
      const s = (o.scale ?? 1) * (0.88 + this.r() * 0.24);
      _q.setFromAxisAngle(Y, this.r() * 6.28);
      this.put('marigold', _m.compose(p, _q, _s.set(s, s * 0.9, s)), hex);
    });
  }

  /** A toran: mango leaves hanging from a cord, a marigold between every pair. */
  toran(pts: Vector3[], spacing = 0.13): void {
    along(pts, spacing, (p, d, i) => {
      const yaw = Math.atan2(d.x, d.z) + Math.PI / 2 + (this.r() - 0.5) * 0.25;
      _q.setFromAxisAngle(Y, yaw);
      _q2.setFromAxisAngle(Z, (this.r() - 0.5) * 0.25);
      _q.multiply(_q2);
      const s = 0.9 + this.r() * 0.25;
      const g = new Color(i % 3 === 0 ? '#4c7d2c' : '#3d6b2a').offsetHSL(0, 0, (this.r() - 0.5) * 0.06);
      this.put('leaf', _m.compose(p, _q, _s.set(s, s, s)), g);
      const mp = p.clone().addScaledVector(d, spacing / 2);
      mp.y -= 0.025;
      _q.setFromAxisAngle(Y, this.r() * 6.28);
      this.put('marigold', _m.compose(mp, _q, _s.set(1, 0.9, 1)), i % 2 ? GARLAND[1] : GARLAND[3]);
    });
  }

  /** Triangle bunting along a rope: flags hang point-down, faces across the rope. */
  bunting(pts: Vector3[], spacing = 0.3, palette = BUNTING): void {
    along(pts, spacing, (p, d, i) => {
      const yaw = Math.atan2(-d.z, d.x);
      _q.setFromAxisAngle(Y, yaw);
      const horiz = Math.hypot(d.x, d.z);
      _q2.setFromAxisAngle(Z, Math.atan2(d.y, horiz));
      _q.multiply(_q2);
      const s = 0.95 + this.r() * 0.1;
      this.put('bunting', _m.compose(p, _q, _s.set(s, s, s)), palette[i % palette.length]);
    });
  }

  /** A string of small bulbs along a wire. */
  bulbs(pts: Vector3[], spacing = 0.3, palette = BULB): void {
    along(pts, spacing, (p, _d, i) => {
      const q = p.clone();
      q.y -= 0.025;
      const c = palette[(i + Math.floor(this.r() * 2)) % palette.length].clone().multiplyScalar(0.85 + this.r() * 0.3);
      this.put('bulb', _m.compose(q, _q.identity(), _s.set(1, 1, 1)), c);
    });
  }

  /** A paper kandil hanging with its top at p. */
  lantern(p: Vector3, color: string, s = 1): void {
    _q.setFromAxisAngle(Y, this.r() * 6.28);
    this.put('lantern', _m.compose(p, _q, _s.set(s, s, s)), new Color(color).multiplyScalar(2.1));
  }

  /** A saffron bhagwa dhwaj with its hoist at p, flying toward yaw (0 = +x). */
  dhwaj(p: Vector3, yaw: number, s = 1): void {
    _q.setFromAxisAngle(Y, yaw);
    this.put('dhwaj', _m.compose(p, _q, _s.set(s, s, s)), '#ec7d1f');
  }

  build(a: ArtContext): void {
    for (const [kind, set] of this.items) {
      const geo = ornamentGeometry(kind);
      const mat = ornamentMaterial(a, kind, this.clock);
      const im = new InstancedMesh(geo, mat, set.m.length);
      im.name = `festival:${kind}`;
      set.m.forEach((m, i) => im.setMatrixAt(i, m));
      set.c.forEach((c, i) => im.setColorAt(i, c));
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = false;
      im.receiveShadow = kind === 'marigold' || kind === 'leaf';
      a.root.add(im);
    }
    const clock = this.clock;
    a.tick.push((_dt, time) => {
      clock.value = time;
    });
    this.items.clear();
  }
}

function ornamentGeometry(kind: Kind): BufferGeometry {
  switch (kind) {
    case 'marigold':
      return new IcosahedronGeometry(0.036, 0);
    case 'bulb':
      return new OctahedronGeometry(0.02).scale(1, 1.45, 1);
    case 'leaf': {
      // A mango leaf hanging from its stalk at the origin, folded slightly along the midrib.
      const P = (x: number, y: number, z = 0) => [x, y, z];
      const L = 0.17;
      const w = 0.028;
      const pts = [P(0, 0), P(w, -L * 0.3, 0.008), P(w * 0.75, -L * 0.7, 0.006), P(0, -L), P(-w * 0.75, -L * 0.7, 0.006), P(-w, -L * 0.3, 0.008)];
      const mid = [P(0, -L * 0.3), P(0, -L * 0.7)];
      const tris = [
        [pts[0], pts[1], mid[0]], [pts[0], mid[0], pts[5]],
        [mid[0], pts[1], pts[2]], [mid[0], pts[2], mid[1]], [mid[0], mid[1], pts[4]], [mid[0], pts[4], pts[5]],
        [mid[1], pts[2], pts[3]], [mid[1], pts[3], pts[4]],
      ];
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(tris.flat(2), 3));
      g.computeVertexNormals();
      return g;
    }
    case 'bunting': {
      // Hangs from its top edge (along x); pointed tip down.
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute([-0.105, 0, 0, 0, -0.27, 0, 0.105, 0, 0], 3));
      g.computeVertexNormals();
      return g;
    }
    case 'dhwaj':
      return dhwajGeometry();
    case 'lantern':
      return kandilGeometry();
  }
}

/**
 * The bhagwa dhwaj: two saffron pennants, one above the other, hoisted on the pole (x = 0) and
 * flying along +x. Subdivided along x so the wave shader has vertices to move.
 */
function dhwajGeometry(): BufferGeometry {
  const L = 0.95;
  const H = 0.78;
  const pos: number[] = [];
  const cols = 6;
  // Each pennant: hoist edge from y0 (top) to y1 (bottom), tip at (L, yt).
  for (const [y0, y1, yt] of [[0, -H * 0.56, -H * 0.3], [-H * 0.44, -H, -H * 0.8]]) {
    for (let k = 0; k < cols; k++) {
      const t0 = k / cols;
      const t1 = (k + 1) / cols;
      const top = (t: number) => y0 + (yt - y0) * t;
      const bot = (t: number) => y1 + (yt - y1) * t;
      const x0 = t0 * L;
      const x1 = t1 * L;
      pos.push(x0, top(t0), 0, x0, bot(t0), 0, x1, top(t1), 0);
      if (k < cols - 1) pos.push(x1, top(t1), 0, x0, bot(t0), 0, x1, bot(t1), 0);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A hexagonal paper kandil: a lantern of tissue paper on a bamboo-stick frame, with paper tails.
 * Hangs from its top at the origin. Vertex colour shades it: brightest at the waist where the lamp
 * inside shows through, the caps and tails darker.
 */
function kandilGeometry(): BufferGeometry {
  const body = lathe([[0.012, 0], [0.05, -0.02], [0.13, -0.1], [0.13, -0.24], [0.06, -0.33], [0.012, -0.35]], 6);
  const parts: BufferGeometry[] = [body.toNonIndexed()];
  body.dispose();
  const tails: number[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 0.07;
    const z = Math.sin(a) * 0.07;
    const tx = -Math.sin(a) * 0.012;
    const tz = Math.cos(a) * 0.012;
    const y0 = -0.3;
    const y1 = -0.3 - 0.26 - (k % 2) * 0.06;
    tails.push(x - tx, y0, z - tz, x + tx, y0, z + tz, x - tx * 0.6, y1, z - tz * 0.6, x + tx, y0, z + tz, x + tx * 0.6, y1, z + tz * 0.6, x - tx * 0.6, y1, z - tz * 0.6);
  }
  const tg = new BufferGeometry();
  tg.setAttribute('position', new Float32BufferAttribute(tails, 3));
  tg.computeVertexNormals();
  parts.push(tg);
  const out = new BufferGeometry();
  const all: number[] = [];
  const colors: number[] = [];
  for (const p of parts) {
    const pos = p.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      all.push(pos.getX(i), y, pos.getZ(i));
      const tail = y < -0.34;
      const waist = 1 - Math.min(Math.abs(y + 0.17) / 0.18, 1);
      const k = tail ? 0.32 : 0.42 + 0.58 * waist;
      colors.push(k, k, k);
    }
    p.dispose();
  }
  out.setAttribute('position', new Float32BufferAttribute(all, 3));
  out.setAttribute('color', new Float32BufferAttribute(colors, 3));
  out.computeVertexNormals();
  return out;
}

function ornamentMaterial(a: ArtContext, kind: Kind, clock: { value: number }): Material {
  switch (kind) {
    case 'marigold':
      return a.kit.custom('festival:marigold', () => new MeshStandardMaterial({ roughness: 0.92, flatShading: true }));
    case 'leaf':
      return a.kit.custom('festival:leaf', () => new MeshStandardMaterial({ roughness: 0.62, side: DoubleSide }));
    case 'bulb':
      return a.kit.custom('festival:bulb', () => new MeshBasicMaterial());
    case 'lantern':
      return a.kit.custom('festival:lantern', () => new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
    case 'bunting':
      return a.kit.custom('festival:bunting', () => swaying(new MeshStandardMaterial({ roughness: 0.85, side: DoubleSide }), clock, 'bunting'));
    case 'dhwaj':
      return a.kit.custom('festival:dhwaj', () => swaying(new MeshStandardMaterial({ roughness: 0.8, side: DoubleSide }), clock, 'dhwaj'));
  }
}

/**
 * Cloth in the evening breeze, in the vertex shader: bunting swings about the rope; the dhwaj
 * ripples away from its pole. Each instance gets its own phase from where it hangs.
 */
function swaying(m: MeshStandardMaterial, clock: { value: number }, mode: 'bunting' | 'dhwaj'): MeshStandardMaterial {
  const motion = mode === 'bunting'
    ? `
      float sw = sin(uClock * 1.7 + ph) * 0.2 + sin(uClock * 3.9 + ph * 2.3) * 0.07;
      float cs = cos(sw);
      float sn = sin(sw);
      transformed = vec3(transformed.x, transformed.y * cs - transformed.z * sn, transformed.y * sn + transformed.z * cs);`
    : `
      float k = transformed.x;
      transformed.z += (sin(k * 3.4 - uClock * 3.6 + ph) * 0.08 + sin(k * 7.3 - uClock * 6.1 + ph) * 0.025) * k;
      transformed.y -= 0.06 * k * k;`;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uClock = clock;
    shader.vertexShader = `uniform float uClock;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 0.91;
      #else
        float ph = 0.0;
      #endif
      ${motion}`,
    );
  };
  m.customProgramCacheKey = () => `festival-${mode}`;
  return m;
}

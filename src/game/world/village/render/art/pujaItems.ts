/**
 * The seven puja items as the player finds them in the village — arranged the way a family or a
 * shopkeeper would set them out, resting on the ground, a stall or a counter (never floating):
 *
 *   flowers   a bamboo topli of marigold bunches, each crowned with a red hibiscus
 *   durva     bundles of twenty-one blades tied with red thread, on a leaf beside a living clump
 *   coconut   a whole coconut, fibre tuft up, a red kalava thread and kumkum dots
 *   bananas   a hand of ripe bananas on a banana leaf
 *   rice      akshata — rice and kumkum — heaped in a brass bowl, a wooden payli beside it
 *   diya      new clay diyas on a woven tray, one already burning
 *   modak     ukadiche modak on a brass thali over banana leaf, still steaming
 *
 * Each item is a static base, a "units" mesh (one unit per thing the spot gives, so a partly-taken
 * arrangement shows what's left), and a little life: sway in the breeze, a flame, steam, a glint.
 * Every material is a per-item clone with a highlight term (a warm rim), and a soft pool of light
 * gathers on the ground as the player approaches — so items read at a glance without markers.
 *
 * The same models render the bag's icons (renderItemIcons).
 */
import {
  AdditiveBlending,
  AmbientLight,
  type BufferGeometry,
  Box3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ITEM_IDS, type ItemId } from '../../../../../shared/items';
import type { PujaItemVisual } from '../../../../items/PujaItem';
import type { OfferingSpotDef, OfferingSurface } from '../../types';
import type { DropVisual } from '../types';
import { flame, glow, rng } from './canvasTextures';
import { FestBatch } from './festival.kit';
import { basket, coconut, diya, durva, flowerHeap, hibiscus, MARIGOLDS, modak, speckle, thali, twoSided } from './festival.things';
import { hashf, lathe, place } from './geom';
import { TONE } from './palette';
import type { ArtContext } from './runtime';

/** Items are small; a touch larger than life so they read from a few metres away. */
const S = 1.3;
/** Hidden beyond this distance. */
const CULL = 48;

// ---- the glow -----------------------------------------------------------------------------------

interface Glow {
  uGlow: { value: number };
}

/** A per-item clone of a material with a warm, rim-weighted emissive term driven by `uGlow`. */
function glowing(m: Material, g: Glow): Material {
  const c = m.clone();
  c.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = g.uGlow;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uGlow;\nvoid main() {')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float facing = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
          float rim = 1.0 - facing;
          totalEmissiveRadiance += vec3( 1.0, 0.68, 0.3 ) * uGlow * ( 0.12 + 0.88 * rim * rim );
        }`,
      );
  };
  c.customProgramCacheKey = () => 'puja-glow';
  return c;
}

// ---- building an arrangement ------------------------------------------------------------------

interface Arrangement {
  base: FestBatch;
  /** One list of geometries per unit ('paint' material, vertex-coloured). */
  units: BufferGeometry[][];
  /** Rice is a heap that shrinks; everything else is counted things that disappear one by one. */
  mode: 'discrete' | 'scale';
  /** A part that moves in the breeze ('paint'). */
  sway: BufferGeometry[];
  swayAmount: number;
  /** Flames: which unit carries each, and where (local). */
  flames: { unit: number; at: Vector3 }[];
  steam: boolean;
  /** Where the glint appears, and the top of the arrangement. */
  top: Vector3;
}

/** Runs a builder into its own FestBatch and returns the geometry it made (all 'paint'). */
function paintGeometry(a: ArtContext, fn: (b: FestBatch) => void): BufferGeometry[] {
  const b = new FestBatch();
  fn(b);
  const g = b.build(a, { name: 'tmp' });
  const out: BufferGeometry[] = [];
  g.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) out.push(m.geometry);
  });
  return out;
}

function arrange(a: ArtContext, item: ItemId, quantity: number, surface: OfferingSurface, seed: number): Arrangement {
  const r = rng(seed);
  const base = new FestBatch();
  const out: Arrangement = { base, units: [], mode: 'discrete', sway: [], swayAmount: 0, flames: [], steam: false, top: new Vector3(0, 0.2, 0) };
  const unit = (fn: (b: FestBatch) => void) => out.units.push(paintGeometry(a, fn));
  const ground = surface === 'ground';

  switch (item) {
    case 'flowers': {
      basket(base, place(0, 0, 0, r() * 3, S), 0.15, 0.09, seed);
      for (let k = 0; k < quantity; k++) {
        const ang = (k / Math.max(quantity, 1)) * Math.PI * 2 + 0.4;
        const d = quantity > 1 ? 0.07 : 0;
        unit((b) => {
          flowerHeap(b, place(Math.cos(ang) * d * S, 0.075 * S, Math.sin(ang) * d * S, 0, S), 0.075, 0.055, 11, MARIGOLDS, seed + k, 0.03);
          hibiscus(b, place(Math.cos(ang) * d * S, 0.13 * S, Math.sin(ang) * d * S, r() * 3, S * 1.15));
        });
      }
      if (ground) {
        // A few petals fallen round the basket.
        for (let i = 0; i < 9; i++) {
          const ang = r() * Math.PI * 2;
          const d = (0.2 + r() * 0.18) * S;
          base.add('paint', new IcosahedronGeometry(0.012 * S, 0).scale(1, 0.35, 1).translate(Math.cos(ang) * d, 0.004, Math.sin(ang) * d), MARIGOLDS[i % MARIGOLDS.length]);
        }
      }
      out.top.set(0, 0.2 * S, 0);
      out.swayAmount = 0.02;
      break;
    }

    case 'durva': {
      leaf(base, 0.32 * S, 0.2 * S, 0.004, seed);
      for (let k = 0; k < quantity; k++) {
        unit((b) => durva(b, place(-0.08 * S, 0.006, (k - (quantity - 1) / 2) * 0.06 * S, (r() - 0.5) * 0.3, S), seed + k * 5));
      }
      if (ground) {
        // The living clump it was cut from, stirring in the breeze.
        out.sway.push(...durvaClump(0.22 * S, 0.02 * S, seed));
        out.swayAmount = 0.07;
      }
      out.top.set(0, 0.1 * S, 0);
      break;
    }

    case 'coconut': {
      if (ground) {
        // Dry palm leaflets it rests on.
        for (let i = 0; i < 4; i++) base.add('paint', new CylinderGeometry(0.008, 0.004, 0.42 * S, 4).rotateZ(Math.PI / 2).rotateY(r() * Math.PI).translate((r() - 0.5) * 0.08, 0.006, (r() - 0.5) * 0.08), '#a98d5c');
      } else {
        thali(base, place(0, 0, 0, 0, S), 0.14);
      }
      unit((b) => {
        const y0 = ground ? 0.004 : 0.022 * S;
        coconut(b, place(0, y0, 0, r() * 3, S), 'brown', true, seed);
        // Red kalava thread round its waist, and kumkum and haldi dots on its face.
        b.add('paint', lathe([[0.068 * S, 0.068 * S], [0.072 * S, 0.075 * S], [0.068 * S, 0.082 * S]], 16).translate(0, y0, 0), TONE.vermilion);
        for (const [dx, c] of [[-0.018, TONE.sindoor], [0.018, TONE.turmeric]] as const) {
          b.add('paint', new CylinderGeometry(0.011 * S, 0.011 * S, 0.004, 8).rotateX(Math.PI / 2).translate(dx * S, y0 + 0.1 * S, 0.066 * S), c);
        }
      });
      out.top.set(0, 0.24 * S, 0);
      break;
    }

    case 'bananas': {
      leaf(base, 0.38 * S, 0.2 * S, 0.004, seed);
      // The crown the fingers grow from.
      base.add('paint', new CylinderGeometry(0.014 * S, 0.02 * S, 0.07 * S, 6).rotateZ(Math.PI / 2).translate(-0.1 * S, 0.03 * S, 0), '#5a5a2a');
      for (let k = 0; k < quantity; k++) {
        const t = quantity > 1 ? k / (quantity - 1) - 0.5 : 0;
        unit((b) => b.add('paint', bananaFinger(t, seed + k), place(-0.07 * S, 0.028 * S, 0, 0, S)));
      }
      out.top.set(0, 0.12 * S, 0);
      break;
    }

    case 'rice': {
      // Brass bowl; a wooden payli (measure) beside it with a little spilled on a leaf.
      base.add('brass', lathe([[0.001, 0], [0.07, 0], [0.1, 0.035], [0.11, 0.066], [0.104, 0.07], [0.094, 0.04], [0.06, 0.012], [0.001, 0.012]].map(([x, y]) => [x * S, y * S] as [number, number]), 18));
      base.add('paint', lathe([[0.001, 0], [0.045, 0], [0.05, 0.06], [0.046, 0.062], [0.041, 0.006], [0.001, 0.006]].map(([x, y]) => [x * S, y * S] as [number, number]), 12).translate(0.17 * S, 0, 0.05 * S), '#7a5534');
      leaf(base, 0.12 * S, 0.08 * S, 0.002, seed, new Matrix4().makeTranslation(0.14 * S, 0, -0.08 * S));
      base.add('paint', rice(0.035 * S, 0.012 * S, seed + 9).translate(0.14 * S, 0.004, -0.08 * S));
      out.mode = 'scale';
      unit((b) => b.add('paint', rice(0.1 * S, 0.075 * S, seed).translate(0, 0.02 * S, 0)));
      out.top.set(0, 0.16 * S, 0);
      break;
    }

    case 'diya': {
      basket(base, place(0, 0, 0, 0, [S, 0.35 * S, S]), 0.17, 0.08, seed);
      const n = Math.max(quantity, 1);
      for (let k = 0; k < quantity; k++) {
        const ang = (k / n) * Math.PI * 2 + 0.5;
        const d = n > 1 ? 0.075 * S : 0;
        const m = place(Math.cos(ang) * d, 0.03 * S, Math.sin(ang) * d, -ang, S);
        unit((b) => {
          diya(b, m, '#a8583a', true);
          // Ghee catching the light in the lit one; unused ones are bare clay.
          if (k === 0) b.add('paint', new CylinderGeometry(0.045, 0.045, 0.004, 10).translate(0, 0.032, 0), m, '#c49a3a');
        });
        if (k === 0) out.flames.push({ unit: 0, at: new Vector3(0.048, 0.04, 0).applyMatrix4(m) });
      }
      out.top.set(0, 0.1 * S, 0);
      break;
    }

    case 'modak': {
      leaf(base, 0.4 * S, 0.4 * S, 0.003, seed);
      thali(base, place(0, 0.006, 0, 0, S), 0.16);
      for (let k = 0; k < quantity; k++) {
        const ring = k < quantity - 1 || quantity === 1 ? k : -1;
        const ang = (ring / Math.max(quantity - 1, 1)) * Math.PI * 2;
        const d = ring < 0 ? 0 : 0.085 * S;
        unit((b) => modak(b, place(Math.cos(ang) * d, 0.016 * S, Math.sin(ang) * d, r() * 3, S)));
      }
      out.steam = true;
      out.top.set(0, 0.12 * S, 0);
      break;
    }
  }
  return out;
}

/** A square of banana leaf, lying flat, gently curled at the edges, midrib down the middle. */
function leaf(b: FestBatch, len: number, wid: number, lift: number, seed: number, m?: Matrix4): void {
  const pts: number[] = [];
  const nx = 6;
  const nz = 4;
  const y = (x: number, z: number) => lift + 0.012 * (Math.abs(z) / (wid / 2)) ** 2 + 0.004 * Math.sin(x * 30 + seed);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x0 = -len / 2 + (len * i) / nx;
      const x1 = -len / 2 + (len * (i + 1)) / nx;
      const z0 = -wid / 2 + (wid * j) / nz;
      const z1 = -wid / 2 + (wid * (j + 1)) / nz;
      pts.push(x0, y(x0, z0), z0, x0, y(x0, z1), z1, x1, y(x1, z1), z1, x0, y(x0, z0), z0, x1, y(x1, z1), z1, x1, y(x1, z0), z0);
    }
  }
  const g = twoSided(pts);
  // Leaf green with paler veins running across, and the midrib.
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const rib = Math.abs(z) < wid * 0.04 ? 1 : 0;
    c.set('#3f7a2a').lerp(new Color('#8fae4a'), rib * 0.8 + 0.15 * Math.max(0, Math.sin(x * 90))).multiplyScalar(0.92 + hashf(x * 5, z * 5, seed) * 0.12);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  b.add('paint', g, m);
}

/** A tuft of living durva: short, three-bladed shoots fanning from the soil. */
function durvaClump(radius: number, lift: number, seed: number): BufferGeometry[] {
  const r = rng(seed * 3 + 11);
  const pts: number[] = [];
  for (let i = 0; i < 60; i++) {
    const ang = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radius;
    const x = Math.cos(ang) * d + radius * 0.9;
    const z = Math.sin(ang) * d;
    const h = 0.06 + r() * 0.07;
    const lean = (r() - 0.5) * 0.6;
    const w = 0.004;
    const tipX = x + Math.cos(ang + lean) * h * 0.4;
    const tipZ = z + Math.sin(ang + lean) * h * 0.4;
    pts.push(x - w, lift, z, x + w, lift, z, tipX, lift + h, tipZ);
  }
  const g = twoSided(pts);
  speckle(g, '#5f9a38', 0.18, seed);
  return [g];
}

/** One banana, curving up from the crown along +x. `t` fans it across the hand (−0.5..0.5). */
function bananaFinger(t: number, seed: number): BufferGeometry {
  const g = new IcosahedronGeometry(0.022, 2);
  g.scale(5.2, 1, 1);
  // Curve it: lift the tip.
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setY(i, pos.getY(i) + 0.35 * (x / 0.115) ** 2 * 0.05);
  }
  g.computeVertexNormals();
  g.translate(0.11, 0, 0);
  g.rotateY(t * 0.9);
  g.translate(0, 0, t * 0.04);
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const ends = Math.max(0, Math.abs(x - 0.11) / 0.115 - 0.8) * 5;
    c.set('#e2c04a').lerp(new Color('#6a5a2a'), Math.min(ends, 1) * 0.8).multiplyScalar(0.94 + hashf(x * 50, seed, pos.getZ(i) * 50) * 0.1);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

/** Akshata: rice grains and kumkum as a mosaic mound. */
function rice(r: number, h: number, seed: number): BufferGeometry {
  const g = lathe([[0.001, 0], [r, 0], [r * 0.8, h * 0.55], [r * 0.4, h * 0.92], [0.001, h]], 24);
  const nonIndexed = g.toNonIndexed();
  g.dispose();
  const pos = nonIndexed.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const white = new Color('#f1ead8');
  const red = new Color('#c8321e');
  const c = new Color();
  for (let i = 0; i < pos.count; i += 3) {
    const h0 = hashf(pos.getX(i) * 97 + seed, pos.getY(i) * 97, pos.getZ(i) * 97);
    c.copy(h0 > 0.82 ? red : white).multiplyScalar(0.9 + h0 * 0.12);
    for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (i + v) * 3);
  }
  nonIndexed.setAttribute('color', new Float32BufferAttribute(col, 3));
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

// ---- the visual ---------------------------------------------------------------------------------

class ItemVisual implements PujaItemVisual {
  readonly outer = new Group();
  readonly model = new Group();
  private readonly glowU: Glow = { uGlow: { value: 0 } };
  private readonly units: Mesh | null = null;
  private readonly unitCounts: number[] = [0];
  private readonly sway: Mesh | null = null;
  private readonly swayAmount: number;
  private readonly flames: { unit: number; sprite: Sprite }[] = [];
  private readonly steam: Sprite[] = [];
  private readonly glint: Sprite;
  private readonly halo: Mesh;
  get haloMesh(): Mesh {
    return this.halo;
  }
  private readonly mode: 'discrete' | 'scale';
  private approach = 0;
  private focused = 0;
  private left: number;
  private readonly phase: number;
  private readonly owned: Array<{ dispose(): void }> = [];

  constructor(a: ArtContext, arr: Arrangement, quantity: number, seed: number) {
    this.left = quantity;
    this.mode = arr.mode;
    this.swayAmount = arr.swayAmount;
    this.phase = hashf(seed, 3, 7) * 10;
    this.outer.add(this.model);

    const base = arr.base.build(a, { name: 'puja-item', cast: true });
    base.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.material = this.own(glowing(m.material as Material, this.glowU));
      this.owned.push(m.geometry);
    });
    this.model.add(base);

    const paint = a.kit.get('paint');
    if (arr.units.length) {
      const flat = arr.units.flat();
      let n = 0;
      for (const u of arr.units) {
        for (const g of u) n += g.getAttribute('position').count;
        this.unitCounts.push(n);
      }
      const merged = mergeGeometries(flat, false);
      for (const g of flat) g.dispose();
      if (merged) {
        this.units = new Mesh(merged, this.own(glowing(paint, this.glowU)));
        this.units.castShadow = true;
        this.units.receiveShadow = true;
        this.owned.push(merged);
        this.model.add(this.units);
      }
    }
    if (arr.sway.length) {
      const merged = mergeGeometries(arr.sway, false);
      for (const g of arr.sway) g.dispose();
      if (merged) {
        this.sway = new Mesh(merged, this.own(glowing(paint, this.glowU)));
        this.sway.receiveShadow = true;
        this.owned.push(merged);
        this.model.add(this.sway);
      }
    }

    for (const f of arr.flames) {
      const s = new Sprite(this.own(new SpriteMaterial({ map: flame(a.bank), color: new Color(2.2, 1.55, 0.85), blending: AdditiveBlending, depthWrite: false, transparent: true })));
      s.center.set(0.5, 0.15);
      s.scale.set(0.045, 0.09, 1);
      s.position.copy(f.at);
      this.model.add(s);
      this.flames.push({ unit: f.unit, sprite: s });
    }
    if (arr.steam) {
      for (let i = 0; i < 3; i++) {
        const s = new Sprite(this.own(new SpriteMaterial({ map: glow(a.bank), color: new Color('#f4efe6'), blending: NormalBlending, depthWrite: false, transparent: true, opacity: 0 })));
        s.position.set((i - 1) * 0.05, arr.top.y, (i % 2) * 0.04 - 0.02);
        this.model.add(s);
        this.steam.push(s);
      }
    }

    // The glint: a four-point star that catches the eye every few seconds.
    this.glint = new Sprite(this.own(new SpriteMaterial({ map: star(a), color: new Color(1.8, 1.5, 1.1), blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })));
    this.glint.position.copy(arr.top).add(new Vector3(0.04, 0.02, 0.03));
    this.model.add(this.glint);

    // The pool of warm light on the surface, gathering as the player comes near.
    this.halo = new Mesh(
      new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      this.own(new MeshBasicMaterial({ map: glow(a.bank), color: new Color('#ffb04a'), blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 })),
    );
    this.owned.push(this.halo.geometry);
    this.halo.position.y = 0.006;
    this.halo.scale.setScalar(0.9);
    this.halo.renderOrder = 1;
    this.model.add(this.halo);
  }

  /** A still life for the bag's icon: no glint, no glow on the ground. */
  forIcon(): void {
    this.glint.visible = false;
    this.halo.visible = false;
    this.update(0, 1.1);
  }

  private own<M extends Material>(m: M): M {
    this.owned.push(m);
    return m;
  }

  setHighlight(approach: number, focused: boolean): void {
    this.approach = approach;
    this.focused = focused ? 1 : 0;
  }

  setRemaining(left: number, total: number): void {
    this.left = left;
    this.model.visible = left > 0;
    if (!this.units) return;
    if (this.mode === 'scale') {
      const k = Math.max(left / Math.max(total, 1), 0.25);
      this.units.scale.set(Math.sqrt(k), k, Math.sqrt(k));
    } else {
      this.units.geometry.setDrawRange(0, this.unitCounts[Math.min(left, this.unitCounts.length - 1)]);
    }
    for (const f of this.flames) f.sprite.visible = f.unit < left || this.mode === 'scale';
  }

  update(dt: number, time: number): void {
    const t = time + this.phase;
    // Glow: a warm rim as you approach, stronger (and gently breathing) when it's the target.
    const target = this.approach * 0.35 + this.focused * (0.45 + 0.15 * Math.sin(t * 4));
    const u = this.glowU.uGlow;
    u.value += (target - u.value) * Math.min(dt * 6, 1);
    (this.halo.material as MeshBasicMaterial).opacity = u.value * 0.55;
    this.halo.visible = u.value > 0.01;

    // The breeze.
    if (this.units && this.swayAmount) {
      this.units.rotation.z = Math.sin(t * 1.3) * this.swayAmount * 0.35;
      this.units.rotation.x = Math.sin(t * 0.9 + 1) * this.swayAmount * 0.25;
    }
    if (this.sway) {
      this.sway.rotation.z = Math.sin(t * 1.7) * this.swayAmount;
      this.sway.rotation.x = Math.sin(t * 1.1 + 2) * this.swayAmount * 0.6;
    }
    // Flames flicker.
    for (const f of this.flames) {
      const k = 0.85 + 0.1 * Math.sin(t * 11) + 0.06 * Math.sin(t * 23.7);
      f.sprite.scale.set(0.045 * k, 0.09 * (0.9 + 0.2 * k), 1);
    }
    // Steam curls up and thins out.
    this.steam.forEach((s, i) => {
      const c = ((t * 0.35 + i / 3) % 1 + 1) % 1;
      s.position.y = this.glint.position.y - 0.02 + c * 0.35;
      s.position.x = (i - 1) * 0.04 + Math.sin(t * 1.3 + i) * 0.03 * c;
      s.scale.setScalar(0.08 + c * 0.16);
      (s.material as SpriteMaterial).opacity = 0.16 * Math.sin(Math.PI * c);
      s.visible = this.left > 0;
    });
    // A glint every few seconds (more often once you're close).
    const every = 3.6 - 1.4 * this.approach;
    const g = (t % every) / 0.45;
    const pulse = g < 1 ? Math.sin(Math.PI * g) : 0;
    (this.glint.material as SpriteMaterial).opacity = pulse * (0.55 + 0.45 * this.approach);
    this.glint.visible = pulse > 0.01;
    this.glint.scale.setScalar(0.05 + 0.1 * pulse);
    this.glint.material.rotation = t * 0.6;
  }

  dispose(): void {
    this.outer.removeFromParent();
    for (const d of this.owned) d.dispose();
  }
}

/** A soft four-pointed star for the glint. */
function star(a: ArtContext) {
  return a.bank.canvas('puja-glint', [64, 64], (g, w) => {
    const c = w / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.12, 'rgba(255,240,200,0.7)');
    grad.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = grad;
    for (const [sx, sy] of [[1, 0.09], [0.09, 1]]) {
      g.beginPath();
      g.ellipse(c, c, c * sx, c * sy, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(c, c, c * 0.25, 0, Math.PI * 2);
    g.fill();
  }, true, false);
}

// ---- the module -------------------------------------------------------------------------------

export interface PujaItemArt {
  visuals: Map<string, PujaItemVisual>;
  makeDropVisual(at: Vector3): DropVisual;
  icons: Promise<Partial<Record<ItemId, string>>>;
}

/** Every puja item in the layout, drawn; each animates through its PujaItem's update. */
export function buildPujaItems(a: ArtContext): PujaItemArt {
  const visuals = new Map<string, PujaItemVisual>();
  for (const spot of a.layout.offerings) visuals.set(spot.id, visualFor(a, spot));
  return {
    visuals,
    makeDropVisual: (at) => dropVisual(a, at),
    // After the first frame's work: the icons don't hold up loading.
    icons: new Promise((resolve) => setTimeout(() => resolve(renderItemIcons(a)), 0)),
  };
}

function visualFor(a: ArtContext, spot: OfferingSpotDef): ItemVisual {
  const seed = hashId(spot.id);
  const v = new ItemVisual(a, arrange(a, spot.item, spot.quantity, spot.surface, seed), spot.quantity, seed);
  v.outer.name = `puja-item:${spot.id}`;
  v.outer.position.set(spot.x, spot.y, spot.z);
  v.outer.rotation.y = spot.rot;
  a.root.add(v.outer);
  a.culler.add(v.outer, new Vector3(spot.x, 0, spot.z), CULL);
  return v;
}

/**
 * Offerings that fell when the moon overwhelmed the player: a red cloth bundle (potli), knotted at
 * the top, with a marigold or two spilled beside it.
 */
function dropVisual(a: ArtContext, at: Vector3): DropVisual {
  const base = new FestBatch();
  const knot: [number, number][] = [[0.001, 0], [0.1, 0.01], [0.15, 0.06], [0.14, 0.12], [0.08, 0.18], [0.035, 0.2], [0.05, 0.25], [0.03, 0.27], [0.001, 0.27]];
  const g = lathe(knot.map(([x, y]) => [x * S, y * S] as [number, number]), 14);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    const k = 1 + 0.08 * Math.sin(ang * 7) * Math.min(pos.getY(i) / 0.1, 1);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  base.add('cloth', g, '#a8242a');
  base.add('paint', new CylinderGeometry(0.05 * S, 0.05 * S, 0.02 * S, 10).translate(0, 0.19 * S, 0), TONE.marigoldYellow);
  for (const [x, z, c] of [[0.22, 0.08, TONE.marigold], [0.18, -0.14, TONE.marigoldYellow]] as const) base.add('paint', new IcosahedronGeometry(0.03 * S, 0).translate(x, 0.02, z), c);
  const arr: Arrangement = { base, units: [], mode: 'discrete', sway: [], swayAmount: 0, flames: [], steam: false, top: new Vector3(0, 0.3 * S, 0) };
  const v = new ItemVisual(a, arr, 1, Math.floor(at.x * 100 + at.z));
  v.outer.position.copy(at);
  a.root.add(v.outer);
  return v;
}

// ---- icons --------------------------------------------------------------------------------------

/** How each item is shown in the bag: a full arrangement. */
const ICON_QUANTITY: Record<ItemId, number> = { flowers: 3, durva: 2, coconut: 1, bananas: 4, rice: 3, diya: 3, modak: 6 };

/**
 * Renders every item's model to a 256 px transparent image, lit like a still life (warm key, cool
 * fill), from a three-quarter view above. Uses the game's own renderer once, at load.
 */
export function renderItemIcons(a: ArtContext): Partial<Record<ItemId, string>> {
  const size = 256;
  const renderer = a.renderer;
  const target = new WebGLRenderTarget(size, size, { samples: 4 });
  target.texture.colorSpace = SRGBColorSpace;
  const scene = new Scene();
  // A still-life light: warm key from the front-left, a cool rim behind, a soft fill.
  const key = new DirectionalLight('#fff1dc', 3.2);
  key.position.set(1.5, 2.4, 2.2);
  const rim = new DirectionalLight('#b9ccff', 1.6);
  rim.position.set(-2, 1.4, -1.6);
  scene.add(key, rim, new AmbientLight('#fff6ea', 1.4));
  const camera = new PerspectiveCamera(28, 1, 0.01, 10);
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const out: Partial<Record<ItemId, string>> = {};
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new Color());
  const prevAlpha = renderer.getClearAlpha();
  const env = scene.environment;
  scene.environment = a.scene.environment;
  scene.environmentIntensity = 0.6;

  for (const id of ITEM_IDS) {
    const v = new ItemVisual(a, arrange(a, id, ICON_QUANTITY[id], 'counter', 7), ICON_QUANTITY[id], 7);
    v.forIcon();
    scene.add(v.outer);
    // Frame the arrangement itself — not its (hidden) glow, glint or steam.
    const box = new Box3();
    v.model.traverse((o) => {
      if ((o as Mesh).isMesh && o !== v.haloMesh) box.expandByObject(o, true);
    });
    const centre = box.getCenter(new Vector3());
    const radius = box.getSize(new Vector3()).length() / 2;
    const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 0.92;
    camera.position.copy(centre).add(new Vector3(0.55, 0.62, 0.9).normalize().multiplyScalar(dist));
    camera.lookAt(centre);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    if (ctx) {
      const img = ctx.createImageData(size, size);
      // WebGL rows run bottom-up.
      for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      ctx.putImageData(img, 0, 0);
      out[id] = canvas.toDataURL('image/png');
    }
    v.dispose();
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  scene.environment = env;
  target.dispose();
  return out;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

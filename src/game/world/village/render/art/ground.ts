/**
 * The ground: one mesh, one draw call. A splat-blended shader lays dusty grass, packed-earth roads,
 * farm soil, temple paving and lush garden grass from two painted splat maps — roads with soft,
 * worn edges and cart tracks; darkening under trees and against walls; damp earth by the water.
 * Outside the playable octagon the land rises into low hills.
 */
import {
  CanvasTexture,
  Color,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Texture,
  Vector2,
} from 'three';
import { houseDims, shopDims, templeDims, toWorld } from '../../dims';
import type { P2, VillageLayout } from '../../types';
import { rng } from './canvasTextures';
import type { ArtContext } from './runtime';

/** Terrain extends this far beyond the playable bounds, rising into hills. */
const MARGIN = 75;
const SPLAT = 1024;

export interface Ground {
  mesh: Mesh;
  /** Height of the visual terrain at (x, z) — 0 inside the village. */
  heightAt(x: number, z: number): number;
  /** Splat weights at a point: road, soil, paving (0..1), for scattering grass. */
  surfaceAt(x: number, z: number): { road: number; soil: number; paving: number; lush: number };
  /** Metres outside the playable edge (negative inside). */
  outside(x: number, z: number): number;
  dispose(): void;
}

export function buildGround(a: ArtContext): Ground {
  const L = a.layout;
  const b = L.bounds;
  const minX = b.minX - MARGIN;
  const maxX = b.maxX + MARGIN;
  const minZ = b.minZ - MARGIN;
  const maxZ = b.maxZ + MARGIN;
  const W = maxX - minX;
  const D = maxZ - minZ;
  const poly = playablePolygon(L);

  // ---- Heights: flat village, hills beyond the edge ------------------------------------------
  const noise = valueNoise(7);
  const outside = (x: number, z: number) => signedDistance(poly, x, z);
  const heightAt = (x: number, z: number) => {
    const d = outside(x, z);
    if (d <= 1.5) return 0;
    const t = Math.min((d - 1.5) / 30, 1);
    const ease = t * t * (3 - 2 * t);
    return ease * (4 + 9 * noise(x * 0.035, z * 0.035) + 3 * noise(x * 0.11, z * 0.11));
  };

  const seg = 1.6;
  const geo = new PlaneGeometry(W, D, Math.round(W / seg), Math.round(D / seg));
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  // ---- Splat maps -------------------------------------------------------------------------------
  const toPx = (x: number, z: number) => [((x - minX) / W) * SPLAT, ((z - minZ) / D) * SPLAT] as const;
  const mPx = SPLAT / W;
  const splatA = paint((g) => paintSurfaces(g, L, toPx, mPx));
  const splatB = paint((g) => paintShade(g, L, toPx, mPx));
  const splatAData = readback(splatA.image as HTMLCanvasElement);
  const splatBData = readback(splatB.image as HTMLCanvasElement);

  // ---- Material --------------------------------------------------------------------------------
  const base = a.bank.set('Ground037');
  const road = a.bank.set('Ground106');
  const soil = a.bank.set('Ground110');
  const paving = a.bank.set('Bricks084');
  const lush = a.bank.set('Grass004');
  const mat = new MeshStandardMaterial({ map: base.map, normalMap: base.normalMap, normalScale: new Vector2(0.9, 0.9), roughness: 1, metalness: 0 });
  mat.name = 'ground';
  const uniforms = {
    uSplatA: { value: splatA as Texture },
    uSplatB: { value: splatB as Texture },
    uRoad: { value: road.map },
    uRoadN: { value: road.normalMap },
    uSoil: { value: soil.map },
    uPave: { value: paving.map },
    uPaveN: { value: paving.normalMap },
    uLush: { value: lush.map },
    uSplatOrigin: { value: new Vector2(minX, minZ) },
    uSplatSize: { value: new Vector2(W, D) },
    // Linear multipliers (not hex): hex colours are converted to linear and would darken everything.
    uBaseTint: { value: new Color(1.25, 1.05, 0.82) },
    uRoadTint: { value: new Color(1.35, 1.12, 0.9) },
    uSoilTint: { value: new Color(0.95, 0.78, 0.62) },
    uPaveTint: { value: new Color(1.3, 1.15, 0.95) },
    uLushTint: { value: new Color(1.0, 1.1, 0.72) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGroundPos;
uniform sampler2D uSplatA, uSplatB, uRoad, uRoadN, uSoil, uPave, uPaveN, uLush;
uniform vec2 uSplatOrigin, uSplatSize;
uniform vec3 uBaseTint, uRoadTint, uSoilTint, uPaveTint, uLushTint;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
}
// Splat weights with ragged, noise-broken edges instead of clean painted outlines.
vec4 gWeights(out vec4 shade) {
  vec2 suv = (vGroundPos.xz - uSplatOrigin) / uSplatSize;
  vec4 s = texture2D(uSplatA, suv);
  shade = texture2D(uSplatB, suv);
  float n = gNoise(vGroundPos.xz * 0.9) * 0.6 + gNoise(vGroundPos.xz * 3.1) * 0.4 - 0.5;
  float road = smoothstep(0.25, 0.75, s.r + n * 0.45);
  float soil = smoothstep(0.3, 0.7, s.g + n * 0.3);
  float pave = smoothstep(0.35, 0.65, s.b + n * 0.15);
  float lush = smoothstep(0.3, 0.8, shade.r + n * 0.5);
  return vec4(road, soil, pave, lush);
}
vec2 gUV(float metres) { return vec2(vGroundPos.x, -vGroundPos.z) / metres; }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 gShade;
vec4 gw = gWeights(gShade);
// Two scales of the base texture, blended by a slow noise, so the dusty grass never visibly tiles.
float macro = gNoise(vGroundPos.xz * 0.045);
vec3 cBase = mix(texture2D(map, gUV(3.6)).rgb, texture2D(map, gUV(9.0)).rgb, 0.35) * uBaseTint * (0.82 + 0.3 * macro);
vec3 cLush = texture2D(uLush, gUV(2.2)).rgb * uLushTint;
vec3 cRoad = texture2D(uRoad, gUV(2.6)).rgb * uRoadTint;
vec3 cSoil = texture2D(uSoil, gUV(1.8)).rgb * uSoilTint;
vec3 cPave = texture2D(uPave, gUV(1.6)).rgb * uPaveTint;
vec3 col = mix(cBase, cLush, gw.a);
col = mix(col, cSoil, gw.g);
col = mix(col, cRoad, gw.r);
// Cart tracks: two darker ruts along the roads (painted into the splat's alpha-free green of B).
col *= 1.0 - gShade.b * 0.28 * gw.r;
col = mix(col, cPave, gw.b);
// Contact shade under trees and along walls, and damp earth near water.
col *= 1.0 - gShade.g * 0.45;
diffuseColor.rgb *= col;`,
      )
      .replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        `vec3 nBase = texture2D(normalMap, gUV(3.6)).xyz * 2.0 - 1.0;
vec3 nRoad = texture2D(uRoadN, gUV(2.6)).xyz * 2.0 - 1.0;
vec3 nPave = texture2D(uPaveN, gUV(1.6)).xyz * 2.0 - 1.0;
vec3 mapN = mix(mix(nBase, nRoad, gw.r), nPave, gw.b);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = mix(mix(0.97, 0.92, gw.r), 0.78, gw.b);`,
      );
  };

  const mesh = new Mesh(geo, mat);
  mesh.name = 'ground';
  mesh.receiveShadow = true;
  a.root.add(mesh);

  const sample = (data: Uint8ClampedArray, x: number, z: number, ch: number) => {
    const [px, pz] = toPx(x, z);
    const i = (Math.min(Math.max(Math.floor(pz), 0), SPLAT - 1) * SPLAT + Math.min(Math.max(Math.floor(px), 0), SPLAT - 1)) * 4;
    return data[i + ch] / 255;
  };

  return {
    mesh,
    heightAt,
    outside,
    surfaceAt: (x, z) => ({ road: sample(splatAData, x, z, 0), soil: sample(splatAData, x, z, 1), paving: sample(splatAData, x, z, 2), lush: sample(splatBData, x, z, 0) }),
    dispose() {
      geo.dispose();
      mat.dispose();
      splatA.dispose();
      splatB.dispose();
    },
  };
}

// ---- painting the splats -------------------------------------------------------------------------

type ToPx = (x: number, z: number) => readonly [number, number];

function paint(draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = SPLAT;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas unavailable');
  g.fillStyle = '#000';
  g.fillRect(0, 0, SPLAT, SPLAT);
  g.globalCompositeOperation = 'lighter';
  draw(g);
  const t = new CanvasTexture(c);
  // Canvas row 0 is minZ: don't let the upload flip it (it would mirror the map north–south).
  t.flipY = false;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function readback(c: HTMLCanvasElement): Uint8ClampedArray {
  const g = c.getContext('2d', { willReadFrequently: true });
  return g ? g.getImageData(0, 0, c.width, c.height).data : new Uint8ClampedArray(c.width * c.height * 4);
}

/** A stroke with a soft falloff: several passes, widest and faintest first. */
function softLine(g: CanvasRenderingContext2D, pts: P2[], toPx: ToPx, widthPx: number, colour: [number, number, number], strength = 1) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [k, al] of [[1.6, 0.18], [1.25, 0.3], [1, 0.55], [0.7, 0.9]] as const) {
    g.strokeStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${al * strength})`;
    g.lineWidth = widthPx * k;
    g.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = toPx(p.x, p.z);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  }
}

function softRect(g: CanvasRenderingContext2D, toPx: ToPx, mPx: number, o: P2, rot: number, w: number, d: number, colour: [number, number, number], feather = 0.8, strength = 1) {
  const [cx, cy] = toPx(o.x, o.z);
  for (const [grow, al] of [[feather * 1.6, 0.2], [feather, 0.35], [0, 0.9]] as const) {
    g.save();
    g.translate(cx, cy);
    g.rotate(-rot);
    g.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${al * strength})`;
    g.fillRect(((-w / 2 - grow) * mPx), ((-d / 2 - grow) * mPx), (w + grow * 2) * mPx, (d + grow * 2) * mPx);
    g.restore();
  }
}

/** Splat A: R = road earth, G = farm soil, B = stone paving. */
function paintSurfaces(g: CanvasRenderingContext2D, L: VillageLayout, toPx: ToPx, mPx: number): void {
  for (const r of L.roads) softLine(g, r.points, toPx, r.width * mPx * (r.kind === 'path' ? 0.9 : 1), [255, 0, 0], r.kind === 'path' ? 0.8 : 1);
  // Worn earth around every doorstep and shopfront, and the whole festival ground.
  for (const h of L.houses) {
    const d = houseDims(h);
    const c = toWorld(h, h.rot, d.doorX, d.verandaEdge + 2.2);
    softRect(g, toPx, mPx, c, h.rot, 4.2, 3.6, [255, 0, 0], 1.2, 0.8);
  }
  for (const s of L.shops) {
    const d = shopDims(s);
    softRect(g, toPx, mPx, toWorld(s, s.rot, 0, d.counterFront + 1.6), s.rot, s.width + 2, 3.4, [255, 0, 0], 1.2, 0.9);
  }
  const sq = L.areas.find((a) => a.kind === 'square');
  if (sq) softRect(g, toPx, mPx, sq, 0, sq.w - 4, sq.d - 3, [255, 0, 0], 3, 0.75);
  for (const lm of L.landmarks) {
    if (['pandal', 'well', 'flower-stall', 'potter', 'fruit-stall', 'puja-stall', 'handpump', 'cart', 'haystack'].includes(lm.kind)) {
      softRect(g, toPx, mPx, lm, lm.rot, lm.kind === 'pandal' ? 11 : 3.4, lm.kind === 'pandal' ? 9 : 3, [255, 0, 0], 1, 0.7);
    }
  }
  // Farm soil with furrows: rows of alternating strength.
  for (const f of L.fields) {
    softRect(g, toPx, mPx, f, f.rot, f.w, f.d, [0, 200, 0], 0.6);
    const rows = Math.floor(f.w / 0.7);
    for (let i = 0; i < rows; i++) {
      const x = -f.w / 2 + (i + 0.5) * 0.7;
      const a = toWorld(f, f.rot, x, -f.d / 2 + 0.3);
      const e = toWorld(f, f.rot, x, f.d / 2 - 0.3);
      softLine(g, [a, e], toPx, 0.3 * mPx, [0, 70, 0], 1);
    }
  }
  // Temple courtyard paving and the approach through the gate.
  const t = L.temple;
  const td = templeDims(t);
  softRect(g, toPx, mPx, { x: t.x, z: t.z }, 0, t.courtW - 0.6, t.courtD - 0.6, [0, 0, 255], 0.15);
  softRect(g, toPx, mPx, { x: t.x, z: td.platformZ + t.platformD / 2 + 3 }, 0, 5, 6, [0, 0, 255], 0.2);
  softRect(g, toPx, mPx, { x: t.x, z: -36.5 }, 0, 5.2, 3.5, [0, 0, 255], 0.6, 0.8);
}

/** Splat B: R = lush grass, G = contact shade (trees, walls, damp), B = cart-track ruts. */
function paintShade(g: CanvasRenderingContext2D, L: VillageLayout, toPx: ToPx, mPx: number): void {
  const r = rng(99);
  // Lush grass in the garden, the orchard and the grove floors, and in patches off the lanes.
  for (const a of L.areas.filter((a) => ['garden', 'orchard', 'grove'].includes(a.kind))) softRect(g, toPx, mPx, a, a.rot ?? 0, a.w - 1, a.d - 1, [230, 0, 0], 2, 0.9);
  for (let i = 0; i < 70; i++) {
    const x = L.bounds.minX + r() * (L.bounds.maxX - L.bounds.minX);
    const z = L.bounds.minZ + r() * (L.bounds.maxZ - L.bounds.minZ);
    const [px, py] = toPx(x, z);
    const rad = (3 + r() * 7) * mPx;
    const grad = g.createRadialGradient(px, py, 0, px, py, rad);
    grad.addColorStop(0, 'rgba(200,0,0,0.6)');
    grad.addColorStop(1, 'rgba(200,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  // Soft shade pools under every tree canopy.
  for (const t of L.trees) {
    const [px, py] = toPx(t.x, t.z);
    const rad = { banyan: 8, peepal: 6, neem: 3.6, mango: 3.6, coconut: 1.6, banana: 1.2 }[t.kind] * t.scale * mPx;
    const grad = g.createRadialGradient(px, py, 0, px, py, rad);
    grad.addColorStop(0, 'rgba(0,120,0,0.9)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  // Grime at the foot of every wall.
  for (const h of L.houses) {
    const d = houseDims(h);
    softRect(g, toPx, mPx, h, h.rot, d.halfW * 2 + 0.4, d.halfD * 2 + d.verandaDepth + 1.4, [0, 70, 0], 0.5);
  }
  // Damp ground by the tank and the wells.
  for (const l of L.landmarks.filter((l) => l.kind === 'pond' || l.kind === 'well' || l.kind === 'handpump')) {
    softRect(g, toPx, mPx, l, l.rot, l.kind === 'pond' ? 11 : 3, l.kind === 'pond' ? 9 : 3, [0, 90, 0], 1.2);
  }
  // Cart-track ruts along the main road and lanes.
  for (const road of L.roads.filter((x) => x.kind !== 'path')) {
    for (const off of [-0.75, 0.75]) {
      const pts = road.points.map((p, i) => {
        const a = road.points[Math.max(i - 1, 0)];
        const b = road.points[Math.min(i + 1, road.points.length - 1)];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const l = Math.hypot(dx, dz) || 1;
        return { x: p.x - (dz / l) * off, z: p.z + (dx / l) * off };
      });
      softLine(g, pts, toPx, 0.35 * mPx, [0, 0, 200], 1);
    }
  }
}

// ---- playable polygon ------------------------------------------------------------------------

/** The bounds rectangle clipped by the edge cuts (Sutherland–Hodgman), as an octagon. */
function playablePolygon(L: VillageLayout): P2[] {
  const b = L.bounds;
  let poly: P2[] = [
    { x: b.minX, z: b.minZ },
    { x: b.maxX, z: b.minZ },
    { x: b.maxX, z: b.maxZ },
    { x: b.minX, z: b.maxZ },
  ];
  const centre = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
  for (const { a, b: e } of L.edgeCuts) {
    const side = (p: P2) => (e.x - a.x) * (p.z - a.z) - (e.z - a.z) * (p.x - a.x);
    const keep = Math.sign(side(centre));
    const out: P2[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const sp = side(p) * keep;
      const sq = side(q) * keep;
      if (sp >= 0) out.push(p);
      if (sp * sq < 0) {
        const t = sp / (sp - sq);
        out.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
      }
    }
    poly = out;
  }
  return poly;
}

/** Signed distance to a convex polygon: negative inside. */
function signedDistance(poly: P2[], x: number, z: number): number {
  let inside = true;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const cross = ex * (z - a.z) - ez * (x - a.x);
    if (cross < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t)));
  }
  // Winding may be either way; decide "inside" by the sign agreement.
  if (!inside) {
    let allPos = true;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x) > 0) allPos = false;
    }
    inside = allPos;
  }
  return inside ? -best : best;
}

function valueNoise(seed: number): (x: number, z: number) => number {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  return (x, z) => {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const fx = x - i;
    const fz = z - j;
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
}

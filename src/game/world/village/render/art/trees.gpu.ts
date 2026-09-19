/**
 * The GPU side of the vegetation: instanced alpha cards, merged meshes, and the shader patches that
 * make paper cards read as foliage —
 *   · an atlas cell per instance, so every leaf, crop and flower card in the village is one draw;
 *   · crown-bent normals, so a canopy shades like a dome (lit west side, cool east side) and both
 *     faces of a card light the same;
 *   · floating cards that turn partly toward the viewer, so a crown never shows cards edge-on;
 *   · a breeze (tops of rooted plants, whole floating cards, palm and banana leaves by weight);
 *   · leaves that step aside when the camera pushes into a canopy;
 *   · grass that sinks into the ground at the edge of its ring around the camera.
 * The same vertex patch goes on each mesh's shadow material, so shadows move and match.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Mesh,
  MeshDepthMaterial,
  PlaneGeometry,
  ShaderChunk,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A rectangle of a texture atlas in UV space (v up). */
export interface Cell {
  u: number;
  v: number;
  w: number;
  h: number;
}

export const quadCell = (q: readonly [number, number]): Cell => ({ u: q[0], v: q[1], w: 0.5, h: 0.5 });

/** Uniforms shared by every patched material (updated once per frame). */
export interface Wind {
  uTime: { value: number };
}

export interface CardLook {
  /** Per-instance atlas cell (aCell). */
  atlas?: boolean;
  /** Per-instance crown normal and sway (aBend). Without it, cards are rooted tufts. */
  bend?: boolean;
  /** 0..1 blend of the lighting normal toward the crown normal. */
  bent?: number;
  /** 0..1 how far floating cards turn toward the viewer. */
  facing?: number;
  /** Grass: metres from the camera at which tufts have sunk into the ground (0 = off). */
  ring?: number;
  /** Sway amplitude for rooted tufts without aBend. */
  sway?: number;
  /** Merged meshes: a per-vertex sway weight (aSway) in metres. */
  swayAttr?: boolean;
  /** Light both faces with the vertex normal (for bent-normal cards and up-normal grass). */
  twoSided?: boolean;
  /** Texture size in texels: alpha is boosted with mip level so distant cards keep their coverage. */
  texels?: number;
}

const WIND_GLSL = /* glsl */ `
uniform float uTime;
vec3 treesWind(vec3 p) {
  float ph = dot(p.xz, vec2(0.23, 0.19));
  return vec3(
    sin(uTime * 1.6 + ph) * 0.75 + sin(uTime * 3.7 + ph * 2.1) * 0.25,
    sin(uTime * 2.3 + ph * 0.7) * 0.2,
    sin(uTime * 1.2 + ph * 1.3) * 0.55
  );
}`;

/** Patches a material (standard or depth) for vegetation. Mutates and returns it. */
export function patchVegetation<M extends Material>(m: M, look: CardLook, wind: Wind, key: string): M {
  const instanced = !look.swayAttr;
  const defines: Record<string, string> = {};
  if (look.atlas) defines.CARD_ATLAS = '';
  if (look.bend) defines.CARD_BEND = '';
  if (look.ring) defines.CARD_RING = '';
  if (look.facing) defines.CARD_FACING = '';
  if (look.swayAttr) defines.SWAY_ATTR = '';
  m.defines = { ...(m.defines ?? {}), ...defines };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.uniforms.uBent = { value: look.bent ?? 0 };
    shader.uniforms.uFacing = { value: look.facing ?? 0 };
    shader.uniforms.uRing = { value: look.ring ?? 0 };
    shader.uniforms.uSway = { value: look.sway ?? 0 };
    let vs = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
${WIND_GLSL}
uniform float uBent, uFacing, uRing, uSway;
#ifdef CARD_ATLAS
attribute vec4 aCell;
#endif
#ifdef CARD_BEND
attribute vec4 aBend;
#endif
#ifdef SWAY_ATTR
attribute float aSway;
#endif`,
    );
    vs = vs.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
#if defined( CARD_ATLAS ) && defined( USE_MAP )
vMapUv = aCell.xy + vMapUv * aCell.zw;
#endif`,
    );
    if (instanced) {
      vs = vs
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vec3 cardPos = ( instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
vec3 cardCentre = instanceMatrix[ 3 ].xyz;
#ifdef CARD_BEND
float cardRooted = aBend.w < 0.0 ? 1.0 : 0.0;
float cardAmp = abs( aBend.w );
#else
float cardRooted = 1.0;
float cardAmp = uSway;
#endif
#ifdef CARD_FACING
if ( cardRooted < 0.5 ) {
  // Turn partly toward the viewer, keeping each card's own roll.
  vec3 camR = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
  vec3 camU = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
  float cw = length( instanceMatrix[ 0 ].xyz );
  float ch = length( instanceMatrix[ 1 ].xyz );
  float roll = fract( sin( dot( cardCentre, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ) * 6.2832;
  vec2 q = vec2( cos( roll ) * transformed.x - sin( roll ) * transformed.y, sin( roll ) * transformed.x + cos( roll ) * transformed.y );
  cardPos = mix( cardPos, cardCentre + camR * q.x * cw + camU * q.y * ch, uFacing );
  // Step aside when the camera pushes into the crown.
  float nearK = smoothstep( 0.7, 2.4, distance( cardCentre, cameraPosition ) );
  cardPos = cardCentre + ( cardPos - cardCentre ) * nearK;
}
#endif
cardPos += treesWind( cardCentre ) * cardAmp * mix( 1.0, uv.y * uv.y, cardRooted );
#ifdef CARD_RING
float cardBase = cardCentre.y - 0.5 * instanceMatrix[ 1 ].y;
float ringK = 1.0 - smoothstep( uRing * 0.7, uRing, distance( cardCentre.xz, cameraPosition.xz ) );
cardPos.y = cardBase + ( cardPos.y - cardBase ) * ringK;
#endif`,
        )
        .replace(
          '#include <project_vertex>',
          `vec4 mvPosition = modelViewMatrix * vec4( cardPos, 1.0 );
gl_Position = projectionMatrix * mvPosition;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
vec4 worldPosition = modelMatrix * vec4( cardPos, 1.0 );
#endif`,
        )
        .replace(
          '#include <defaultnormal_vertex>',
          `#include <defaultnormal_vertex>
#ifdef CARD_BEND
transformedNormal = normalize( mix( transformedNormal, normalMatrix * aBend.xyz, uBent ) );
#endif`,
        );
    } else {
      vs = vs.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
transformed += treesWind( ( modelMatrix * vec4( transformed, 1.0 ) ).xyz ) * aSway;`,
      );
    }
    shader.vertexShader = vs;
    if (look.texels) {
      shader.uniforms.uTexels = { value: look.texels };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTexels;
float treesMip( vec2 uv ) {
  vec2 dx = dFdx( uv * uTexels );
  vec2 dy = dFdy( uv * uTexels );
  return max( 0.5 * log2( max( dot( dx, dx ), dot( dy, dy ) ) ), 0.0 );
}`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
#ifdef USE_MAP
diffuseColor.a *= 1.0 + treesMip( vMapUv ) * 0.3;
#endif`,
        );
    }
    if (look.twoSided) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    }
  };
  m.customProgramCacheKey = () => `trees:${key}`;
  return m;
}

/** The matching shadow material for a patched mesh (map and alpha test are copied per frame). */
export function vegetationDepth(look: CardLook, wind: Wind, key: string): MeshDepthMaterial {
  return patchVegetation(new MeshDepthMaterial(), look, wind, `${key}:depth`);
}

// ---- Instanced cards --------------------------------------------------------------------------

export interface CardSpec {
  /** Centre of a floating card, or the foot of a rooted one. */
  p: Vector3;
  /** Unit vectors along the card's width and height. */
  right: Vector3;
  up: Vector3;
  w: number;
  h: number;
  cell: Cell;
  colour: Color;
  /** Lighting normal (defaults to the card's own). */
  bend?: Vector3;
  /** Breeze amplitude, metres. */
  sway?: number;
  /** Rooted plants sway at the top only, never turn to the viewer, and stand on `p`. */
  rooted?: boolean;
}

const _n = new Vector3();

/** Collects alpha cards, then builds them as one InstancedMesh over a unit quad. */
export class CardSet {
  private readonly mats: number[] = [];
  private readonly cols: number[] = [];
  private readonly cells: number[] = [];
  private readonly bends: number[] = [];

  get count(): number {
    return this.cols.length / 3;
  }

  add(c: CardSpec): void {
    const n = _n.crossVectors(c.right, c.up).normalize();
    const cx = c.rooted ? c.p.x + (c.up.x * c.h) / 2 : c.p.x;
    const cy = c.rooted ? c.p.y + (c.up.y * c.h) / 2 : c.p.y;
    const cz = c.rooted ? c.p.z + (c.up.z * c.h) / 2 : c.p.z;
    this.mats.push(c.right.x * c.w, c.right.y * c.w, c.right.z * c.w, 0, c.up.x * c.h, c.up.y * c.h, c.up.z * c.h, 0, n.x, n.y, n.z, 0, cx, cy, cz, 1);
    this.cols.push(c.colour.r, c.colour.g, c.colour.b);
    this.cells.push(c.cell.u, c.cell.v, c.cell.w, c.cell.h);
    const b = c.bend ?? n;
    const amp = Math.max(c.sway ?? 0, 1e-4);
    this.bends.push(b.x, b.y, b.z, c.rooted ? -amp : amp);
  }

  build(name: string, material: Material, depth: Material | null, cast: boolean): InstancedMesh {
    const geo = unitQuad();
    geo.setAttribute('aCell', new InstancedBufferAttribute(new Float32Array(this.cells), 4));
    geo.setAttribute('aBend', new InstancedBufferAttribute(new Float32Array(this.bends), 4));
    const mesh = new InstancedMesh(geo, material, this.count);
    mesh.instanceMatrix = new InstancedBufferAttribute(new Float32Array(this.mats), 16);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(this.cols), 3);
    mesh.computeBoundingSphere();
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    if (depth) mesh.customDepthMaterial = depth;
    return mesh;
  }
}

/** A 1 × 1 quad centred on the origin, facing +z, white vertex colours. */
export function unitQuad(): BufferGeometry {
  const g = new PlaneGeometry(1, 1);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}

/** A tuft: two crossed quads standing on the origin (y 0..1 is folded into the unit quad's −0.5..0.5). */
export function crossedQuads(): BufferGeometry {
  const a = unitQuad();
  const b = unitQuad().rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b], false);
  a.dispose();
  b.dispose();
  if (!g) throw new Error('merge failed');
  // Grass lights like the ground it grows from.
  const nor = g.getAttribute('normal');
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
  return g;
}

// ---- Merged meshes ----------------------------------------------------------------------------

interface Part {
  mat: Material;
  depth: Material | null;
  sway: boolean;
  cast: boolean;
  geos: BufferGeometry[];
}

/**
 * Geometry merged per material, like geom.ts's Batch, but indexed and able to carry a per-vertex
 * sway weight for leaves that move in the breeze.
 */
export class Merger {
  private readonly parts = new Map<string, Part>();

  define(key: string, mat: Material, o: { sway?: boolean; cast?: boolean; depth?: Material | null } = {}): void {
    this.parts.set(key, { mat, depth: o.depth ?? null, sway: !!o.sway, cast: o.cast ?? true, geos: [] });
  }

  /** Takes ownership of `geo`. Needs position, normal, uv and colour; aSway defaults to rigid. */
  add(key: string, geo: BufferGeometry): void {
    const part = this.parts.get(key);
    if (!part) throw new Error(`unknown part ${key}`);
    const n = geo.getAttribute('position').count;
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color', 'aSway'].includes(name)) geo.deleteAttribute(name);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    if (!geo.getAttribute('uv')) geo.setAttribute('uv', new Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!geo.getAttribute('color')) geo.setAttribute('color', new Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    if (part.sway && !geo.getAttribute('aSway')) geo.setAttribute('aSway', new Float32BufferAttribute(new Float32Array(n), 1));
    if (!part.sway && geo.getAttribute('aSway')) geo.deleteAttribute('aSway');
    if (!geo.index) {
      const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      geo.setIndex(new BufferAttribute(idx, 1));
    }
    part.geos.push(geo);
  }

  build(name: string): Group {
    const group = new Group();
    group.name = name;
    for (const [key, p] of this.parts) {
      if (!p.geos.length) continue;
      const merged = mergeGeometries(p.geos, false);
      for (const g of p.geos) g.dispose();
      p.geos.length = 0;
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, p.mat);
      mesh.name = `${name}:${key}`;
      mesh.castShadow = p.cast;
      mesh.receiveShadow = true;
      if (p.depth) mesh.customDepthMaterial = p.depth;
      group.add(mesh);
    }
    return group;
  }
}

/** Solid vertex colour (and optional sway weight) on a geometry. */
export function tint(g: BufferGeometry, c: Color | string, sway?: number): BufferGeometry {
  const col = c instanceof Color ? c : new Color(c);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(a, 3));
  if (sway !== undefined) g.setAttribute('aSway', new Float32BufferAttribute(new Float32Array(n).fill(sway), 1));
  return g;
}

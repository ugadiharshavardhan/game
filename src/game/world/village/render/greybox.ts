/**
 * The greybox: every solid drawn exactly as it collides, colour-coded, merged into a few draw calls.
 * For layout work — `?view=greybox`. The art renderer replaces it by default; both are built from
 * the same data, so moving a house in layout.ts moves it in both.
 *
 * Colour key: warm grey = shelter house · dark grey = locked house · cream = home ·
 * terracotta = roofs · sand = temple · red/gold diamonds = risky / safe offering spots.
 */
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { DOOR_H, DOOR_W, houseDims, PLINTH_H, toWorld } from '../dims';
import type { Solid } from '../solids';
import type { TreeKind } from '../types';
import { hash, mergeBaked, ribbon, tint } from './common';
import type { VillageVisuals, VisualsContext } from './types';

const C = {
  shelter: '#d8d2c4',
  locked: '#8f8a80',
  home: '#eadcaa',
  plinth: '#a79a86',
  roof: '#b0654a',
  post: '#6b4a2e',
  shop: '#c9b38d',
  counter: '#7a5a3a',
  temple: '#d6b98a',
  templeDark: '#b89c70',
  wall: '#9a9184',
  fence: '#8a6a3c',
  hedge: '#4f6b3a',
  trunk: '#6b4a2e',
  canopy: '#4e7a3c',
  palm: '#5f8a3a',
  landmark: '#8e8274',
  door: '#4a3222',
  main: '#b39a78',
  lane: '#a58e6e',
  path: '#998466',
  field: '#6e5438',
  ground: '#7d8a5e',
} as const;

export interface GreyboxOptions {
  /** Only draw solids that pass (default: all). */
  filter?: (s: Solid) => boolean;
  /** Skip the grid ground, roads and fields (the art pass has its own). */
  noGround?: boolean;
  /** Skip tree crowns, offering markers and door leaves. */
  structuresOnly?: boolean;
}

export async function buildGreybox(ctx: VisualsContext, opts: GreyboxOptions = {}): Promise<VillageVisuals> {
  const { scene, layout, level } = ctx;
  const root = new Group();
  root.name = 'Greybox';
  scene.add(root);
  const disposables: Array<{ dispose(): void }> = [];

  const vcMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  disposables.push(vcMat);
  if (!opts.noGround) {
  // ---- Ground with a 1 m / 5 m grid, so scale is readable at a glance ----------------------
  const grid = gridTexture();
  disposables.push(grid);
  const groundMat = new MeshStandardMaterial({ color: C.ground, map: grid, roughness: 1 });
  const b = layout.bounds;
  const ground = new Mesh(new PlaneGeometry(b.maxX - b.minX + 120, b.maxZ - b.minZ + 120), groundMat);
  grid.repeat.set((b.maxX - b.minX + 120) / 5, (b.maxZ - b.minZ + 120) / 5);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  ground.receiveShadow = true;
  root.add(ground);
  disposables.push(ground.geometry, groundMat);

  // ---- Flat things on the ground: roads and fields --------------------------------------------
  const flat: ReturnType<typeof tint>[] = [];
  for (const r of layout.roads) flat.push(tint(ribbon(r.points, r.width, r.kind === 'main' ? 0.02 : r.kind === 'lane' ? 0.025 : 0.03, 0.8), C[r.kind]));
  for (const f of layout.fields) {
    const g = new BoxGeometry(f.w, 0.04, f.d).rotateY(f.rot).translate(f.x, 0.01, f.z);
    flat.push(tint(g, C.field));
  }
  const flatMesh = new Mesh(mergeBaked(flat), vcMat);
  flatMesh.receiveShadow = true;
  root.add(flatMesh);
  disposables.push(flatMesh.geometry);
  }

  // ---- Every solid, as it collides ----------------------------------------------------------
  const houseOf = new Map(layout.houses.map((h) => [h.id, h]));
  const parts: ReturnType<typeof tint>[] = [];
  const colourFor = (s: Solid): string | null => {
    const [kind, id, part = ''] = s.tag.split(':');
    if (s.tag.includes(':rim') || kind === 'edge') return null;
    if (kind === 'house') {
      if (part.startsWith('roof') || part === 'veranda-roof' || part === 'parapet') return C.roof;
      if (part === 'post') return C.post;
      if (part === 'veranda' || part === 'steps') return part === 'steps' && s.tag.endsWith(':ramp') ? null : C.plinth;
      const h = houseOf.get(id);
      return h?.start ? C.home : h?.shelter ? C.shelter : C.locked;
    }
    if (kind === 'shop') return part === 'counter' ? C.counter : part === 'awning-pole' ? C.post : C.shop;
    if (kind === 'temple') {
      if (s.tag.endsWith(':ramp')) return null;
      return id === 'platform' || id === 'steps' ? C.templeDark : C.temple;
    }
    if (kind === 'wall') return C.wall;
    if (kind === 'fence') return s.tag.includes('hedge') ? C.hedge : C.fence;
    if (kind === 'tree') return C.trunk;
    if (kind === 'landmark') return id === 'pond' ? null : C.landmark;
    return C.landmark;
  };
  for (const s of level.solids) {
    if (opts.filter && !opts.filter(s)) continue;
    const colour = colourFor(s);
    if (!colour) continue;
    if (s.layer === 'none' && !s.tag.includes(':step')) continue;
    if (s.kind === 'box') {
      parts.push(tint(new BoxGeometry(s.sx, s.sy, s.sz).rotateY(s.rot).translate(s.x, s.y, s.z), colour, 0.04, s.x * 7 + s.z));
    } else if (s.kind === 'cyl') {
      parts.push(tint(new CylinderGeometry(s.r, s.r, s.h, 14).translate(s.x, s.y + s.h / 2, s.z), colour));
    } else {
      parts.push(tint(new ConvexGeometry(s.points.map((p) => new Vector3(p.x, p.y, p.z))), colour));
    }
  }
  // The tank's water, sunk inside its rim.
  if (!opts.structuresOnly) {
    for (const l of layout.landmarks.filter((l) => l.kind === 'pond')) {
      parts.push(tint(new BoxGeometry(8, 0.1, 6).rotateY(l.rot).translate(l.x, 0.08, l.z), '#3f6f7a'));
    }
    // Tree crowns (no collision — you walk under them).
    for (const t of layout.trees) parts.push(...crown(t.kind, t.x, t.z, t.scale, t.seed));
  }
  if (!parts.length) parts.push(tint(new BoxGeometry(0.001, 0.001, 0.001), '#000'));

  const solidMesh = new Mesh(mergeBaked(parts), vcMat);
  solidMesh.castShadow = solidMesh.receiveShadow = true;
  root.add(solidMesh);
  disposables.push(solidMesh.geometry);

  // ---- Doors: a swinging leaf in front of a dark doorway ---------------------------------------
  const doorMat = new MeshStandardMaterial({ color: C.door, roughness: 0.8 });
  const darkMat = new MeshStandardMaterial({ color: '#150d08', roughness: 1, side: DoubleSide });
  disposables.push(doorMat, darkMat);
  const leafGeo = new BoxGeometry(DOOR_W, DOOR_H, 0.08).translate(DOOR_W / 2, DOOR_H / 2, 0);
  const holeGeo = new PlaneGeometry(DOOR_W, DOOR_H).translate(0, DOOR_H / 2, 0);
  disposables.push(leafGeo, holeGeo);
  const doorHinges = new Map<string, Group>();
  for (const h of opts.structuresOnly ? [] : layout.houses) {
    const d = houseDims(h);
    const house = new Group();
    house.position.set(h.x, 0, h.z);
    house.rotation.y = h.rot;
    const hole = new Mesh(holeGeo, darkMat);
    hole.position.set(d.doorX, PLINTH_H, d.wallFace + 0.005);
    const hinge = new Group();
    hinge.position.set(d.doorX - DOOR_W / 2, PLINTH_H, d.wallFace + 0.05);
    const leaf = new Mesh(leafGeo, doorMat);
    leaf.castShadow = true;
    hinge.add(leaf);
    house.add(hole, hinge);
    root.add(house);
    doorHinges.set(h.id, hinge);
  }

  // ---- Offering markers: gold where it's safe, red where the moon would catch you -------------
  const markerGeo = new OctahedronGeometry(0.22);
  const safeMat = new MeshStandardMaterial({ color: '#ffd24a', emissive: new Color('#ffb000'), emissiveIntensity: 1.2 });
  const riskyMat = new MeshStandardMaterial({ color: '#ff6a3a', emissive: new Color('#ff3a10'), emissiveIntensity: 1.2 });
  disposables.push(markerGeo, safeMat, riskyMat);
  const markers: Mesh[] = [];
  for (const o of opts.structuresOnly ? [] : layout.offerings) {
    const m = new Mesh(markerGeo, o.tags.includes('risky') ? riskyMat : safeMat);
    m.position.set(o.x, o.y + 0.9, o.z);
    m.userData.baseY = m.position.y;
    root.add(m);
    markers.push(m);
  }

  // The temple offering point.
  const offer = new Mesh(new CylinderGeometry(0.9, 0.9, 0.02, 32), new MeshStandardMaterial({ color: '#ff9a2a', emissive: new Color('#ff7a00'), emissiveIntensity: 0.6 }));
  offer.position.set(level.templeOffer.x, level.templeOffer.y + 0.012, level.templeOffer.z);
  if (!opts.structuresOnly) root.add(offer);
  disposables.push(offer.geometry, offer.material as MeshStandardMaterial);

  ctx.onProgress?.(1);

  return {
    doorHinges,
    update(_dt, frame) {
      for (const [i, m] of markers.entries()) {
        m.position.y = (m.userData.baseY as number) + Math.sin(frame.time * 2 + i) * 0.08;
        m.rotation.y = frame.time + i;
      }
    },
    dispose() {
      scene.remove(root);
      for (const d of disposables) d.dispose();
    },
  };
}

/** Simple crowns for the greybox: blobs for broadleaf trees, a spray for palms and bananas. */
function crown(kind: TreeKind, x: number, z: number, scale: number, seed: number) {
  const out: ReturnType<typeof tint>[] = [];
  const s = scale;
  if (kind === 'coconut') {
    out.push(tint(new CylinderGeometry(0.16 * s, 0.22 * s, 7.5 * s, 8).translate(x, 3.75 * s, z), C.trunk));
    out.push(tint(new ConeGeometry(2.4 * s, 1.4 * s, 9, 1, true).rotateX(Math.PI).translate(x, 7.4 * s, z), C.palm));
  } else if (kind === 'banana') {
    out.push(tint(new CylinderGeometry(0.12 * s, 0.16 * s, 1.8 * s, 8).translate(x, 0.9 * s, z), C.palm));
    out.push(tint(new ConeGeometry(1.4 * s, 1.6 * s, 7, 1, true).rotateX(Math.PI).translate(x, 2.3 * s, z), C.palm));
  } else {
    const size = { banyan: 7, peepal: 5.5, neem: 3.2, mango: 3.4 }[kind];
    const height = { banyan: 6.5, peepal: 7, neem: 5.2, mango: 4.6 }[kind];
    if (kind !== 'banyan' && kind !== 'peepal') out.push(tint(new CylinderGeometry(0.22 * s, 0.32 * s, height * s, 8).translate(x, (height * s) / 2, z), C.trunk));
    for (let i = 0; i < 4; i++) {
      const a = hash(seed, i) * Math.PI * 2;
      const r = size * s * 0.35 * hash(seed, i, 1);
      const p = toWorld({ x, z }, a, r, 0);
      out.push(tint(new IcosahedronGeometry(size * s * (0.5 + 0.2 * hash(seed, i, 2)), 1).translate(p.x, height * s + size * s * 0.1 * i, p.z), C.canopy, 0.12, seed + i));
    }
  }
  return out;
}

/** A soft 1 m grid with a stronger 5 m line — metres readable at a glance in the greybox. */
function gridTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(0,0,0,0.10)';
    g.lineWidth = 2;
    for (let i = 0; i <= 5; i++) {
      g.beginPath();
      g.moveTo((i * 256) / 5, 0);
      g.lineTo((i * 256) / 5, 256);
      g.moveTo(0, (i * 256) / 5);
      g.lineTo(256, (i * 256) / 5);
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 4;
    g.strokeRect(0, 0, 256, 256);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

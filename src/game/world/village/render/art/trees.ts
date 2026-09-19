/**
 * Trees, vegetation, crops and the hill backdrop.
 *
 * The village's green, from the ground up:
 *   grass tufts in a ring round the camera (surface-aware: never on roads, soil, paving or plinths) ·
 *   weeds at wall feet, monsoon wildflowers, colocasia by the water, leaf litter under shade trees ·
 *   the tulsi garden's marigold beds and hibiscus · leafy hedges on the hedge lines · bajra and
 *   jowar, sugarcane and vegetable rows in the fields · the banyan on its stone chabutra with
 *   threads and diyas, the temple peepal, neem and mango along the lanes, the mango orchard, the
 *   coconut grove, the banana plantation · tree clumps and scrub on the hills beyond the edge.
 *
 * Draw calls stay flat however much grows: every leaf, crop and flower is an alpha card in one of
 * two instanced meshes (the shared leaf atlas, and this module's own vegetation atlas); grass is a
 * third; bark, palm fronds, banana leaves and painted bits are merged per material.
 * See trees.species.ts (trees), trees.land.ts (site, grass, fields, hedges, hills),
 * trees.under.ts (garden and undergrowth), trees.gpu.ts (cards and shader patches),
 * trees.shape.ts (tubes, crowns, blades), trees.paint.ts (the vegetation atlas).
 */
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, IcosahedronGeometry, MeshStandardMaterial, Vector3 } from 'three';
import { rng } from './canvasTextures';
import { lathe } from './geom';
import { TILE } from './materials';
import type { ArtContext } from './runtime';
import { CardSet, type CardLook, Merger, patchVegetation, tint, vegetationDepth, type Wind } from './trees.gpu';
import { groundHeight, grassiness, Meadow, noise2, plantHedges, plantHills, Site, sowFields, sowGrass } from './trees.land';
import { vegAtlas } from './trees.paint';
import { buildTree, CHABUTRA_H, type Grove } from './trees.species';
import { garden, undergrowth } from './trees.under';

/** Grass is drawn this far from the camera; beyond, the ground's own texture carries it. */
const GRASS_REACH = 30;

const CARDS: CardLook = { atlas: true, bend: true, bent: 0.8, facing: 0.45, twoSided: true, texels: 1024 };
const GRASS: CardLook = { ring: GRASS_REACH, sway: 0.05, twoSided: true, texels: 256 };
const LEAVES_SWAY: CardLook = { swayAttr: true };

export function build(a: ArtContext): boolean {
  const L = a.layout;
  const wind: Wind = { uTime: { value: 0 } };
  const kit = a.kit;
  const cardMat = (key: string, base: () => MeshStandardMaterial, look: CardLook) => kit.custom(`trees:${key}`, () => patchVegetation(base(), look, wind, key));
  const depthMat = (key: string, look: CardLook) => kit.custom(`trees:${key}:depth`, () => vegetationDepth(look, wind, key));
  const cloneOf = (key: 'foliage' | 'grass' | 'palm' | 'banana') => () => (kit.get(key) as MeshStandardMaterial).clone();

  const leavesMat = cardMat('leaves', cloneOf('foliage'), CARDS);
  const vegMat = cardMat('veg', () => new MeshStandardMaterial({ map: vegAtlas(a.bank), alphaTest: 0.42, alphaToCoverage: true, side: DoubleSide, vertexColors: true, roughness: 0.85, metalness: 0 }), CARDS);
  const grassMat = cardMat('grass', cloneOf('grass'), GRASS);
  const palmMat = cardMat('palm', cloneOf('palm'), LEAVES_SWAY);
  const bananaMat = cardMat('banana', cloneOf('banana'), LEAVES_SWAY);

  const site = new Site(a.level, L);
  const height = groundHeight(a.ground);
  const merge = new Merger();
  merge.define('bark', kit.get('bark'));
  merge.define('hill-bark', kit.get('bark'), { cast: false });
  merge.define('palm', palmMat, { sway: true, depth: depthMat('palm', LEAVES_SWAY) });
  merge.define('hill-palm', palmMat, { sway: true, cast: false });
  merge.define('banana', bananaMat, { sway: true, depth: depthMat('banana', LEAVES_SWAY) });
  merge.define('paint', kit.get('paint'), { cast: false });
  merge.define('stone', kit.get('stone'));
  merge.define('rubble', kit.get('rubble'));
  const grove: Grove = { merge, leaves: new CardSet(), veg: new CardSet(), small: new CardSet(), clear: (p, s) => site.clearFor(p, s) };
  const hills = new CardSet();

  // ---- trees ------------------------------------------------------------------------------------
  const stage: string[] = [];
  const mark = (n: string) => stage.push(`${n}:${grove.leaves.count}/${grove.veg.count}/${grove.small.count}/${hills.count}`);
  for (const t of L.trees) buildTree(grove, t);
  mark('trees');
  for (const lm of L.landmarks) if (lm.kind === 'banyan-platform') chabutra(a, merge, lm.x, lm.z);

  // ---- hedges, fields, garden, undergrowth ------------------------------------------------------
  plantHedges(grove.leaves, merge, L.fences, 501);
  mark('hedges');
  const keepOut = L.landmarks.filter((l) => l.kind === 'scarecrow' || l.kind === 'haystack');
  sowFields(grove.veg, L, keepOut, 502);
  mark('fields');
  const grass = grassiness(site, a.ground, noise2(503));
  const lush = (x: number, z: number) => a.ground?.surfaceAt(x, z).lush ?? 0.5;
  const beds = { leaves: grove.leaves, small: grove.small, site, layout: L, ground: a.ground, height, grass };
  garden(beds, 504);
  mark('garden');
  undergrowth(beds, 505);
  mark('under');
  if (a.ground) plantHills({ merge, leaves: hills, veg: grove.small }, a.ground, height, 506);
  mark('hills');

  // ---- meshes ---------------------------------------------------------------------------------------
  a.root.add(merge.build('trees'));
  a.root.add(grove.leaves.build('trees:leaves', leavesMat, depthMat('leaves', CARDS), true));
  a.root.add(grove.veg.build('trees:veg', vegMat, depthMat('veg', CARDS), true));
  a.root.add(grove.small.build('trees:small', vegMat, null, false));
  a.root.add(hills.build('trees:hills', leavesMat, null, false));
  const meadow = new Meadow(sowGrass(L, grass, lush, 507), grassMat, GRASS_REACH);
  a.root.add(meadow.mesh);

  // PROBE (temporary): triangles per mesh.
  const probe: string[] = [];
  a.root.traverse((o) => {
    const m = o as unknown as { isMesh?: boolean; geometry?: BufferGeometry; count?: number; name: string; isInstancedMesh?: boolean };
    if (!m.isMesh || !m.name.startsWith('trees') || !m.geometry) return;
    const tris = (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    probe.push(`${m.name}=${Math.round(tris * (m.isInstancedMesh ? (m.count ?? 1) : 1))}${m.isInstancedMesh ? `(${m.count}x${tris})` : ''}`);
  });
  console.log(`[probe] ${probe.join(' ')} | ${stage.join(' ')}`);
  let probed = 0;
  a.tick.push((_dt, time, camera) => {
    wind.uTime.value = time;
    meadow.update(camera);
    if (++probed === 30) console.log(`[probe] grass ${meadow.mesh.count}`);
  });
  return true;
}

// ---- The banyan's chabutra ------------------------------------------------------------------------

/**
 * The stone platform round the banyan (collider: r 3.2 × 0.5 m): a rubble-masonry drum on a low
 * footing, a dressed-stone coping, a flagged top — and on it, diyas lit for the evening and a few
 * marigolds left by the morning's worshippers.
 */
function chabutra(a: ArtContext, merge: Merger, cx: number, cz: number): void {
  const R = 3.2;
  const H = CHABUTRA_H;
  const r = rng(77);
  const rubbleTile = TILE.rubble ?? 1.6;
  const stoneTile = TILE.stone ?? 1.4;
  merge.add('rubble', drum(cx, cz, R + 0.02, -0.15, 0.12, 48, rubbleTile, '#c9bca6'));
  merge.add('rubble', drum(cx, cz, R - 0.03, 0.12, H - 0.08, 48, rubbleTile, '#d8ccb4', 0.28));
  merge.add('stone', drum(cx, cz, R + 0.02, H - 0.08, H, 48, stoneTile, '#8f887c'));
  merge.add('stone', annulus(cx, cz, R + 0.02, R - 0.34, H, 48, stoneTile, '#9a9285'));
  merge.add('stone', annulus(cx, cz, R - 0.34, 0.9, H - 0.012, 48, stoneTile, '#7d7162'));

  // Diyas round the trunk, and marigolds scattered between them.
  const diya = lathe([[0.001, 0], [0.045, 0.005], [0.065, 0.025], [0.07, 0.04], [0.055, 0.035], [0.001, 0.02]], 10);
  for (let i = 0; i < 7; i++) {
    const ang = -0.9 + i * 0.3 + (r() - 0.5) * 0.1;
    const d = 1.75 + r() * 0.35;
    const x = cx + Math.cos(ang) * d;
    const z = cz + Math.sin(ang) * d;
    merge.add('paint', tint(diya.clone().translate(x, H, z), '#9c4a2a'));
    a.flames.add(new Vector3(x, H + 0.04, z));
  }
  diya.dispose();
  for (let i = 0; i < 16; i++) {
    const ang = -1.2 + r() * 2.4;
    const d = 1.4 + r() * 1.1;
    const m = new IcosahedronGeometry(0.035, 0).translate(cx + Math.cos(ang) * d, H + 0.02, cz + Math.sin(ang) * d);
    merge.add('paint', tint(m, r() < 0.6 ? '#f09a1c' : '#f5c233'));
  }
  a.lamps.anchor(new Vector3(cx + Math.cos(0) * 2, H + 0.5, cz), 1.2);
}

/** A vertical ring wall, UVs in metres (u around, v up). */
function drum(cx: number, cz: number, radius: number, y0: number, y1: number, segs: number, tile: number, colour: string, noise = 0.12): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const base = new Color(colour);
  const c = new Color();
  const rr = rng(Math.round(radius * 100 + y0 * 10));
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const k = 1 - noise * rr();
    for (const [y, dark] of [[y0, 0.72], [y1, 1]] as const) {
      pos.push(cx + Math.cos(t) * radius, y, cz + Math.sin(t) * radius);
      nor.push(Math.cos(t), 0, Math.sin(t));
      uv.push((t * radius) / tile, y / tile);
      c.copy(base).multiplyScalar(k * (y0 < 0.05 ? dark : 1));
      col.push(c.r, c.g, c.b);
    }
    if (i < segs) {
      const a0 = i * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  return geometry(pos, nor, uv, col, idx);
}

/** A flat ring from radius r0 to r1 at height y, UVs planar in metres. */
function annulus(cx: number, cz: number, r0: number, r1: number, y: number, segs: number, tile: number, colour: string): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const base = new Color(colour);
  const c = new Color();
  const rr = rng(Math.round(r0 * 100));
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    for (const rad of [r0, r1]) {
      const x = cx + Math.cos(t) * rad;
      const z = cz + Math.sin(t) * rad;
      pos.push(x, y, z);
      nor.push(0, 1, 0);
      uv.push(x / tile, -z / tile);
      c.copy(base).multiplyScalar(0.9 + 0.15 * rr());
      col.push(c.r, c.g, c.b);
    }
    if (i < segs) {
      const a0 = i * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  return geometry(pos, nor, uv, col, idx);
}

function geometry(pos: number[], nor: number[], uv: number[], col: number[], idx: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}


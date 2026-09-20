/**
 * The art pass: the village as it should look, built from the same layout as its colliders.
 *
 * Modules each own a family of features. Anything not yet covered by an art module is drawn by
 * the greybox (structures only), so the village is always complete and always walkable. During
 * development `?only=ground,houses` builds just those modules, for fast iteration.
 */
import { Group, type MeshStandardMaterial, Vector3 } from 'three';
import type { Solid } from '../../solids';
import { buildGreybox } from '../greybox';
import type { VillageVisuals, VisualsContext } from '../types';
import { buildGround } from './ground';
import { buildHouses } from './houses';
import { buildPujaItems } from './pujaItems';
import { MaterialKit, PBR_SETS } from './materials';
import { type ArtContext, type ArtModule, Culler, FlameField, LampPool } from './runtime';
import { buildCeremony } from './temple.puja';
import { TextureBank } from './textures';

/**
 * Art modules, loaded on demand (so `?only=ground,temple` never imports — or hot-reloads — the
 * others). Each returns true once it draws its features; until then its greybox stands in.
 */
const MODULES: Record<string, () => Promise<{ build: ArtModule }>> = {
  temple: () => import('./temple'),
  trees: () => import('./trees'),
  shops: () => import('./shops'),
  props: () => import('./props'),
  festival: () => import('./festival'),
  npcs: () => import('./npcs'),
  life: () => import('./life'),
};

const landmarkKind = (s: Solid) => s.tag.split(':')[1];

/** Which solids each module draws — the greybox fills in whatever isn't covered. */
function covers(layout: VisualsContext['layout']): Record<string, (s: Solid) => boolean> {
  const hedges = new Set(layout.fences.filter((f) => f.kind === 'hedge').map((f) => `fence:${f.id}`));
  const isHedge = (s: Solid) => hedges.has(s.tag);
  const TEMPLE_LANDMARKS = ['deepastambha', 'shrine'];
  return {
    houses: (s) => s.tag.startsWith('house:'),
    temple: (s) => s.tag.startsWith('temple:') || s.tag.startsWith('wall:temple') || (s.tag.startsWith('landmark:') && TEMPLE_LANDMARKS.includes(landmarkKind(s))),
    trees: (s) => s.tag.startsWith('tree:') || isHedge(s) || (s.tag.startsWith('landmark:') && landmarkKind(s) === 'banyan-platform'),
    shops: (s) => s.tag.startsWith('shop:'),
    props: (s) =>
      (s.tag.startsWith('wall:') && !s.tag.startsWith('wall:temple')) ||
      (s.tag.startsWith('fence:') && !isHedge(s)) ||
      (s.tag.startsWith('landmark:') && !['banyan-platform', 'pandal', ...TEMPLE_LANDMARKS].includes(landmarkKind(s))),
    festival: (s) => s.tag.startsWith('landmark:') && landmarkKind(s) === 'pandal',
    npcs: (s) => s.tag.startsWith('villager:'),
  };
}

export async function buildArt(ctx: VisualsContext): Promise<VillageVisuals> {
  const only = new URLSearchParams(location.search).get('only')?.split(',');
  const on = (m: string) => !only || only.includes(m);

  const bank = new TextureBank(ctx.renderer);
  await bank.load([...PBR_SETS, 'Ground037', 'Ground106', 'Ground110', 'Grass004'], (p) => ctx.onProgress?.(p * 0.7));
  const kit = new MaterialKit(bank);
  const root = new Group();
  root.name = 'VillageArt';
  ctx.scene.add(root);
  const a: ArtContext = {
    ...ctx,
    bank,
    kit,
    root,
    flames: new FlameField(bank),
    lamps: new LampPool(root, 6),
    culler: new Culler(),
    ground: null,
    shared: { templeGlow: 0, moonlight: 0, goingHome: false, dangerous: false, noise: 0, player: new Vector3() },
    tick: [],
  };

  const covered: string[] = [];
  const disposables: Array<{ dispose(): void }> = [];

  if (on('ground')) {
    a.ground = buildGround(a);
    disposables.push(a.ground);
  }
  let doorHinges = new Map<string, import('three').Object3D>();
  if (on('houses')) {
    doorHinges = buildHouses(a, ctx.layout.houses);
    covered.push('houses');
  }
  // The puja items are gameplay: always drawn, whatever ?only= says.
  const items = buildPujaItems(a);
  for (const [name, load] of Object.entries(MODULES)) {
    if (!on(name)) continue;
    const { build } = await load();
    if (await build(a)) covered.push(name);
  }
  ctx.onProgress?.(0.9);

  // Everything without art yet: its greybox, so the village is always whole.
  const COVERS = covers(ctx.layout);
  const fallback = await buildGreybox(ctx, {
    noGround: on('ground'),
    structuresOnly: true,
    filter: (s) => !covered.some((m) => COVERS[m](s)),
  });
  a.flames.build(root);
  ctx.onProgress?.(1);

  const puja = buildCeremony(a);
  const camPos = new Vector3();
  // The two materials every lit window and doorway shares: brightened as evening turns to night.
  const lamplit = kit.get('lamplit') as MeshStandardMaterial;
  const interior = kit.get('interior') as MeshStandardMaterial;
  return {
    doorHinges,
    puja,
    itemVisuals: items.visuals,
    makeDropVisual: items.makeDropVisual,
    itemIcons: items.icons,
    update(dt, frame) {
      frame.camera.getWorldPosition(camPos);
      a.shared.templeGlow = frame.templeGlow;
      a.shared.moonlight = frame.moonlight;
      a.shared.goingHome = frame.goingHome;
      a.shared.dangerous = frame.dangerous;
      a.shared.noise = frame.noise;
      a.shared.player.copy(frame.player);
      const flicker = 0.9 + 0.07 * Math.sin(frame.time * 9.3) + 0.04 * Math.sin(frame.time * 23.1);
      // As the sky cools, the village's own fire comes up to meet it: diyas, lamps and lit
      // windows carry the warm half of the night's contrast (MoonLightingController has the cool).
      const warmth = 1 + 0.45 * frame.moonlight;
      a.flames.update(frame.time, 1 + 0.3 * frame.moonlight);
      a.lamps.update(dt, camPos, flicker * warmth);
      lamplit.emissiveIntensity = 1.6 * warmth;
      interior.emissiveIntensity = 0.6 * (1 + 0.8 * frame.moonlight);
      a.culler.update(dt, camPos);
      for (const t of a.tick) t(dt, frame.time, camPos);
      fallback.update(dt, frame);
    },
    dispose() {
      puja.dispose();
      fallback.dispose();
      for (const d of disposables) d.dispose();
      a.flames.dispose();
      a.lamps.dispose();
      root.traverse((o) => {
        const g = (o as { geometry?: { dispose(): void } }).geometry;
        g?.dispose();
      });
      ctx.scene.remove(root);
      kit.dispose();
      bank.dispose();
    },
  };
}

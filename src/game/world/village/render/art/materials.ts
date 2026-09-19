/**
 * The village's materials. Few and shared: paint colour, weathering and variation live in vertex
 * colours, so a whole street of differently painted houses is one plaster material — and each
 * house merges into a handful of draw calls.
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Texture,
  Vector2,
} from 'three';
import { bananaLeaf, flame, glow, grassTuft, leafAtlas, palmFrond, thatch } from './canvasTextures';
import { TONE } from './palette';
import type { PbrSetName, TextureBank } from './textures';

export type MatKey =
  | 'plaster'
  | 'stone'
  | 'rubble'
  | 'brick'
  | 'tile'
  | 'wood'
  | 'teak'
  | 'bark'
  | 'fabric'
  | 'thatch'
  | 'paint'
  | 'iron'
  | 'brass'
  | 'interior'
  | 'lamplit'
  | 'foliage'
  | 'palm'
  | 'banana'
  | 'grass'
  | 'flame'
  | 'glow'
  | 'water';

/** Metres covered by one repeat of each surface's texture. Geometry UVs are baked in metres ÷ this. */
export const TILE: Partial<Record<MatKey, number>> = {
  plaster: 2.2,
  stone: 1.4,
  rubble: 1.6,
  brick: 1.3,
  tile: 1.5,
  wood: 1.1,
  teak: 1.2,
  bark: 1.4,
  fabric: 0.9,
  thatch: 1.6,
};

export const PBR_SETS: PbrSetName[] = ['Plaster001', 'Wood049', 'RoofingTiles006', 'Bricks084', 'Bricks097', 'Bricks102', 'WoodFloor041', 'Bark014', 'Fabric061'];

export class MaterialKit {
  private readonly cache = new Map<MatKey, Material>();
  private readonly customs = new Map<string, Material>();
  private readonly bank: TextureBank;

  constructor(bank: TextureBank) {
    this.bank = bank;
  }

  get(key: MatKey): Material {
    let m = this.cache.get(key);
    if (!m) {
      m = this.make(key);
      m.name = key;
      this.cache.set(key, m);
    }
    return m;
  }

  /** A one-off material (a decal, a sign), cached by key and disposed with the kit. */
  custom<M extends Material>(key: string, make: () => M): M {
    let m = this.customs.get(key);
    if (!m) {
      m = make();
      m.name = key;
      this.customs.set(key, m);
    }
    return m as M;
  }

  /** A ground decal (rangoli, light pool): drawn over the ground without z-fighting. */
  decal(key: string, map: Texture, opts: { additive?: boolean; opacity?: number } = {}): Material {
    return this.custom(`decal:${key}`, () =>
      opts.additive
        ? new MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: opts.opacity ?? 1, polygonOffset: true, polygonOffsetFactor: -4 })
        : new MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.95, opacity: opts.opacity ?? 1, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    for (const m of this.customs.values()) m.dispose();
    this.cache.clear();
    this.customs.clear();
  }

  private pbr(set: PbrSetName, o: { normalScale?: number; roughness?: number; side?: typeof DoubleSide } = {}): MeshStandardMaterial {
    const s = this.bank.set(set);
    return new MeshStandardMaterial({
      map: s.map,
      normalMap: s.normalMap,
      normalScale: new Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
      roughnessMap: s.roughnessMap,
      aoMap: s.hasAO ? s.roughnessMap : null,
      aoMapIntensity: 0.75,
      roughness: o.roughness ?? 1,
      metalness: 0,
      vertexColors: true,
      ...(o.side !== undefined ? { side: o.side } : {}),
    });
  }

  private card(tex: Texture, roughness = 0.85): MeshStandardMaterial {
    return new MeshStandardMaterial({
      map: tex,
      alphaTest: 0.42,
      // Smooth foliage edges under MSAA instead of hard alpha-test stair-steps.
      alphaToCoverage: true,
      side: DoubleSide,
      vertexColors: true,
      roughness,
      metalness: 0,
    });
  }

  private make(key: MatKey): Material {
    switch (key) {
      case 'plaster':
        return this.pbr('Plaster001', { normalScale: 0.7 });
      case 'stone':
        return this.pbr('Bricks084', { normalScale: 0.9 });
      case 'rubble':
        return this.pbr('Bricks102');
      case 'brick':
        return this.pbr('Bricks097');
      case 'tile':
        return this.pbr('RoofingTiles006', { normalScale: 1.1 });
      case 'wood':
        return this.pbr('WoodFloor041', { normalScale: 0.8 });
      case 'teak':
        return this.pbr('Wood049', { normalScale: 0.7 });
      case 'bark':
        return this.pbr('Bark014', { normalScale: 1.2 });
      case 'fabric':
        return this.pbr('Fabric061', { normalScale: 0.5, side: DoubleSide });
      case 'thatch':
        return new MeshStandardMaterial({ map: thatch(this.bank), roughness: 1, vertexColors: true });
      case 'paint':
        return new MeshStandardMaterial({ roughness: 0.82, metalness: 0, vertexColors: true });
      case 'iron':
        return new MeshStandardMaterial({ color: TONE.iron, roughness: 0.55, metalness: 0.6 });
      case 'brass':
        return new MeshStandardMaterial({ color: TONE.brass, roughness: 0.32, metalness: 1 });
      case 'interior':
        // A doorway or window you can't see into: dark, with the faintest warmth of a lamp inside.
        return new MeshStandardMaterial({ color: TONE.interior, emissive: new Color('#3a1c08'), emissiveIntensity: 0.6, roughness: 1 });
      case 'lamplit':
        // A lit window on a festival evening.
        return new MeshStandardMaterial({ color: '#2a160a', emissive: new Color('#ffa24a'), emissiveIntensity: 1.6, roughness: 1 });
      case 'foliage':
        return this.card(leafAtlas(this.bank));
      case 'palm':
        return this.card(palmFrond(this.bank));
      case 'banana':
        return this.card(bananaLeaf(this.bank), 0.7);
      case 'grass':
        return this.card(grassTuft(this.bank), 0.95);
      case 'flame':
        // HDR-bright so the bloom pass catches it; additive so overlapping flames glow.
        return new MeshBasicMaterial({ map: flame(this.bank), color: new Color(2.4, 1.7, 0.9), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
      case 'glow':
        return new MeshBasicMaterial({ map: glow(this.bank), color: new Color(1.0, 0.55, 0.2), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
      case 'water':
        return new MeshStandardMaterial({ color: TONE.water, roughness: 0.06, metalness: 0, envMapIntensity: 1.2 });
    }
  }
}

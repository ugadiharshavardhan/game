/**
 * Texture bank: CC0 PBR sets from public/assets/textures (ambientCG), plus procedurally painted
 * canvas textures (see canvasTextures.ts). Everything is loaded once, cached, and disposed together.
 */
import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  type WebGLRenderer,
} from 'three';

const ROOT = `${import.meta.env.BASE_URL}assets/textures`;

/** Sets converted to Color / NormalGL / ORM (R = AO, G = roughness). */
const ORM_SETS = [
  'RoofingTiles006',
  'Bricks084',
  'Bricks097',
  'Bricks102',
  'Ground037',
  'Ground106',
  'Ground110',
  'Grass004',
  'Bark014',
  'WoodFloor041',
  'Fabric061',
] as const;
/** Older sets shipped with the character testbed: Color / NormalGL / Roughness. */
const ROUGHNESS_SETS = ['Plaster001', 'Wood049', 'Ground054'] as const;

export type PbrSetName = (typeof ORM_SETS)[number] | (typeof ROUGHNESS_SETS)[number];

export interface PbrSet {
  map: Texture;
  normalMap: Texture;
  /** Roughness in G. For ORM sets it also carries AO in R (use it as aoMap too). */
  roughnessMap: Texture;
  hasAO: boolean;
}

export class TextureBank {
  private readonly sets = new Map<PbrSetName, PbrSet>();
  private readonly canvases = new Map<string, CanvasTexture>();
  private readonly loader = new TextureLoader();
  private readonly anisotropy: number;

  constructor(renderer: WebGLRenderer) {
    this.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  }

  async load(names: readonly PbrSetName[], onProgress?: (p: number) => void): Promise<void> {
    let done = 0;
    await Promise.all(
      names.map(async (name) => {
        if (this.sets.has(name)) return;
        const orm = (ORM_SETS as readonly string[]).includes(name);
        const [map, normalMap, roughnessMap] = await Promise.all([
          this.tex(`${name}/Color.webp`, true),
          this.tex(`${name}/NormalGL.webp`, false),
          this.tex(`${name}/${orm ? 'ORM' : 'Roughness'}.webp`, false),
        ]);
        this.sets.set(name, { map, normalMap, roughnessMap, hasAO: orm });
        onProgress?.(++done / names.length);
      }),
    );
  }

  set(name: PbrSetName): PbrSet {
    const s = this.sets.get(name);
    if (!s) throw new Error(`Texture set ${name} not loaded`);
    return s;
  }

  /** A painted canvas texture, generated once and cached by key. */
  canvas(key: string, size: [number, number], draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true, repeat = true): CanvasTexture {
    const hit = this.canvases.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    [c.width, c.height] = size;
    const g = c.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    draw(g, c.width, c.height);
    const t = new CanvasTexture(c);
    if (srgb) t.colorSpace = SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = this.anisotropy;
    t.minFilter = LinearMipmapLinearFilter;
    this.canvases.set(key, t);
    return t;
  }

  dispose(): void {
    for (const s of this.sets.values()) for (const t of [s.map, s.normalMap, s.roughnessMap]) t.dispose();
    for (const t of this.canvases.values()) t.dispose();
    this.sets.clear();
    this.canvases.clear();
  }

  private async tex(path: string, srgb: boolean): Promise<Texture> {
    const t = await this.loader.loadAsync(`${ROOT}/${path}`);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = this.anisotropy;
    if (srgb) t.colorSpace = SRGBColorSpace;
    return t;
  }
}

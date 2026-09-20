/**
 * Pores on every skin, from one small texture.
 *
 * The skin atlases hold a whole body, so a face is only a few hundred pixels of one; detail fine
 * enough to read as pores would need a 2048 px normal map in every character file. Instead the game
 * ships one 512 px tileable map (tools/blender/build_characters.py makes it) and repeats it four
 * times across each skin — the same pores at a quarter of the download, shared by everyone.
 */
import { type Material, type Mesh, type MeshStandardMaterial, type Object3D, RepeatWrapping, type Texture, TextureLoader, Vector2 } from 'three';

const BASE = import.meta.env?.BASE_URL ?? '/';
/** How many times the map tiles across the skin atlas. */
export const PORE_REPEAT = 4;
/** How strongly the pores catch the light. Skin, not orange peel. */
export const PORE_STRENGTH = 0.5;

let shared: Promise<Texture> | null = null;

/** The one pore texture, loaded once. */
export function loadSkinDetail(): Promise<Texture> {
  shared ??= new TextureLoader().loadAsync(`${BASE}assets/textures/skin_pores.png`).then((t) => {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(PORE_REPEAT, PORE_REPEAT);
    // A normal map is data, not colour.
    t.colorSpace = '';
    t.anisotropy = 4;
    return t;
  });
  return shared;
}

/** Puts the pores on every skin material under `root`. Safe to call twice. */
export function applySkinDetail(root: Object3D, pores: Texture): number {
  let n = 0;
  const seen = new Set<Material>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(m) || !/Skin/.test(m.name)) continue;
      seen.add(m);
      const std = m as MeshStandardMaterial;
      std.normalMap = pores;
      std.normalScale = new Vector2(PORE_STRENGTH, PORE_STRENGTH);
      std.needsUpdate = true;
      n++;
    }
  });
  return n;
}

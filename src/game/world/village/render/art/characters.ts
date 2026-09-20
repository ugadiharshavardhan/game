/**
 * The village's three people, loaded once and shared: the man (the same devotee the player walks
 * as), a woman in a saree, and the priest. Each comes with the clips that drive it, made in code
 * for that model's own skeleton (the namaste, for one, is solved per skeleton).
 */
import type { AnimationClip, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DEFAULT_PLAYER_CONFIG } from '../../../../config/playerConfig';
import { buildActivityClips } from '../../../../player/activityClips';
import { buildProceduralClips } from '../../../../player/proceduralClips';
import { applySkinDetail, loadSkinDetail } from '../../../../player/skinDetail';
import type { FolkKind } from '../../types';

export interface Character {
  kind: FolkKind;
  /** The rest pose: clone this for each person. */
  scene: Object3D;
  clips: Map<string, AnimationClip>;
}

export const CHARACTER_FILE: Record<FolkKind, string> = {
  man: 'devotee.glb',
  woman: 'woman.glb',
  pujari: 'pujari.glb',
};

const cache = new Map<FolkKind, Promise<Character>>();

export function loadCharacter(kind: FolkKind): Promise<Character> {
  let p = cache.get(kind);
  if (!p) {
    p = (async () => {
      const [gltf, pores] = await Promise.all([
        new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/models/${CHARACTER_FILE[kind]}`),
        loadSkinDetail().catch(() => null),
      ]);
      if (pores) applySkinDetail(gltf.scene, pores);
      const c = DEFAULT_PLAYER_CONFIG;
      const clips = [
        ...buildProceduralClips(gltf.scene, { slow: c.slowWalkSpeed, walk: c.walkSpeed, run: c.runSpeed, crouch: c.crouchSpeed }),
        ...buildActivityClips(gltf.scene),
      ];
      return { kind, scene: gltf.scene, clips: new Map(clips.map((k) => [k.name, k])) };
    })();
    cache.set(kind, p);
  }
  return p;
}

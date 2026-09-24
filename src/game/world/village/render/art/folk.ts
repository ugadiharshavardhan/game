/**
 * A person of the village: a real skinned model with its own mixer, playing slow looping work.
 *
 * (They used to be baked poses swapped in turn — six frames of a walk, and villagers frozen where
 * they stood. Skinned people cost the GPU a little more and the memory almost nothing, move
 * smoothly at any speed, and can be doing something. They are culled beyond conversation distance,
 * and a culled person costs nothing at all.)
 */
import {
  type AnimationAction,
  AnimationMixer,
  type CanvasTexture,
  Group,
  LoopRepeat,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  SRGBColorSpace,
  type Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { FolkKind } from '../../types';
import { type Character, loadCharacter } from './characters';
import { makeProp, type Prop, type PropName } from './folkProps';
import type { ArtContext } from './runtime';

/** Kurta colours: authentic festive Maharashtrian palettes (Kesari saffron, deep royal maroon, peetambari gold, forest green, raw silk cream). */
const MAN_OUTFITS = [
  'none', // Natural rich saffron
  'hue-rotate(-28deg) saturate(1.2) brightness(0.68)', // Deep royal maroon
  'hue-rotate(12deg) saturate(1.2) brightness(1.05)', // Peetambari gold
  'hue-rotate(75deg) saturate(0.85) brightness(0.7)', // Festive forest green
  'saturate(0.22) brightness(1.12) sepia(0.18)', // Raw silk cream
];

/** Sarees: authentic Paithani and Nauvari weaves with harmonious gold and red borders. */
const WOMAN_OUTFITS = [
  'none', // Authentic Paithani emerald green with crimson/gold border
  'hue-rotate(-20deg) saturate(1.15) brightness(0.92)', // Deep festive crimson red
  'hue-rotate(35deg) saturate(1.05) brightness(0.88)', // Royal peacock teal & gold
  'hue-rotate(-40deg) saturate(1.1) brightness(0.85)', // Royal plum magenta & gold
  'hue-rotate(15deg) saturate(1.2) brightness(1.06)', // Kesari turmeric & red border
  'hue-rotate(55deg) saturate(0.9) brightness(0.8)', // Royal navy silk & gold
];

const OUTFITS: Record<FolkKind, string[]> = { man: MAN_OUTFITS, woman: WOMAN_OUTFITS, pujari: [] };

/** Meshes left off: the eyelashes are a draw call nobody at conversation distance can see. */
const HIDDEN = /Lashes/;
/** Within this many metres of the player, a person animates every frame. */
const NEAR = 14;

/** Salt-and-pepper hair for the village elders. */
export function greyHair(a: ArtContext, m: Material): Material {
  return a.kit.custom(`folk:grey-${m.name}`, () => {
    const c = (m as MeshStandardMaterial).clone();
    c.color.set('#c9c3b8');
    c.transparent = false;
    c.alphaTest = 0.45;
    c.side = 2;
    return c;
  });
}

/** A cloth material in this person's colours; everything else is shared as it is. */
export function dressed(a: ArtContext, m: Material, kind: FolkKind, outfit: number, grey: boolean): Material {
  const std = m as MeshStandardMaterial;
  if (grey && /Hair|Brows/.test(m.name)) return greyHair(a, m);
  if (/Hair|Brows/.test(m.name)) {
    m.transparent = false;
    std.alphaTest = 0.45;
    m.side = 2;
  }

  // Pyjamas should always stay traditional clean off-white / light cream cotton
  if (/Pyjama/i.test(m.name)) {
    if (!std.map) return m;
    const key = `folk:pyjama:clean`;
    const img = std.map.image as CanvasImageSource & { width: number; height: number };
    const map = a.bank.canvas(key, [img.width, img.height], (g, w, h) => {
      g.filter = 'saturate(0.08) brightness(1.2) sepia(0.1)';
      g.drawImage(img, 0, 0, w, h);
    }, true, false);
    map.flipY = std.map.flipY;
    map.colorSpace = SRGBColorSpace;
    return a.kit.custom(key, () => {
      const c = std.clone();
      c.map = map as CanvasTexture;
      c.side = 2;
      c.metalness = 0;
      c.roughness = 0.9;
      return c;
    });
  }

  const filters = OUTFITS[kind];
  if (!/Cloth/.test(m.name) || !std.map || !filters.length) {
    std.metalness = 0;
    return m;
  }
  const filter = filters[outfit % filters.length];
  if (filter === 'none') {
    m.side = 2;
    return m;
  }
  const key = `folk:${m.name}:${outfit % filters.length}`;
  const img = std.map.image as CanvasImageSource & { width: number; height: number };
  const map = a.bank.canvas(key, [img.width, img.height], (g, w, h) => {
    g.filter = filter;
    g.drawImage(img, 0, 0, w, h);
  }, true, false);
  map.flipY = std.map.flipY;
  map.colorSpace = SRGBColorSpace;
  return a.kit.custom(key, () => {
    const c = std.clone();
    c.map = map as CanvasTexture;
    c.side = 2;
    c.metalness = 0;
    c.roughness = 0.88;
    return c;
  });
}

export interface PersonOptions {
  kind: FolkKind;
  outfit: number;
  grey?: boolean;
  scale: number;
}

export class Person {
  readonly group = new Group();
  readonly kind: FolkKind;
  private readonly model: Object3D;
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly char: Character;
  private current: AnimationAction | null = null;
  private currentName = '';
  private prop: Prop | null = null;
  private propName: PropName | null = null;
  private readonly scene: Object3D;
  private readonly live: { npcHz: number };
  private readonly player: Vector3;
  private pending = Math.random() / 30;

  constructor(a: ArtContext, char: Character, o: PersonOptions) {
    this.char = char;
    this.kind = o.kind;
    this.scene = a.root;
    this.live = a.live;
    this.player = a.shared.player;
    this.model = cloneSkinned(char.scene);
    this.model.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (HIDDEN.test(mesh.name)) mesh.visible = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const out = mats.map((m) => dressed(a, m, o.kind, o.outfit, !!o.grey));
      mesh.material = Array.isArray(mesh.material) ? out : out[0];
    });
    this.group.add(this.model);
    this.group.scale.setScalar(o.scale);
    this.mixer = new AnimationMixer(this.model);
    a.root.add(this.group);
  }

  /** Where one of this person's bones is, in the world. */
  boneWorld(bone: string, out: Vector3): Vector3 {
    const b = this.model.getObjectByName(`mixamorig${bone}`);
    return b ? b.getWorldPosition(out) : out.copy(this.group.position);
  }

  get playing(): string {
    return this.currentName;
  }

  /** Crossfade to a clip. `timeScale` speeds or slows it; `randomise` starts it at a random point of its loop. */
  play(name: string, o: { fade?: number; timeScale?: number; randomise?: boolean } = {}): void {
    if (name === this.currentName) {
      if (o.timeScale !== undefined) this.current?.setEffectiveTimeScale(o.timeScale);
      return;
    }
    const clip = this.char.clips.get(name) ?? this.char.clips.get('Idle');
    if (!clip) return;
    let action = this.actions.get(clip.name);
    if (!action) {
      action = this.mixer.clipAction(clip);
      action.setLoop(LoopRepeat, Infinity);
      this.actions.set(clip.name, action);
    }
    action.reset().setEffectiveTimeScale(o.timeScale ?? 1).setEffectiveWeight(1);
    if (o.randomise) action.time = Math.random() * clip.duration;
    if (this.current && this.current !== action) this.current.fadeOut(o.fade ?? 0.5);
    action.fadeIn(o.fade ?? 0.5).play();
    this.current = action;
    this.currentName = name;
  }

  /** The natural ground speed of a walking clip, for matching playback to how fast they really walk. */
  groundSpeed(name: string): number {
    return (this.char.clips.get(name)?.userData as { groundSpeed?: number } | undefined)?.groundSpeed ?? 1.2;
  }

  /** Holds (or puts down) a prop. */
  hold(name: PropName | null): void {
    if (name === this.propName) return;
    this.prop?.object.removeFromParent();
    this.prop?.dispose();
    this.prop = name ? makeProp(name) : null;
    this.propName = name;
    if (this.prop) this.scene.add(this.prop.object);
  }

  get visible(): boolean {
    return this.group.visible;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
    if (this.prop) this.prop.object.visible = v;
  }

  update(dt: number): void {
    // The culler hides the person; the prop is not their child, so it follows.
    if (this.prop) this.prop.object.visible = this.group.visible;
    if (!this.group.visible) return;
    // Beyond conversation distance a person animates at the PerformanceManager's rate, with the
    // skipped time carried over — slower to update, never slower to move. Staggered by `pending`'s
    // random start so a crowd does not all pose on the same frame.
    this.pending += dt;
    const p = this.group.position;
    const near = (p.x - this.player.x) ** 2 + (p.z - this.player.z) ** 2 < NEAR * NEAR;
    if (!near && this.pending < 1 / Math.max(this.live.npcHz, 1)) return;
    this.mixer.update(this.pending);
    this.pending = 0;
    if (this.prop) {
      this.group.updateMatrixWorld(true);
      this.prop.update(this);
    }
  }

  dispose(): void {
    this.hold(null);
    this.mixer.stopAllAction();
    this.group.removeFromParent();
  }
}

/** A person of the given kind, ready to be placed. */
export async function spawn(a: ArtContext, o: PersonOptions): Promise<Person> {
  return new Person(a, await loadCharacter(o.kind), o);
}


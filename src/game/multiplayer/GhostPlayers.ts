/**
 * Your teammates, in your village.
 *
 * They are the same devotee you are playing, drawn translucent with a soft rim so they read as
 * *people who are really here* rather than as ghosts to be afraid of or NPCs to talk to — the
 * convention a racing game uses for the car ahead of you. They keep their animation (idle, walk,
 * run, sneak), they keep their silhouette, and they never block a doorway: a ghost has no
 * collider at all, so four players can crowd the same lane and nobody is stuck behind anybody.
 *
 * Cost is fixed and small: at most three of these exist, they cast no shadows, their rim is five
 * instructions on top of the standard material, and a teammate indoors or far away is not drawn.
 */
import {
  type AnimationClip,
  CanvasTexture,
  type Camera,
  Color,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  type Scene,
  SkinnedMesh,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { RemotePeer } from '../../shared/multiplayer';
import type { PlayerConfig } from '../config/playerConfig';
import type { PeerLink } from './PeerLink';
import { CharacterAnimationController } from '../player/CharacterAnimationController';
import { PostureMachine, type PostureKind } from '../player/posture';

/** How solid a teammate looks: enough to read, never enough to hide the village behind them. */
const OPACITY = 0.58;
/** Within this, a teammate's animation runs every frame; beyond it, at fifteen a second. */
const FULL_RATE = 18;
/** Name tags stop being drawn past this, in metres. */
const TAG_FAR = 34;
const TAG_FADE = 22;


interface Ghost {
  playerId: string;
  root: Group;
  model: Object3D;
  animation: CharacterAnimationController;
  materials: MeshStandardMaterial[];
  tag: Sprite;
  tagTexture: CanvasTexture;
  tagCanvas: HTMLCanvasElement;
  lastPercent: number;
  lastCollected: number;
  last: Vector3;
  name: string;
  /** Time owed to the mixer, for teammates whose animation runs at a lower rate. */
  lag: number;
  /** Their sitting and sleeping, played through the same transitions as the local player's. */
  posture: PostureMachine;
  /** The state last frame, to catch a take-off and a landing. */
  lastState: string;
}

const postureOf = (state: string): PostureKind => (state === 'sitting' ? 'sitting' : state === 'sleeping' ? 'sleeping' : 'standing');

export class GhostPlayers {
  private readonly scene: Scene;
  private readonly source: Object3D;
  private readonly clips: AnimationClip[];
  private readonly config: PlayerConfig;
  private readonly camera: Camera;
  private readonly link: PeerLink;
  private readonly ghosts = new Map<string, Ghost>();
  private readonly unsubscribe: () => void;
  private readonly cameraAt = new Vector3();

  /** More teammates than this are not drawn at once (the contest's teams are four). */
  private readonly maxGhosts: number;
  /** Animation rate for teammates beyond FULL_RATE metres; lowered by the performance manager. */
  farHz = 15;

  constructor(scene: Scene, source: Object3D, clips: AnimationClip[], config: PlayerConfig, camera: Camera, link: PeerLink, maxGhosts = 3) {
    this.scene = scene;
    this.source = source;
    this.clips = clips;
    this.config = config;
    this.camera = camera;
    this.link = link;
    this.maxGhosts = maxGhosts;
    this.unsubscribe = link.onLeave((playerId) => this.remove(playerId));
  }

  update(dt: number): void {
    const peers = this.link.peers();
    this.camera.getWorldPosition(this.cameraAt);
    // Nearest first: if a team is ever larger than the ghosts we draw, draw the ones you can see.
    const visible = peers
      .filter((p) => !p.indoors && p.presence > 0.02)
      .sort((a, b) => near(a, this.cameraAt) - near(b, this.cameraAt))
      .slice(0, this.maxGhosts);
    const keep = new Set(visible.map((p) => p.playerId));
    for (const id of [...this.ghosts.keys()]) if (!keep.has(id)) this.remove(id);

    for (const peer of visible) {
      const ghost = this.ghosts.get(peer.playerId) ?? this.add(peer);
      const from = ghost.last;
      const moved = Math.hypot(peer.x - from.x, peer.z - from.z);
      ghost.root.position.set(peer.x, peer.y, peer.z);
      ghost.root.rotation.y = peer.yaw;
      ghost.last.set(peer.x, peer.y, peer.z);
      const distance = Math.hypot(peer.x - this.cameraAt.x, peer.z - this.cameraAt.z);

      // A teammate reaching for a flower plays the same one-shot the local player would; the
      // network says *what* they are doing, never how the body should do it.
      if (peer.state === 'interacting' && !ghost.animation.isPlayingAction) {
        ghost.animation.playInteract(null, () => {});
      }
      // Sitting down, lying down and getting up: the network says which, the ghost's own machine
      // plays the way there, so a teammate never pops from standing to lying.
      ghost.posture.follow(postureOf(peer.state));
      ghost.posture.update(dt);
      ghost.animation.setPosture(ghost.posture.phase);
      if (peer.state === 'jumping' && ghost.lastState !== 'jumping') ghost.animation.launched();
      if (peer.state !== 'jumping' && ghost.lastState === 'jumping') ghost.animation.landed(4, peer.state === 'running');
      ghost.lastState = peer.state;
      // Their animation is driven by how fast they are actually travelling, so a ghost's feet
      // match its motion however the packets arrive. Their state decides only the things
      // speed cannot: standing still, sneaking, and being airborne.
      const still = peer.state === 'idle' || ghost.posture.locksMovement;
      const speed = dt > 0 && !still ? Math.min(moved / dt, this.config.runSpeed * 1.2) : 0;
      // Far away, the mixer runs at a quarter of the rate (less on a struggling device): nobody can
      // see the difference at twenty metres, and skinning is the most expensive thing a ghost does.
      ghost.lag += dt;
      if (distance < FULL_RATE || ghost.lag > 1 / this.farHz) {
        ghost.animation.updateMovementAnimation(ghost.lag, speed, peer.state === 'sneaking', peer.state === 'jumping');
        ghost.lag = 0;
      }

      if (peer.completionPercent !== ghost.lastPercent || peer.collected !== ghost.lastCollected || peer.displayName !== ghost.name) {
        ghost.lastPercent = peer.completionPercent;
        ghost.lastCollected = peer.collected;
        ghost.name = peer.displayName;
        drawTagCanvas(ghost.tagCanvas, ghost.name, ghost.lastPercent, ghost.lastCollected);
        ghost.tagTexture.needsUpdate = true;
      }

      const fade = peer.presence * (distance > TAG_FAR ? 0 : 1);
      for (const m of ghost.materials) m.opacity = OPACITY * peer.presence;
      // The tag stays a readable size at any distance, and bows out before it becomes clutter.
      const tagScale = Math.min(Math.max(distance * 0.045, 0.34), 0.95);
      ghost.tag.scale.set(tagScale * 2.6, tagScale, 1);
      (ghost.tag.material as SpriteMaterial).opacity = fade * (distance > TAG_FADE ? 1 - (distance - TAG_FADE) / (TAG_FAR - TAG_FADE) : 1);
      ghost.tag.visible = (ghost.tag.material as SpriteMaterial).opacity > 0.02;
    }
  }

  private add(peer: RemotePeer): Ghost {
    const model = cloneSkinned(this.source);
    const materials: MeshStandardMaterial[] = [];
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (o instanceof SkinnedMesh) o.frustumCulled = false;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const ghosted = list.map((m) => ghostMaterial(m));
      materials.push(...ghosted);
      mesh.material = ghosted.length === 1 ? ghosted[0] : ghosted;
      // Clothes after skin: a translucent figure has to be dressed in a fixed order, or the
      // torso blends over the kurta and the devotee turns up to the puja in his vest.
      mesh.renderOrder = /Kurta|Pyjama|Jhola/.test(mesh.name) ? 3 : 2;
    });

    const root = new Group();
    root.name = `ghost:${peer.playerId}`;
    root.add(model);
    const { sprite, texture, canvas } = nameTag(peer.displayName, peer.completionPercent, peer.collected);
    sprite.position.set(0, 1.95, 0);
    root.add(sprite);
    this.scene.add(root);

    const ghost: Ghost = {
      playerId: peer.playerId,
      root,
      model,
      animation: new CharacterAnimationController(model, this.clips, this.config),
      materials,
      tag: sprite,
      tagTexture: texture,
      tagCanvas: canvas,
      lastPercent: peer.completionPercent,
      lastCollected: peer.collected,
      last: new Vector3(peer.x, peer.y, peer.z),
      name: peer.displayName,
      lag: 0,
      posture: new PostureMachine(),
      lastState: peer.state,
    };
    this.ghosts.set(peer.playerId, ghost);
    return ghost;
  }

  private remove(playerId: string): void {
    const ghost = this.ghosts.get(playerId);
    if (!ghost) return;
    this.ghosts.delete(playerId);
    ghost.animation.dispose?.();
    for (const m of ghost.materials) m.dispose();
    ghost.tagTexture.dispose();
    (ghost.tag.material as SpriteMaterial).dispose();
    ghost.root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
    });
    this.scene.remove(ghost.root);
  }

  dispose(): void {
    this.unsubscribe();
    for (const id of [...this.ghosts.keys()]) this.remove(id);
  }
}

const near = (p: RemotePeer, camera: Vector3) => (p.x - camera.x) ** 2 + (p.z - camera.z) ** 2;

/**
 * The same material, made of light: translucent, unshadowed, with a cool rim picking out the
 * silhouette. Five instructions on top of the standard shader — no second pass, no outline
 * geometry, nothing a phone will feel.
 */
function ghostMaterial(source: Material): MeshStandardMaterial {
  const m = (source as MeshStandardMaterial).clone();
  m.transparent = true;
  m.opacity = OPACITY;
  // Depth is still written: a ghost's own far side should not show through its near side, and
  // without it the meshes of one body blend into each other in whatever order they happen to sort.
  m.depthWrite = true;
  m.emissive = new Color('#3d5a8c');
  m.emissiveIntensity = 0.15;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
      float ghostRim = pow( 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 2.2 );
      outgoingLight += vec3( 0.42, 0.56, 0.85 ) * ghostRim * 0.45;
      diffuseColor.a = min( 1.0, diffuseColor.a + ghostRim * 0.3 );
      #include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => 'ghost';
  return m;
}

/** Draws the name, completion percentage, and collected items on the floating canvas. */
function drawTagCanvas(canvas: HTMLCanvasElement, name: string, percent = 0, collected = 0): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // Player Name with dark halo for readability
  g.font = '700 36px "Inter", system-ui, sans-serif';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(8,10,18,0.9)';
  g.strokeText(name, canvas.width / 2, 32);
  g.fillStyle = '#f2e3c2';
  g.fillText(name, canvas.width / 2, 32);

  // Subtext: Completion % and Collected offerings
  const isComplete = percent >= 100;
  const subtext = isComplete ? '🙏 Puja 100%' : `${percent}% · 🎒 ${collected}`;
  g.font = '600 24px "Inter", system-ui, sans-serif';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(8,10,18,0.9)';
  g.strokeText(subtext, canvas.width / 2, 70);
  g.fillStyle = isComplete ? '#f6ad55' : '#e2d4b7';
  g.fillText(subtext, canvas.width / 2, 70);
}

/** A name and progress badge, drawn into a small canvas and hung over their head facing wherever you are. */
function nameTag(name: string, percent = 0, collected = 0): { sprite: Sprite; texture: CanvasTexture; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  drawTagCanvas(canvas, name, percent, collected);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  sprite.renderOrder = 4;
  return { sprite, texture, canvas };
}

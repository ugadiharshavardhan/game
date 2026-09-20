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
import { PlayerAnimation } from '../player/PlayerAnimation';

/** How solid a teammate looks: enough to read, never enough to hide the village behind them. */
const OPACITY = 0.58;
/** Name tags stop being drawn past this, in metres. */
const TAG_FAR = 34;
const TAG_FADE = 22;


interface Ghost {
  playerId: string;
  root: Group;
  model: Object3D;
  animation: PlayerAnimation;
  materials: MeshStandardMaterial[];
  tag: Sprite;
  tagTexture: CanvasTexture;
  last: Vector3;
  name: string;
}

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
      // Their animation is driven by how fast they are actually travelling, so a ghost's feet
      // match its motion however the packets arrive.
      const speed = dt > 0 ? Math.min(moved / dt, this.config.runSpeed * 1.2) : 0;
      ghost.animation.update(dt, peer.state === 'idle' ? 0 : speed, peer.state === 'sneaking', peer.state === 'jumping');

      const distance = Math.hypot(peer.x - this.cameraAt.x, peer.z - this.cameraAt.z);
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
    const { sprite, texture } = nameTag(peer.displayName);
    sprite.position.set(0, 1.95, 0);
    root.add(sprite);
    this.scene.add(root);

    const ghost: Ghost = {
      playerId: peer.playerId,
      root,
      model,
      animation: new PlayerAnimation(model, this.clips, this.config),
      materials,
      tag: sprite,
      tagTexture: texture,
      last: new Vector3(peer.x, peer.y, peer.z),
      name: peer.displayName,
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

/** A name, drawn once into a small canvas and hung over their head facing wherever you are. */
function nameTag(name: string): { sprite: Sprite; texture: CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  if (g) {
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.font = '600 44px "Inter", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // A dark halo, so a pale name stays readable against a pale wall.
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(8,10,18,0.85)';
    g.strokeText(name, canvas.width / 2, canvas.height / 2);
    g.fillStyle = '#f2e3c2';
    g.fillText(name, canvas.width / 2, canvas.height / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  sprite.renderOrder = 4;
  return { sprite, texture };
}

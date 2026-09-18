import { type AnimationClip, Group, type Material, Mesh, type Object3D, type Scene, SkinnedMesh, Vector3 } from 'three';
import { EventBus } from '../../shared/EventBus';
import type { PlayerConfig } from '../config/playerConfig';
import type { AudioBank } from '../core/AudioBank';
import type { Input } from '../core/Input';
import type { Physics } from '../core/Physics';
import { PlayerAnimation } from './PlayerAnimation';
import { PlayerAudio } from './PlayerAudio';
import { PlayerController } from './PlayerController';
import { type Interactable, type InteractionActor, PlayerInteraction } from './PlayerInteraction';
import { PlayerState, PlayerStateId } from './PlayerState';

/**
 * The playable devotee: model + controller + state + animation + interaction + audio.
 * Update order each frame: input → interaction → movement → animation → audio.
 */
export class Player implements InteractionActor {
  readonly state = new PlayerState();
  readonly controller: PlayerController;
  readonly animation: PlayerAnimation;
  readonly interaction: PlayerInteraction;
  readonly audio: PlayerAudio;
  readonly root = new Group();
  private readonly unsubscribe: () => void;
  private readonly input: Input;

  constructor(
    model: Object3D,
    clips: AnimationClip[],
    scene: Scene,
    physics: Physics,
    input: Input,
    config: PlayerConfig,
    bank: AudioBank,
    interactables: readonly Interactable[],
    spawn: Vector3,
    spawnYaw: number,
  ) {
    this.input = input;
    prepareMaterials(model);
    this.root.name = 'Player';
    this.root.add(model);
    scene.add(this.root);

    this.controller = new PlayerController(physics, config, this.state, spawn, spawnYaw);
    this.animation = new PlayerAnimation(model, clips, config);
    if (this.animation.missingClips.length) {
      console.warn(`[player] missing animation clips: ${this.animation.missingClips.join(', ')}`);
    }
    this.interaction = new PlayerInteraction(interactables, config);
    this.audio = new PlayerAudio(
      bank,
      config,
      model.getObjectByName('mixamorigLeftFoot'),
      model.getObjectByName('mixamorigRightFoot'),
    );
    this.unsubscribe = this.state.onChange((_, to) => EventBus.emit('ui:player-state', { state: to }));
    this.syncModel();
  }

  get feet(): Vector3 {
    return this.controller.feet;
  }

  get yaw(): number {
    return this.controller.yaw;
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  update(dt: number, cameraYaw: number): void {
    this.interaction.update(dt, this);
    if (this.input.interactPressed) {
      const action = this.interaction.tryBegin(this);
      if (action) {
        this.animation.play(
          action,
          () => this.interaction.midpoint(this),
          () => this.interaction.complete(this),
        );
      }
    }
    if (this.interaction.active) this.controller.faceTowards(this.interaction.active.position, dt);

    this.controller.update(dt, this.input, cameraYaw);
    this.syncModel();
    this.animation.update(dt, this.controller.planarSpeed, this.controller.crouched);
    this.audio.update(this.controller, this.state.value === PlayerStateId.Hidden);
  }

  dispose(): void {
    this.unsubscribe();
    this.animation.dispose();
    this.root.removeFromParent();
  }

  private syncModel(): void {
    this.root.position.copy(this.controller.feet);
    this.root.rotation.y = this.controller.yaw;
  }
}

/**
 * Per-material fixes for the exported character: hair/brow/lash cards use alpha-tested
 * cut-outs (sorting-free), cloth is double-sided, everything casts and receives shadows.
 */
function prepareMaterials(model: Object3D): void {
  model.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o instanceof SkinnedMesh) o.frustumCulled = false;
    const mats: Material[] = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const std = m as Material & { roughness?: number; metalness?: number; alphaTest: number };
      if (/Hair|Brows|Lashes/.test(m.name)) {
        m.transparent = false;
        std.alphaTest = 0.45;
        m.side = 2; // DoubleSide
        m.depthWrite = true;
      }
      if (/Cloth/.test(m.name)) m.side = 2;
      if (std.metalness !== undefined) std.metalness = 0;
      if (std.roughness !== undefined) {
        std.roughness = /Skin/.test(m.name) ? 0.55 : /Eyes/.test(m.name) ? 0.15 : /Hair/.test(m.name) ? 0.5 : 0.85;
      }
      m.needsUpdate = true;
    }
  });
}

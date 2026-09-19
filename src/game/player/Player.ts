import { type AnimationClip, Group, type Material, Mesh, type Object3D, type Scene, SkinnedMesh, Vector3 } from 'three';
import { EventBus } from '../../shared/EventBus';
import type { CameraTarget } from '../camera/ThirdPersonCamera';
import type { PlayerConfig } from '../config/playerConfig';
import type { AudioBank } from '../core/AudioBank';
import type { Input } from '../core/Input';
import type { Physics } from '../core/Physics';
import type { InteractionActor } from '../interaction/IInteractable';
import type { ShelterActor } from '../shelter/ShelterManager';
import { type PlayerAction, PlayerAnimation } from './PlayerAnimation';
import { PlayerAudio } from './PlayerAudio';
import { PlayerController } from './PlayerController';
import { buildProceduralClips } from './proceduralClips';
import { PlayerState, PlayerStateId } from './PlayerState';

/**
 * The playable devotee: model + controller + state + animation + audio.
 * Update order each frame: movement → animation → audio. Interaction is a separate system
 * (interaction/InteractionSystem) that drives the player through InteractionActor.
 */
export class Player implements InteractionActor, ShelterActor, CameraTarget {
  readonly state = new PlayerState();
  readonly controller: PlayerController;
  readonly animation: PlayerAnimation;
  readonly audio: PlayerAudio;
  readonly root = new Group();
  private readonly unsubscribe: () => void;
  private readonly input: Input;
  private readonly materials: Material[] = [];
  private hiddenIndoors = false;
  private cameraFade = 1;

  constructor(
    model: Object3D,
    clips: AnimationClip[],
    scene: Scene,
    physics: Physics,
    input: Input,
    config: PlayerConfig,
    bank: AudioBank,
    spawn: Vector3,
    spawnYaw: number,
  ) {
    this.input = input;
    prepareMaterials(model);
    model.traverse((o) => {
      if (o instanceof Mesh) this.materials.push(...(Array.isArray(o.material) ? o.material : [o.material]));
    });
    this.root.name = 'Player';
    this.root.add(model);
    scene.add(this.root);

    this.controller = new PlayerController(physics, config, this.state, spawn, spawnYaw);
    // devotee.glb carries no animation: make its clips from its skeleton (proceduralClips.ts).
    const all = clips.length
      ? clips
      : buildProceduralClips(model, { slow: config.slowWalkSpeed, walk: config.walkSpeed, run: config.runSpeed, crouch: config.crouchSpeed });
    this.animation = new PlayerAnimation(model, all, config);
    if (this.animation.missingClips.length) {
      console.warn(`[player] missing animation clips: ${this.animation.missingClips.join(', ')}`);
    }
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

  // ---- CameraTarget --------------------------------------------------------------------------

  get bodyHeight(): number {
    return this.controller.height;
  }

  get planarSpeed(): number {
    return this.controller.planarSpeed;
  }

  get collider() {
    return this.controller.collider;
  }

  get gait(): 'normal' | 'run' | 'sneak' {
    const s = this.state.value;
    return s === PlayerStateId.Running ? 'run' : s === PlayerStateId.Sneaking ? 'sneak' : 'normal';
  }

  /** Fades the character out as the camera closes in, so it never renders the inside of the head. */
  setCameraFade(alpha: number): void {
    const a = Math.round(alpha * 20) / 20; // quantised: no material churn on sub-percent changes
    if (a === this.cameraFade) return;
    this.cameraFade = a;
    for (const m of this.materials) {
      m.transparent = a < 1;
      m.opacity = a;
      m.depthWrite = a >= 1;
    }
    this.applyVisibility();
  }

  setVisible(visible: boolean): void {
    this.hiddenIndoors = !visible;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    this.root.visible = !this.hiddenIndoors && this.cameraFade > 0.02;
  }

  // ---- InteractionActor ------------------------------------------------------------------------

  playAction(action: PlayerAction, onContact: () => void, onDone: () => void): void {
    this.animation.play(action, onContact, onDone);
  }

  setBusy(busy: boolean): void {
    if (busy) this.state.beginInteraction();
    else this.state.endInteraction();
  }

  faceTowards(point: Vector3, dt: number): void {
    this.controller.faceTowards(point, dt);
  }

  // ---- ShelterActor ----------------------------------------------------------------------------

  walkTowards(x: number, z: number, speed: number): void {
    this.controller.walkTowards(x, z, speed);
  }

  stopWalking(): void {
    this.controller.stopWalking();
  }

  get walkRemaining(): number {
    return this.controller.walkRemaining;
  }

  setScripted(on: boolean): void {
    this.state.setScripted(on);
  }

  placeAt(point: Vector3, yaw: number): void {
    this.controller.teleport(point, yaw);
  }

  update(dt: number, cameraYaw: number): void {
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

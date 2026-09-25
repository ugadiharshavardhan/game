import { type AnimationClip, Group, type Material, Mesh, type Object3D, type Scene, SkinnedMesh, Vector3 } from 'three';
import { EventBus } from '../../shared/EventBus';
import type { CameraTarget } from '../camera/ThirdPersonCamera';
import type { PlayerConfig } from '../config/playerConfig';
import type { AudioBank } from '../core/AudioBank';
import type { Input } from '../core/Input';
import type { Physics } from '../core/Physics';
import type { InteractionActor } from '../interaction/IInteractable';
import type { ShelterActor } from '../shelter/ShelterManager';
import { type PlayerAction, CharacterAnimationController } from './CharacterAnimationController';
import { PlayerAudio } from './PlayerAudio';
import { PlayerController } from './PlayerController';
import { buildProceduralClips, findBone } from './proceduralClips';
import { PlayerState, PlayerStateId } from './PlayerState';
import { Posture, PostureMachine, type PostureContext, type PostureRefusal } from './posture';

/** Steepest ground a lying body is laid along, radians: past it, the ground is refused. */
const MAX_LIE_PITCH = (10 * Math.PI) / 180;

/**
 * The playable devotee: model + controller + state + animation + audio.
 * Update order each frame: movement → animation → audio. Interaction is a separate system
 * (interaction/InteractionSystem) that drives the player through InteractionActor.
 */
export class Player implements InteractionActor, ShelterActor, CameraTarget {
  readonly state = new PlayerState();
  readonly controller: PlayerController;
  readonly animation: CharacterAnimationController;
  readonly audio: PlayerAudio;
  readonly root = new Group();
  /** Sitting down, lying down to sleep and getting up (posture.ts). */
  readonly posture = new PostureMachine();
  /**
   * Between the root and the model: lays a sleeping body along gently sloping ground (a few
   * degrees at most). The lying-down itself is the skeleton's work, never this.
   */
  private readonly align = new Group();
  private lieTilt = 0;
  /** Whether the player is in a shelter; the HUD words sleep differently indoors. */
  sheltered: () => boolean = () => false;
  private readonly unsubscribe: () => void;
  private readonly unsubscribePosture: () => void;
  private readonly input: Input;
  private readonly materials: Material[] = [];
  private hiddenIndoors = false;
  private cameraFade = 1;
  /** Where the hem is, relative to the body: (x, z) lag and (y) lift. */
  private readonly clothSway = { value: new Vector3() };
  private clothPhase = 0;
  private readonly config: PlayerConfig;

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
    this.config = config;
    prepareMaterials(model, this.clothSway);
    model.traverse((o) => {
      if (o instanceof Mesh) this.materials.push(...(Array.isArray(o.material) ? o.material : [o.material]));
    });
    this.root.name = 'Player';
    this.align.add(model);
    this.root.add(this.align);
    scene.add(this.root);

    this.controller = new PlayerController(physics, config, this.state, spawn, spawnYaw);
    // devotee.glb carries no animation: make its clips from its skeleton (proceduralClips.ts).
    const all = clips.length
      ? clips
      : buildProceduralClips(model, {
          slow: config.slowWalkSpeed,
          walk: config.walkSpeed,
          fastWalk: config.fastWalkSpeed,
          run: config.runSpeed,
          crouch: config.crouchSpeed,
        });
    this.animation = new CharacterAnimationController(model, all, config);
    if (this.animation.missingClips.length && import.meta.env.DEV) {
      console.warn(`[player] missing animation clips: ${this.animation.missingClips.join(', ')}`);
    }
    this.audio = new PlayerAudio(
      bank,
      config,
      findBone(model, 'LeftFoot'),
      findBone(model, 'RightFoot'),
    );
    this.unsubscribe = this.state.onChange((_, to) => EventBus.emit('ui:player-state', { state: to }));
    this.unsubscribePosture = this.posture.onChange((_, to) => {
      this.state.setPosture(this.posture.kind);
      this.animation.setPosture(to);
      EventBus.emit('ui:posture', { phase: to, sheltered: this.sheltered() });
    });
    this.syncModel();
  }

  /** Only a player on their feet and not asleep can use things. */
  get canInteract(): boolean {
    return this.posture.phase === Posture.Standing;
  }

  /** SIT / STAND. */
  toggleSit(): void {
    const ctx = this.postureContext(false);
    if (!this.posture.isSeated && !this.controller.standFromCrouch()) return this.refuse('headroom');
    this.refuse(this.posture.toggleSit(ctx));
  }

  /** SLEEP / WAKE UP. */
  toggleSleep(): void {
    if (this.posture.isAsleep) {
      this.posture.request('wake', this.postureContext(false));
      return;
    }
    if (this.posture.isSeated) return this.refuse('seated');
    if (this.posture.phase !== Posture.Standing) return;
    if (!this.controller.standFromCrouch()) return this.refuse('headroom');
    const space = this.controller.grounded ? this.controller.lieSpace() : null;
    if (space && !space.ok) return this.refuse(space.reason === 'slope' ? 'slope' : 'no-room');
    if (space?.ok && Math.abs(space.pitch) > MAX_LIE_PITCH) return this.refuse('slope');
    const refusal = this.posture.request('sleep', this.postureContext(true));
    if (!refusal && space?.ok) this.lieTilt = space.pitch;
    this.refuse(refusal);
  }

  private postureContext(roomToLie: boolean): PostureContext {
    return { grounded: this.controller.grounded && !this.controller.airborne, busy: this.state.isBusy, roomToLie };
  }

  private refuse(reason: PostureRefusal | 'headroom' | 'seated' | 'slope'): void {
    const text: Partial<Record<NonNullable<typeof reason>, string>> = {
      'no-room': 'No room to lie down here.',
      slope: 'Find flat ground to lie down.',
      headroom: 'No room to stand up here.',
      seated: 'Stand up first.',
    };
    const line = reason ? text[reason] : undefined;
    if (line) EventBus.emit('ui:toast', { text: line, tone: 'info' });
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

  /** What the body is doing, for the network and anyone else who asks. */
  get movementState() {
    return this.animation.movementState;
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
    // Carried somewhere (a doorway failsafe, taken indoors by the moon): on your feet when you arrive.
    this.posture.reset();
    this.controller.teleport(point, yaw);
  }

  update(dt: number, cameraYaw: number): void {
    const input = this.input;
    if (input.sleepPressed) this.toggleSleep();
    else if (input.sitPressed) this.toggleSit();
    this.posture.update(dt);
    this.controller.update(dt, input, cameraYaw);
    this.syncModel();
    // Asked to come most of the way round from a standstill: the body takes a step rather than
    // rotating on the spot like a turret.
    if (this.controller.turnedInPlace !== 0 && !this.posture.locksMovement) this.animation.turnInPlace(this.controller.turnedInPlace);
    if (this.controller.launched) this.animation.launched();
    if (this.controller.landedAt > 0) this.animation.landed(this.controller.landedAt, this.controller.planarSpeed > this.config.walkSpeed);
    this.animation.updateMovementAnimation(dt, this.controller.planarSpeed, this.controller.crouched, this.controller.airborne);
    // A sleeping body follows the ground's gentle tilt, as much as it is lying down.
    const tilt = this.posture.isAsleep ? -this.lieTilt : 0;
    this.align.rotation.x = tilt * this.animation.postureBlend;
    this.swayCloth(dt);
    this.audio.update(this.controller, this.state.value === PlayerStateId.Hidden, dt);
  }

  /** The hem: pushed back by the walk, swung by the stride, and settled when standing still. */
  private swayCloth(dt: number): void {
    const c = this.config;
    const speed = this.controller.planarSpeed;
    const travel = Math.min(speed / c.runSpeed, 1);
    this.clothPhase += dt * (2 + travel * 7);
    // Against the direction of travel (the model faces +z in its own frame), with a little swing.
    const target = this.clothSway.value;
    const back = -travel * CLOTH_SHADER.reach;
    const swing = Math.sin(this.clothPhase) * CLOTH_SHADER.reach * 0.45 * travel;
    const lift = travel * CLOTH_SHADER.reach * 0.35;
    const k = 1 - Math.exp(-dt / 0.09);
    target.x += (swing - target.x) * k;
    target.y += (back - target.y) * k;
    target.z += (lift - target.z) * k;
  }

  dispose(): void {
    this.unsubscribe();
    this.unsubscribePosture();
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
/**
 * The kurta's hem lags behind the person wearing it.
 *
 * Not cloth simulation — five instructions in the vertex shader. Everything below the waist is
 * pushed backward against the direction of travel and swung a little side to side in time with
 * the stride, fading to nothing at the waist. It costs one uniform and reads, at a glance, as a
 * garment rather than paint.
 */
const CLOTH_SHADER = {
  waist: 1.02,
  hem: 0.78,
  /** How far the hem may travel, in metres. */
  reach: 0.055,
};

function patchCloth(material: Material, sway: { value: Vector3 }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uClothSway = sway;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform vec3 uClothSway;\nvoid main() {')
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>
        float hem = clamp( ( ${CLOTH_SHADER.waist.toFixed(2)} - transformed.y ) / ${(CLOTH_SHADER.waist - CLOTH_SHADER.hem).toFixed(2)}, 0.0, 1.0 );
        transformed.xz += uClothSway.xy * hem * hem;
        transformed.y -= uClothSway.z * hem * hem;`,
      );
  };
  material.customProgramCacheKey = () => 'cloth-sway';
  material.needsUpdate = true;
}

function prepareMaterials(model: Object3D, sway: { value: Vector3 }): void {
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
      if (/Cloth/.test(m.name)) {
        m.side = 2;
        patchCloth(m, sway);
      }
      if (std.metalness !== undefined) std.metalness = 0;
      if (std.roughness !== undefined) {
        std.roughness = /Skin/.test(m.name) ? 0.55 : /Eyes/.test(m.name) ? 0.15 : /Hair/.test(m.name) ? 0.5 : 0.85;
      }
      m.needsUpdate = true;
    }
  });
}

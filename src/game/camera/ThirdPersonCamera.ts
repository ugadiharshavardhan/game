import { MathUtils, type PerspectiveCamera, Vector3 } from 'three';
import type { PlayerConfig } from '../config/playerConfig';
import type { Input } from '../core/Input';
import type { Physics } from '../core/Physics';
import { smoothDamp } from '../player/locomotion';
import type { Player } from '../player/Player';
import { PlayerStateId } from '../player/PlayerState';

/**
 * Over-the-shoulder follow camera: yaw/pitch from mouse/touch/stick, right-shoulder offset,
 * collision pull-in against level geometry, eased crouch framing and a run FOV push.
 */
export class ThirdPersonCamera {
  /** Horizontal heading; movement is relative to this. Forward = (sin yaw, 0, cos yaw). */
  yaw: number;
  /** Positive looks down onto the player. */
  pitch = MathUtils.degToRad(12);

  private height: number;
  private distance: number;
  private currentDistance: number;
  private readonly heightVel = { value: 0 };
  private readonly distVel = { value: 0 };
  private readonly fovVel = { value: 0 };
  private readonly pullVel = { value: 0 };
  private readonly pivot = new Vector3();
  private readonly shoulder = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly toShoulder = new Vector3();
  private readonly back = new Vector3();

  private readonly camera: PerspectiveCamera;
  private readonly player: Player;

  private readonly input: Input;
  private readonly physics: Physics;

  private readonly config: PlayerConfig;

  constructor(
    camera: PerspectiveCamera,
    player: Player,
    input: Input,
    physics: Physics,
    config: PlayerConfig,
  ) {
    this.camera = camera;
    this.player = player;
    this.input = input;
    this.physics = physics;
    this.config = config;
    this.yaw = player.yaw;
    this.height = config.cameraHeight;
    this.distance = config.cameraDistance;
    this.currentDistance = config.cameraDistance;
    camera.fov = config.baseFov;
    camera.updateProjectionMatrix();
    this.update(1 / 60);
  }

  update(dt: number): void {
    const c = this.config;
    const state = this.player.state.value;

    if (state !== PlayerStateId.Hidden) {
      const sens = MathUtils.degToRad(this.input.touchLook ? c.touchSensitivity : c.mouseSensitivity);
      this.yaw -= this.input.look.x * sens;
      this.pitch += this.input.look.y * sens;
      const stickRate = MathUtils.degToRad(180) * dt;
      this.yaw -= this.input.lookStick.x * stickRate;
      this.pitch += this.input.lookStick.y * stickRate;
      this.pitch = MathUtils.clamp(this.pitch, MathUtils.degToRad(c.pitchMinDeg), MathUtils.degToRad(c.pitchMaxDeg));
    }

    const crouched = this.player.controller.crouched;
    this.height = smoothDamp(this.height, crouched ? c.crouchCameraHeight : c.cameraHeight, this.heightVel, c.cameraBlendTime, dt);
    this.distance = smoothDamp(this.distance, crouched ? c.crouchCameraDistance : c.cameraDistance, this.distVel, c.cameraBlendTime, dt);
    const fov = c.baseFov + (state === PlayerStateId.Running ? c.runFovBoost : 0);
    const newFov = smoothDamp(this.camera.fov, fov, this.fovVel, c.cameraBlendTime * 2, dt);
    if (Math.abs(newFov - this.camera.fov) > 1e-3) {
      this.camera.fov = newFov;
      this.camera.updateProjectionMatrix();
    }

    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.pivot.copy(this.player.feet).setY(this.player.feet.y + this.height);

    // Shoulder offset, pulled in if a wall sits beside the player.
    let side = c.shoulderOffset;
    const sideHit = this.physics.castRay(this.pivot, this.right, side + c.cameraCollisionRadius, this.player.controller.collider);
    if (sideHit !== null) side = Math.max(sideHit - c.cameraCollisionRadius, 0);
    this.shoulder.copy(this.pivot).addScaledVector(this.right, side);

    // Boom collision: snap in immediately, ease back out.
    this.back.copy(this.forward).negate();
    const hit = this.physics.castRay(this.shoulder, this.back, this.distance + c.cameraCollisionRadius, this.player.controller.collider);
    const allowed = hit === null ? this.distance : Math.max(hit - c.cameraCollisionRadius, 0.3);
    this.currentDistance =
      allowed < this.currentDistance ? allowed : smoothDamp(this.currentDistance, allowed, this.pullVel, 0.35, dt);

    this.camera.position.copy(this.shoulder).addScaledVector(this.back, this.currentDistance);
    this.toShoulder.copy(this.shoulder).addScaledVector(this.forward, 10);
    this.camera.lookAt(this.toShoulder);
  }
}

import type { Collider, KinematicCharacterController, RigidBody } from '@dimforge/rapier3d-compat';
import { MathUtils, Vector3 } from 'three';
import type { PlayerConfig } from '../config/playerConfig';
import type { Input } from '../core/Input';
import type { Physics } from '../core/Physics';
import { deriveLocomotionState, smoothDamp, smoothDampAngle, stepSpeed, targetSpeed } from './locomotion';
import type { PlayerState } from './PlayerState';

const UP = new Vector3(0, 1, 0);

/**
 * Camera-relative kinematic motor on Rapier's character controller:
 * eased speed, smoothed turning, gravity, slopes and steps, crouch with a ceiling check.
 */
export class PlayerController {
  /** World position of the feet (bottom of the capsule). */
  readonly feet = new Vector3();
  /** Facing yaw in radians; the model faces +Z at 0. */
  yaw = 0;
  planarSpeed = 0;
  grounded = false;
  crouched = false;
  height: number;
  private readonly body: RigidBody;
  readonly collider: Collider;
  private readonly kcc: KinematicCharacterController;
  private readonly moveDir = new Vector3(0, 0, 1);
  private readonly desired = new Vector3();
  private verticalSpeed = 0;
  private readonly turnVelocity = { value: 0 };
  private readonly heightVelocity = { value: 0 };

  private readonly physics: Physics;
  private readonly config: PlayerConfig;

  private readonly state: PlayerState;

  constructor(
    physics: Physics,
    config: PlayerConfig,
    state: PlayerState,
    spawn: Vector3,
    spawnYaw: number,
  ) {
    this.physics = physics;
    this.config = config;
    this.state = state;
    const { R, world } = physics;
    this.height = config.standHeight;
    this.yaw = spawnYaw;
    this.moveDir.set(Math.sin(spawnYaw), 0, Math.cos(spawnYaw));
    this.feet.copy(spawn);
    this.body = world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + this.height / 2 + 0.02, spawn.z),
    );
    this.collider = world.createCollider(R.ColliderDesc.capsule(this.halfSegment(this.height), config.radius), this.body);
    this.kcc = world.createCharacterController(0.02);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.enableAutostep(config.stepHeight, 0.15, false);
    this.kcc.enableSnapToGround(0.3);
    this.kcc.setMaxSlopeClimbAngle(MathUtils.degToRad(config.maxSlopeDegrees));
    this.kcc.setMinSlopeSlideAngle(MathUtils.degToRad(config.maxSlopeDegrees + 5));
    this.kcc.setApplyImpulsesToDynamicBodies(false);
  }

  /** @param cameraYaw the camera's horizontal heading; movement is relative to it. */
  update(dt: number, input: Input, cameraYaw: number): void {
    const c = this.config;
    if (input.crouchPressed && !this.state.isLocked) this.toggleCrouch();

    const locked = this.state.isLocked;
    const mx = locked ? 0 : input.move.x;
    const my = locked ? 0 : input.move.y;
    // Camera forward is (sin yaw, 0, cos yaw); screen-right is (-cos yaw, 0, sin yaw).
    const wishX = Math.sin(cameraYaw) * my - Math.cos(cameraYaw) * mx;
    const wishZ = Math.cos(cameraYaw) * my + Math.sin(cameraYaw) * mx;
    const magnitude = Math.min(Math.hypot(mx, my), 1);

    const target = targetSpeed(c, { magnitude, run: input.run, slow: input.slow, crouched: this.crouched });
    const control = this.grounded ? 1 : c.airControl;
    this.planarSpeed = stepSpeed(this.planarSpeed, target, c.acceleration * control, c.deceleration * control, dt);

    if (wishX * wishX + wishZ * wishZ > 1e-4) {
      this.moveDir.set(wishX, 0, wishZ).normalize();
      const smooth = this.planarSpeed > c.walkSpeed * 1.1 ? c.runTurnSmoothTime : c.turnSmoothTime;
      this.yaw = smoothDampAngle(this.yaw, Math.atan2(this.moveDir.x, this.moveDir.z), this.turnVelocity, smooth, dt);
    }

    this.verticalSpeed = this.grounded ? -1 : Math.max(this.verticalSpeed + c.gravity * dt, c.maxFallSpeed);
    this.desired.copy(this.moveDir).multiplyScalar(this.planarSpeed * dt).addScaledVector(UP, this.verticalSpeed * dt);

    this.updateHeight(dt);
    this.kcc.computeColliderMovement(this.collider, this.desired, this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS);
    const moved = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded();

    // Walking into a wall should not look like running on the spot.
    if (dt > 0 && this.planarSpeed > 0.01) {
      const achieved = Math.hypot(moved.x, moved.z) / dt;
      this.planarSpeed = Math.min(this.planarSpeed, achieved + 0.5);
    }

    const t = this.body.translation();
    const next = { x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z };
    this.body.setNextKinematicTranslation(next);
    this.feet.set(next.x, next.y - this.height / 2, next.z);

    this.state.updateLocomotion(deriveLocomotionState(c, this.planarSpeed, this.crouched));
  }

  /** Turn toward a world point while movement is locked (e.g. facing an interactable). */
  faceTowards(point: Vector3, dt: number): void {
    const dx = point.x - this.feet.x;
    const dz = point.z - this.feet.z;
    if (dx * dx + dz * dz < 1e-4) return;
    this.yaw = smoothDampAngle(this.yaw, Math.atan2(dx, dz), this.turnVelocity, this.config.faceTargetTime, dt);
    this.moveDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Instantly place the player (e.g. at a door). */
  teleport(feet: Vector3, yaw: number): void {
    this.body.setTranslation({ x: feet.x, y: feet.y + this.height / 2 + 0.02, z: feet.z }, true);
    this.feet.copy(feet);
    this.yaw = yaw;
    this.moveDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.planarSpeed = 0;
  }

  private toggleCrouch(): void {
    if (!this.crouched) this.crouched = true;
    else if (this.canStand()) this.crouched = false;
  }

  private canStand(): boolean {
    const c = this.config;
    const clearance = c.standHeight - this.height + 0.05;
    const top = this.feet.clone().setY(this.feet.y + this.height - 0.02);
    // Centre and four points around the capsule rim: a thin beam must not slip between rays.
    const offsets = [
      [0, 0],
      [c.radius * 0.8, 0],
      [-c.radius * 0.8, 0],
      [0, c.radius * 0.8],
      [0, -c.radius * 0.8],
    ];
    return offsets.every(
      ([ox, oz]) =>
        this.physics.castRay(top.clone().add(new Vector3(ox, 0, oz)), UP, clearance, this.collider) === null,
    );
  }

  private updateHeight(dt: number): void {
    const c = this.config;
    const targetHeight = this.crouched ? c.crouchHeight : c.standHeight;
    if (Math.abs(targetHeight - this.height) < 1e-3) return;
    const newHeight = smoothDamp(this.height, targetHeight, this.heightVelocity, c.crouchTransitionTime, dt);
    this.collider.setHalfHeight(this.halfSegment(newHeight));
    // Keep the feet where they are while the capsule changes length.
    const t = this.body.translation();
    this.body.setTranslation({ x: t.x, y: t.y + (newHeight - this.height) / 2, z: t.z }, true);
    this.height = newHeight;
  }

  private halfSegment(height: number): number {
    return Math.max(height / 2 - this.config.radius, 0.01);
  }
}

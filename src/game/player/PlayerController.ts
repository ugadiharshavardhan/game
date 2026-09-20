import type { Collider, KinematicCharacterController, RigidBody } from '@dimforge/rapier3d-compat';
import { MathUtils, Vector3 } from 'three';
import type { PlayerConfig } from '../config/playerConfig';
import type { Input } from '../core/Input';
import { groups, Layer, PLAYER_QUERY, type Physics } from '../core/Physics';
import { deriveLocomotionState, shouldJump, smoothDamp, smoothDampAngle, stepSpeed, targetSpeed } from './locomotion';
import type { PlayerState } from './PlayerState';

const UP = new Vector3(0, 1, 0);

/**
 * Camera-relative kinematic motor on Rapier's character controller:
 * eased speed, smoothed turning, gravity, slopes and steps, crouch with a ceiling check, and a
 * jump with the two forgivenesses that make one feel obedient (see `shouldJump`).
 *
 * The jump has to argue with two of the character controller's own conveniences. Snap-to-ground
 * pulls the capsule back down the instant it leaves the floor, and `computedGrounded` still
 * reports ground for a frame or two inside its margin — so a launch turns snapping off while it
 * is climbing, and ignores `grounded` until the ground is genuinely behind it.
 */
export class PlayerController {
  /** World position of the feet (bottom of the capsule). */
  readonly feet = new Vector3();
  /** Facing yaw in radians; the model faces +Z at 0. */
  yaw = 0;
  planarSpeed = 0;
  grounded = false;
  /** Feet off the ground: the animation blends to the airborne pose and locomotion reads Jumping. */
  airborne = false;
  crouched = false;
  height: number;
  private readonly body: RigidBody;
  readonly collider: Collider;
  private readonly kcc: KinematicCharacterController;
  private readonly moveDir = new Vector3(0, 0, 1);
  private readonly desired = new Vector3();
  private verticalSpeed = 0;
  /** Seconds since the feet last had something under them; 0 while standing. */
  private sinceGrounded = 0;
  /** Seconds since jump was last pressed; Infinity until it is. */
  private sincePressed = Infinity;
  /** Seconds left of ignoring the controller's ground report after a launch. */
  private launchLock = 0;
  /** Starts false so the constructor's `setSnapping(true)` actually reaches the controller. */
  private snapping = false;
  private readonly turnVelocity = { value: 0 };
  /** A scripted walk toward a point (doorways): overrides input until cleared. */
  private script: { x: number; z: number; speed: number } | null = null;
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
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(this.halfSegment(this.height), config.radius).setCollisionGroups(
        groups(Layer.Player, Layer.World | Layer.Blocker | Layer.Prop | Layer.Trigger),
      ),
      this.body,
    );
    this.kcc = world.createCharacterController(0.02);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.enableAutostep(config.stepHeight, 0.15, false);
    this.setSnapping(true);
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
    let wishX = Math.sin(cameraYaw) * my - Math.cos(cameraYaw) * mx;
    let wishZ = Math.cos(cameraYaw) * my + Math.sin(cameraYaw) * mx;
    const magnitude = Math.min(Math.hypot(mx, my), 1);

    let target = targetSpeed(c, { magnitude, run: input.run, slow: input.slow, crouched: this.crouched });
    let remaining = Infinity;
    if (this.script) {
      // Walk to the point, easing in over the last half metre; stand up first if crouched.
      if (this.crouched && this.canStand()) this.crouched = false;
      const dx = this.script.x - this.feet.x;
      const dz = this.script.z - this.feet.z;
      remaining = Math.hypot(dx, dz);
      wishX = remaining > 1e-3 ? dx / remaining : 0;
      wishZ = remaining > 1e-3 ? dz / remaining : 0;
      target = remaining < 0.02 ? 0 : this.script.speed * Math.min(1, 0.35 + remaining / 0.5);
    }
    const control = this.grounded ? 1 : c.airControl;
    this.planarSpeed = stepSpeed(this.planarSpeed, target, c.acceleration * control, c.deceleration * control, dt);

    this.jump(dt, input, locked);

    if (wishX * wishX + wishZ * wishZ > 1e-4) {
      this.moveDir.set(wishX, 0, wishZ).normalize();
      const smooth = this.planarSpeed > c.walkSpeed * 1.1 ? c.runTurnSmoothTime : c.turnSmoothTime;
      this.yaw = smoothDampAngle(this.yaw, Math.atan2(this.moveDir.x, this.moveDir.z), this.turnVelocity, smooth, dt);
    }

    // A scripted walk never overshoots its point.
    const stride = Math.min(this.planarSpeed * dt, remaining);
    this.desired.copy(this.moveDir).multiplyScalar(stride).addScaledVector(UP, this.verticalSpeed * dt);

    this.updateHeight(dt);
    this.kcc.computeColliderMovement(
      this.collider,
      this.desired,
      this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS,
      PLAYER_QUERY,
    );
    const moved = this.kcc.computedMovement();
    // Right after a launch the floor is still inside the controller's margin; believe the jump.
    this.grounded = this.kcc.computedGrounded() && this.launchLock <= 0;
    // Steps and slopes drop the ground for a frame at a time; that is not a jump, and the
    // animation must not flicker to the airborne pose every time the player climbs a stair.
    this.airborne = !this.grounded && (this.verticalSpeed > 0.01 || this.sinceGrounded > c.coyoteTime);
    this.launchLock = Math.max(this.launchLock - dt, 0);
    if (this.grounded && this.verticalSpeed < 0) this.verticalSpeed = 0;

    // Walking into a wall should not look like running on the spot.
    if (dt > 0 && this.planarSpeed > 0.01) {
      const achieved = Math.hypot(moved.x, moved.z) / dt;
      this.planarSpeed = Math.min(this.planarSpeed, achieved + 0.5);
    }

    const t = this.body.translation();
    const next = { x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z };
    this.body.setNextKinematicTranslation(next);
    this.feet.set(next.x, next.y - this.height / 2, next.z);

    this.state.updateLocomotion(deriveLocomotionState(c, this.planarSpeed, this.crouched, this.airborne));
  }

  /**
   * Launch if asked and allowed, then carry the vertical speed for this frame.
   *
   * A crouched player stands up into the jump when there is headroom, and simply does not jump
   * when there is not — which is what you want under a veranda. A scripted walk (a doorway) and
   * every locked state ignore the button outright.
   */
  private jump(dt: number, input: Input, locked: boolean): void {
    const c = this.config;
    this.sinceGrounded = this.grounded ? 0 : this.sinceGrounded + dt;
    this.sincePressed = input.jumpPressed && !locked && !this.script ? 0 : this.sincePressed + dt;

    const wants = shouldJump(c, this.sinceGrounded, this.sincePressed);
    if (wants && !locked && !this.script && (!this.crouched || this.canStand())) {
      this.crouched = false;
      this.verticalSpeed = c.jumpSpeed;
      this.sincePressed = Infinity;
      this.sinceGrounded = Infinity;
      this.launchLock = 0.12;
      this.grounded = false;
      this.airborne = true;
    } else if (this.grounded && this.launchLock <= 0) {
      // Pressed gently into the floor: the controller needs a downward push to stay snapped.
      this.verticalSpeed = -1;
    } else {
      this.verticalSpeed = Math.max(this.verticalSpeed + c.gravity * dt, c.maxFallSpeed);
    }
    // Snapping would haul the capsule straight back down out of a jump.
    this.setSnapping(this.verticalSpeed <= 0 && this.launchLock <= 0);
  }

  private setSnapping(on: boolean): void {
    if (on === this.snapping) return;
    this.snapping = on;
    if (on) this.kcc.enableSnapToGround(0.3);
    else this.kcc.disableSnapToGround();
  }

  /** Turn toward a world point while movement is locked (e.g. facing an interactable). */
  faceTowards(point: Vector3, dt: number): void {
    const dx = point.x - this.feet.x;
    const dz = point.z - this.feet.z;
    if (dx * dx + dz * dz < 1e-4) return;
    this.yaw = smoothDampAngle(this.yaw, Math.atan2(dx, dz), this.turnVelocity, this.config.faceTargetTime, dt);
    this.moveDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Walk to (x, z) at `speed`, ignoring input, until `stopWalking`. Facing follows the path. */
  walkTowards(x: number, z: number, speed: number): void {
    this.script = { x, z, speed };
  }

  stopWalking(): void {
    this.script = null;
  }

  /** Horizontal distance left on the scripted walk (0 when there is none). */
  get walkRemaining(): number {
    return this.script ? Math.hypot(this.script.x - this.feet.x, this.script.z - this.feet.z) : 0;
  }

  /** Instantly place the player (e.g. at a door). */
  teleport(feet: Vector3, yaw: number): void {
    this.body.setTranslation({ x: feet.x, y: feet.y + this.height / 2 + 0.02, z: feet.z }, true);
    this.feet.copy(feet);
    this.yaw = yaw;
    this.moveDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.planarSpeed = 0;
    this.verticalSpeed = 0;
    this.launchLock = 0;
    this.sincePressed = Infinity;
    this.airborne = false;
    this.setSnapping(true);
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

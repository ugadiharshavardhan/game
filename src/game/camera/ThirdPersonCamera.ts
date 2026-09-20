import type { Collider } from '@dimforge/rapier3d-compat';
import { type PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { CAMERA_QUERY, type Physics } from '../core/Physics';
import { smoothDamp, smoothDampAngle } from '../player/locomotion';
import type { CameraConfig } from './CameraConfig';
import {
  clamp,
  computeFraming,
  fovForAspect,
  type GaitWeights,
  playerFade,
  resolveBoom,
  stickCurve,
  stickRamp,
  wrapAngle,
} from './cameraMath';

const DEG = Math.PI / 180;

/** What the camera needs from the thing it follows. Implemented by Player. */
export interface CameraTarget {
  /** World position of the feet. */
  readonly feet: Vector3;
  /** Facing heading, radians; forward = (sin yaw, 0, cos yaw). */
  readonly yaw: number;
  /** Current capsule height — the middle of it is guaranteed free space. */
  readonly bodyHeight: number;
  readonly planarSpeed: number;
  readonly gait: 'normal' | 'run' | 'sneak';
  readonly collider: Collider;
  setCameraFade(alpha: number): void;
}

/** What the camera reads from input each frame. Implemented by Input. */
export interface CameraInput {
  readonly look: { x: number; y: number };
  readonly lookStick: { x: number; y: number };
  readonly touchLook: boolean;
  readonly zoomNotches: number;
  readonly pinchPixels: number;
  readonly padZoom: number;
  readonly lookSource: 'mouse' | 'touch' | 'stick' | null;
  readonly recenterPressed: boolean;
}

/**
 * A fixed camera placement the rig hands over to — a house interior. The camera sits at
 * `position` and keeps the player framed (feet + `lookHeight`).
 */
export interface CameraShot {
  position: Vector3;
  lookHeight: number;
  fov: number;
}

export interface CameraUserSettings {
  /** Multiplier on every look sensitivity, 0.25..3. */
  sensitivity: number;
  invertY: boolean;
}

/**
 * Third-person follow camera with collision — the Cinemachine "Third Person Follow + Deoccluder +
 * FreeLook" feel, on Three.js and Rapier.
 *
 * Per frame:
 *   1. rotation     mouse / touch / right stick → target yaw & pitch, lightly damped
 *   2. recentering  optionally swing back behind a moving player (controller & touch)
 *   3. framing      zoom × pitch curve + run / sneak offsets → boom length, pivot height, FOV
 *   4. follow       damped follow point (separate XZ and Y damping, capped lag)
 *   5. collision    three sphere sweeps: body → pivot → shoulder → camera. Each starts where the
 *                   last one safely stopped, and the first starts inside the player's capsule, so
 *                   the camera can never begin a sweep inside a wall.
 *   6. boom         pulls in instantly, eases back out, never longer than the collision allows
 */
export class ThirdPersonCamera {
  /** Current heading. Movement is camera-relative, so the player reads this. */
  yaw: number;
  pitch: number;

  /** Diagnostics for tests and the dev overlay. */
  readonly stats = { desired: 0, allowed: 0, boom: 0, pivotClipped: false, shoulderClipped: false, safetyFixes: 0 };

  private targetYaw: number;
  private targetPitch: number;
  private readonly yawVel = { value: 0 };
  private readonly pitchVel = { value: 0 };
  private readonly recenterVel = { value: 0 };
  private readonly recenterPitchVel = { value: 0 };
  private zoomTarget: number;
  private zoomCurrent: number;
  private readonly zoomVel = { value: 0 };
  private readonly gait: GaitWeights = { run: 0, sneak: 0 };
  private readonly runVel = { value: 0 };
  private readonly sneakVel = { value: 0 };
  private boom = 0;
  private readonly boomVel = { value: 0 };
  private side = 0;
  private readonly sideVel = { value: 0 };
  private readonly follow = new Vector3();
  private readonly followVel = { x: { value: 0 }, y: { value: 0 }, z: { value: 0 } };
  private lookIdle = 0;
  private stickHeld = 0;
  private manualRecenter = false;
  private settings: CameraUserSettings = { sensitivity: 1, invertY: false };

  private readonly base = new Vector3();
  private readonly desiredPivot = new Vector3();
  private readonly pivot = new Vector3();
  private readonly shoulder = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly back = new Vector3();
  private readonly dir = new Vector3();
  private readonly aim = new Vector3();

  // Shots (interiors): the rig keeps running underneath; the camera blends between the two along
  // a path (rig → via… → shot), so a hand-over through a doorway never cuts through the wall.
  private shot: CameraShot | null = null;
  private shotWeight = 0;
  private shotTarget = 0;
  private shotBlendTime = 1;
  private shotVia: Vector3[] = [];
  private readonly shotLook = new Vector3();
  private readonly shotLookVel = { x: { value: 0 }, y: { value: 0 }, z: { value: 0 } };
  /** The handheld drift: a few centimetres, always moving, never noticed. */
  private swayTime = Math.random() * 100;
  private readonly sway = new Vector3();
  private readonly rigPos = new Vector3();
  private readonly rigQuat = new Quaternion();
  private rigFov = 55;
  private readonly shotQuat = new Quaternion();
  private readonly path: Vector3[] = [];
  private readonly viewDir = new Vector3();

  private readonly camera: PerspectiveCamera;
  private readonly target: CameraTarget;
  private readonly input: CameraInput;
  private readonly physics: Physics;
  private readonly config: CameraConfig;

  constructor(camera: PerspectiveCamera, target: CameraTarget, input: CameraInput, physics: Physics, config: CameraConfig) {
    this.camera = camera;
    this.target = target;
    this.input = input;
    this.physics = physics;
    this.config = config;
    this.yaw = this.targetYaw = target.yaw;
    this.pitch = this.targetPitch = config.defaultPitchDeg * DEG;
    this.zoomTarget = this.zoomCurrent = config.distance;
    camera.near = config.nearPlane;
    camera.fov = config.fov;
    camera.updateProjectionMatrix();
    this.snap();
  }

  setUserSettings(settings: CameraUserSettings): void {
    this.settings = { sensitivity: clamp(settings.sensitivity, 0.25, 3), invertY: settings.invertY };
  }

  /**
   * Aim the camera (radians). With `immediate` it cuts; otherwise the usual rotation damping
   * carries it there. Pitch is clamped to the configured limits.
   */
  setOrientation(yaw: number, pitch: number, immediate = false): void {
    const c = this.config;
    this.targetYaw = this.yaw + wrapAngle(yaw - this.yaw);
    this.targetPitch = clamp(pitch, c.pitchMinDeg * DEG, c.pitchMaxDeg * DEG);
    this.manualRecenter = false;
    if (immediate) {
      this.yaw = this.targetYaw;
      this.pitch = this.targetPitch;
      this.yawVel.value = this.pitchVel.value = 0;
    }
  }

  /**
   * Hand the view to a fixed shot (or back to the rig with `null`), blending over `seconds` along
   * rig → `via` → shot. The via points must form a clear path (a doorway's axis).
   */
  setShot(shot: CameraShot | null, seconds: number, via: readonly Vector3[] = []): void {
    if (shot) {
      this.shot = shot;
      this.shotLook.set(this.target.feet.x, this.target.feet.y + shot.lookHeight, this.target.feet.z);
      for (const v of Object.values(this.shotLookVel)) v.value = 0;
    }
    this.shotTarget = shot ? 1 : 0;
    this.shotBlendTime = Math.max(seconds, 1e-3);
    this.shotVia = via.map((v) => v.clone());
  }

  /** 0 = following, 1 = in a shot; in between while blending. */
  get shotBlend(): number {
    return this.shotWeight;
  }

  /** The heading the player actually sees along — movement is relative to this. */
  get viewYaw(): number {
    if (this.shotWeight <= 0) return this.yaw;
    this.camera.getWorldDirection(this.viewDir);
    return Math.atan2(this.viewDir.x, this.viewDir.z);
  }

  /** Place the camera without any smoothing — spawn, teleport, respawn. */
  snap(): void {
    this.follow.copy(this.target.feet);
    for (const v of Object.values(this.followVel)) v.value = 0;
    this.yaw = this.targetYaw;
    this.pitch = this.targetPitch;
    this.gait.run = this.target.gait === 'run' ? 1 : 0;
    this.gait.sneak = this.target.gait === 'sneak' ? 1 : 0;
    this.boom = Number.POSITIVE_INFINITY;
    this.side = this.config.shoulderOffset;
    this.place(0);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.rotate(dt);
    this.zoom(dt);
    this.blendGait(dt);
    this.followTarget(dt);
    this.place(dt);
    this.breathe(dt);
    this.applyShot(dt);
  }

  /**
   * A camera held by a person rather than bolted to a pole: a few centimetres of drift, a little
   * more of it when running, and none of it during a held shot. Small enough that it is felt and
   * not seen — the amplitude is under two centimetres at a walk.
   */
  private breathe(dt: number): void {
    this.swayTime += dt;
    const t = this.swayTime;
    const amount = 0.012 + 0.03 * this.gait.run;
    this.sway.set(
      Math.sin(t * 0.9) * amount + Math.sin(t * 2.3) * amount * 0.35,
      Math.sin(t * 1.27 + 1.1) * amount * 0.8,
      Math.cos(t * 0.73 + 0.4) * amount * 0.5,
    );
    this.camera.position.add(this.sway);
    this.camera.updateMatrixWorld();
  }

  // ---- shots -----------------------------------------------------------------------------------

  private applyShot(dt: number): void {
    const step = dt / this.shotBlendTime;
    this.shotWeight = this.shotTarget > this.shotWeight ? Math.min(this.shotWeight + step, 1) : Math.max(this.shotWeight - step, 0);
    if (this.shotWeight <= 0) {
      if (this.shotTarget === 0) this.shot = null;
      return;
    }
    const shot = this.shot;
    if (!shot) return;
    const w = this.shotWeight * this.shotWeight * (3 - 2 * this.shotWeight);

    // The rig's pose, as place() left it.
    this.rigPos.copy(this.camera.position);
    this.rigQuat.copy(this.camera.quaternion);
    this.rigFov = this.camera.fov;

    // The shot's pose: fixed position, eyes on the player (lightly damped so steps don't jitter).
    const f = this.target.feet;
    const v = this.shotLookVel;
    this.shotLook.x = smoothDamp(this.shotLook.x, f.x, v.x, 0.25, dt);
    this.shotLook.y = smoothDamp(this.shotLook.y, f.y + shot.lookHeight, v.y, 0.25, dt);
    this.shotLook.z = smoothDamp(this.shotLook.z, f.z, v.z, 0.25, dt);
    this.camera.position.copy(shot.position);
    this.camera.lookAt(this.shotLook);
    this.shotQuat.copy(this.camera.quaternion);

    // Along the path by arc length, so the doorway is crossed at an even pace.
    this.path.length = 0;
    this.path.push(this.rigPos, ...this.shotVia, shot.position);
    this.pointAlong(this.path, w, this.camera.position);
    this.camera.quaternion.copy(this.rigQuat).slerp(this.shotQuat, w);
    this.camera.fov = this.rigFov + (shot.fov - this.rigFov) * w;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.target.setCameraFade(playerFade(this.config, this.camera.position.distanceTo(this.pivot)));
  }

  private pointAlong(pts: readonly Vector3[], t: number, out: Vector3): void {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += pts[i].distanceTo(pts[i - 1]);
    let d = t * total;
    for (let i = 1; i < pts.length; i++) {
      const seg = pts[i].distanceTo(pts[i - 1]);
      if (d <= seg || i === pts.length - 1) {
        out.lerpVectors(pts[i - 1], pts[i], seg > 1e-6 ? Math.min(d / seg, 1) : 1);
        return;
      }
      d -= seg;
    }
    out.copy(pts[pts.length - 1]);
  }

  // ---- 1–2. rotation and recentering ---------------------------------------------------------

  private rotate(dt: number): void {
    const c = this.config;
    const i = this.input;
    const sens = this.settings.sensitivity;
    const invert = c.invertY !== this.settings.invertY ? -1 : 1;

    const perPixel = (i.touchLook ? c.touchSensitivity : c.mouseSensitivity) * DEG * sens;
    let dYaw = -i.look.x * perPixel;
    let dPitch = i.look.y * perPixel * invert;

    const stickMag = Math.hypot(i.lookStick.x, i.lookStick.y);
    this.stickHeld = stickMag > 0.9 ? this.stickHeld + dt : 0;
    if (stickMag > 0) {
      const s = stickCurve(i.lookStick.x, i.lookStick.y, c.stickResponseCurve);
      const ramp = stickRamp(this.stickHeld, c.stickRampTime) * sens * dt * DEG;
      dYaw -= s.x * c.stickYawSpeed * ramp;
      dPitch += s.y * c.stickPitchSpeed * ramp * invert;
    }

    const manualLook = dYaw !== 0 || dPitch !== 0;
    if (manualLook) {
      this.lookIdle = 0;
      this.manualRecenter = false;
    } else {
      this.lookIdle += dt;
    }
    if (i.recenterPressed) this.manualRecenter = true;

    this.targetYaw += dYaw;
    this.targetPitch = clamp(this.targetPitch + dPitch, c.pitchMinDeg * DEG, c.pitchMaxDeg * DEG);

    if (this.manualRecenter) {
      this.targetYaw = smoothDampAngle(this.targetYaw, this.target.yaw, this.recenterVel, c.manualRecenterTime, dt);
      this.targetPitch = smoothDamp(this.targetPitch, c.defaultPitchDeg * DEG, this.recenterPitchVel, c.manualRecenterTime, dt);
      if (Math.abs(wrapAngle(this.targetYaw - this.target.yaw)) < 0.5 * DEG) {
        this.targetYaw = this.targetYaw + wrapAngle(this.target.yaw - this.targetYaw); // land exactly
        this.manualRecenter = false;
      }
    } else if (this.shouldAutoRecenter()) {
      this.targetYaw = smoothDampAngle(this.targetYaw, this.target.yaw, this.recenterVel, c.recenterTime, dt);
      this.targetPitch = smoothDamp(this.targetPitch, c.defaultPitchDeg * DEG, this.recenterPitchVel, c.recenterTime * 1.5, dt);
    } else {
      this.recenterVel.value = 0;
      this.recenterPitchVel.value = 0;
    }

    if (c.rotationDamping > 0) {
      this.yaw = smoothDampAngle(this.yaw, this.targetYaw, this.yawVel, c.rotationDamping, dt);
      this.pitch = smoothDamp(this.pitch, this.targetPitch, this.pitchVel, c.rotationDamping, dt);
    } else {
      this.yaw = this.targetYaw;
      this.pitch = this.targetPitch;
    }
    // Keep both angles bounded without changing the gap between them.
    const wrapped = wrapAngle(this.yaw);
    this.targetYaw += wrapped - this.yaw;
    this.yaw = wrapped;
  }

  private shouldAutoRecenter(): boolean {
    const c = this.config;
    const source = this.input.lookSource;
    const allowed = c.recenterMode === 'always' || (c.recenterMode === 'controller' && source !== null && source !== 'mouse');
    if (!allowed || this.lookIdle < c.recenterDelay || this.target.planarSpeed < 0.5) return false;
    // Walking toward the camera: swinging round would spin the view, so leave it.
    return Math.abs(wrapAngle(this.target.yaw - this.targetYaw)) < 120 * DEG;
  }

  // ---- 3. framing ----------------------------------------------------------------------------

  private zoom(dt: number): void {
    const c = this.config;
    if (c.zoomEnabled) {
      const i = this.input;
      this.zoomTarget +=
        i.zoomNotches * c.zoomStep - i.pinchPixels * c.pinchZoomSensitivity + i.padZoom * c.padZoomSpeed * dt;
      this.zoomTarget = clamp(this.zoomTarget, c.zoomMin, c.zoomMax);
    }
    this.zoomCurrent = smoothDamp(this.zoomCurrent, this.zoomTarget, this.zoomVel, c.zoomDamping, dt);
  }

  private blendGait(dt: number): void {
    const t = this.config.gaitBlendTime;
    this.gait.run = clamp(smoothDamp(this.gait.run, this.target.gait === 'run' ? 1 : 0, this.runVel, t, dt), 0, 1);
    this.gait.sneak = clamp(smoothDamp(this.gait.sneak, this.target.gait === 'sneak' ? 1 : 0, this.sneakVel, t, dt), 0, 1);
  }

  // ---- 4. follow -----------------------------------------------------------------------------

  private followTarget(dt: number): void {
    const c = this.config;
    const feet = this.target.feet;
    // A teleport (door, respawn) should cut, not glide across the village.
    if (this.follow.distanceToSquared(feet) > 25) {
      this.follow.copy(feet);
      return;
    }
    const v = this.followVel;
    this.follow.x = smoothDamp(this.follow.x, feet.x, v.x, c.followDampingXZ, dt);
    this.follow.z = smoothDamp(this.follow.z, feet.z, v.z, c.followDampingXZ, dt);
    this.follow.y = smoothDamp(this.follow.y, feet.y, v.y, c.followDampingY, dt);
    const dx = this.follow.x - feet.x;
    const dz = this.follow.z - feet.z;
    const lag = Math.hypot(dx, dz);
    if (lag > c.maxFollowLag) {
      const k = c.maxFollowLag / lag;
      this.follow.x = feet.x + dx * k;
      this.follow.z = feet.z + dz * k;
    }
    this.follow.y = clamp(this.follow.y, feet.y - c.maxFollowLag, feet.y + c.maxFollowLag);
  }

  // ---- 5–6. collision and placement ------------------------------------------------------------

  private place(dt: number): void {
    const c = this.config;
    const framing = computeFraming(c, this.zoomCurrent, this.pitch, this.gait);

    const fov = fovForAspect(c, framing.fov, this.camera.aspect);
    if (Math.abs(fov - this.camera.fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.back.copy(this.forward).negate();

    // Body centre → pivot. The middle of the capsule is always free space: that is the anchor.
    const feet = this.target.feet;
    this.base.set(feet.x, feet.y + this.target.bodyHeight * 0.5, feet.z);
    this.desiredPivot.set(this.follow.x, this.follow.y + framing.height, this.follow.z);
    this.stats.pivotClipped = this.sweep(this.base, this.desiredPivot, this.pivot);

    // Pivot → shoulder, eased so hugging a wall doesn't make the view jump sideways.
    const sideAllowed = this.sweepLength(this.pivot, this.right, c.shoulderOffset);
    this.stats.shoulderClipped = sideAllowed < c.shoulderOffset - 1e-3;
    this.side = dt > 0
      ? resolveBoom(this.side, sideAllowed, this.sideVel, 0, c.collisionRecoverTime, dt, smoothDamp)
      : sideAllowed;
    this.shoulder.copy(this.pivot).addScaledVector(this.right, this.side);

    // Shoulder → camera.
    const allowed = this.sweepLength(this.shoulder, this.back, framing.distance);
    this.boom = dt > 0
      ? resolveBoom(this.boom, allowed, this.boomVel, c.collisionPullInTime, c.collisionRecoverTime, dt, smoothDamp)
      : allowed;
    this.camera.position.copy(this.shoulder).addScaledVector(this.back, this.boom);

    // Belt and braces: a final overlap test. Should never fire; counted so tests can prove it.
    if (this.physics.overlapsSphere(this.camera.position, c.collisionRadius * 0.9, CAMERA_QUERY)) {
      this.stats.safetyFixes++;
      this.boom = 0;
      this.camera.position.copy(this.shoulder);
    }

    this.aim.copy(this.camera.position).add(this.forward);
    this.camera.lookAt(this.aim);

    this.stats.desired = framing.distance;
    this.stats.allowed = allowed;
    this.stats.boom = this.boom;
    this.target.setCameraFade(playerFade(c, this.camera.position.distanceTo(this.pivot)));
  }

  /** How far a camera sphere can travel from `from` along unit `dir`, up to `max`. */
  private sweepLength(from: Vector3, dir: Vector3, max: number): number {
    const c = this.config;
    const hit = this.physics.castSphere(from, dir, max + c.collisionSkin, c.collisionRadius, CAMERA_QUERY);
    return hit === null ? max : Math.max(Math.min(hit - c.collisionSkin, max), 0);
  }

  /** Moves a sphere from `from` toward `to`, writing where it safely stops. Returns true if it was stopped short. */
  private sweep(from: Vector3, to: Vector3, out: Vector3): boolean {
    this.dir.subVectors(to, from);
    const len = this.dir.length();
    if (len < 1e-5) {
      out.copy(to);
      return false;
    }
    this.dir.divideScalar(len);
    const reach = this.sweepLength(from, this.dir, len);
    out.copy(from).addScaledVector(this.dir, reach);
    return reach < len - 1e-3;
  }
}

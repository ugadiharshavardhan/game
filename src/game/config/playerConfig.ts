/**
 * Every tunable number for the player: movement, capsule, animation, camera,
 * interaction and audio. One object, one place — components never hard-code feel.
 */
export interface PlayerConfig {
  // Speeds (m/s)
  slowWalkSpeed: number;
  walkSpeed: number;
  runSpeed: number;
  crouchSpeed: number;
  /** Below this planar speed the player counts as standing still. */
  idleThreshold: number;

  // Acceleration (m/s²)
  acceleration: number;
  deceleration: number;
  /** 0..1 fraction of acceleration available while airborne. */
  airControl: number;

  // Turning (seconds to face the move direction)
  turnSmoothTime: number;
  runTurnSmoothTime: number;
  faceTargetTime: number;

  // Gravity (m/s²)
  gravity: number;
  maxFallSpeed: number;

  // Capsule (m)
  standHeight: number;
  crouchHeight: number;
  radius: number;
  crouchTransitionTime: number;
  stepHeight: number;
  maxSlopeDegrees: number;

  // Animation
  /** Seconds for locomotion blend weights to settle. */
  blendTime: number;
  /** Cross-fade into and out of one-shot actions. */
  actionFadeTime: number;
  minMotionSpeed: number;
  maxMotionSpeed: number;

  // Camera
  shoulderOffset: number;
  cameraHeight: number;
  crouchCameraHeight: number;
  cameraDistance: number;
  crouchCameraDistance: number;
  pitchMinDeg: number;
  pitchMaxDeg: number;
  /** Degrees per pixel of mouse movement. */
  mouseSensitivity: number;
  /** Degrees per pixel of touch drag. */
  touchSensitivity: number;
  baseFov: number;
  runFovBoost: number;
  /** Seconds for camera framing changes (crouch, run FOV) to settle. */
  cameraBlendTime: number;
  cameraCollisionRadius: number;

  // Interaction
  interactRadius: number;
  interactMaxAngleDeg: number;

  // Audio
  footstepVolume: number;
  footstepPitchVariation: number;
  /** Foot bone height above the player's feet (m) that counts as ground contact. */
  footContactHeight: number;
  clothVolume: number;
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  slowWalkSpeed: 1.2,
  walkSpeed: 2.2,
  runSpeed: 5.0,
  crouchSpeed: 1.4,
  idleThreshold: 0.1,

  acceleration: 10,
  deceleration: 14,
  airControl: 0.3,

  turnSmoothTime: 0.1,
  runTurnSmoothTime: 0.16,
  faceTargetTime: 0.15,

  gravity: -20,
  maxFallSpeed: -30,

  standHeight: 1.62,
  crouchHeight: 1.05,
  radius: 0.28,
  crouchTransitionTime: 0.18,
  stepHeight: 0.3,
  maxSlopeDegrees: 45,

  blendTime: 0.12,
  actionFadeTime: 0.18,
  minMotionSpeed: 0.7,
  maxMotionSpeed: 1.35,

  shoulderOffset: 0.45,
  cameraHeight: 1.55,
  crouchCameraHeight: 1.1,
  cameraDistance: 3.2,
  crouchCameraDistance: 2.5,
  pitchMinDeg: -35,
  pitchMaxDeg: 60,
  mouseSensitivity: 0.12,
  touchSensitivity: 0.25,
  baseFov: 55,
  runFovBoost: 6,
  cameraBlendTime: 0.25,
  cameraCollisionRadius: 0.25,

  interactRadius: 1.8,
  interactMaxAngleDeg: 70,

  footstepVolume: 0.6,
  footstepPitchVariation: 0.08,
  footContactHeight: 0.09,
  clothVolume: 0.2,
};

/** Returns human-readable problems; an empty list means the config is usable. */
export function validatePlayerConfig(c: PlayerConfig): string[] {
  const errors: string[] = [];
  if ([c.slowWalkSpeed, c.walkSpeed, c.runSpeed, c.crouchSpeed].some((s) => s <= 0)) {
    errors.push('Speeds must be positive.');
  }
  if (!(c.slowWalkSpeed < c.walkSpeed && c.walkSpeed < c.runSpeed)) {
    errors.push('Speeds must increase: slow walk < walk < run.');
  }
  if (c.acceleration <= 0 || c.deceleration <= 0) errors.push('Acceleration must be positive.');
  if (c.gravity >= 0) errors.push('Gravity must be negative.');
  if (c.crouchHeight >= c.standHeight) errors.push('Crouch height must be below stand height.');
  if (c.radius * 2 > c.crouchHeight) errors.push('Capsule radius too large for crouch height.');
  if (c.pitchMinDeg >= c.pitchMaxDeg) errors.push('Pitch min must be below pitch max.');
  if (c.minMotionSpeed <= 0 || c.minMotionSpeed > c.maxMotionSpeed) {
    errors.push('Motion speed clamp is invalid.');
  }
  return errors;
}

/**
 * Every tunable number for the player: movement, capsule, animation, interaction and
 * audio. Camera values live in camera/CameraConfig.ts. One object, one place — components never hard-code feel.
 */
export interface PlayerConfig {
  // Speeds (m/s)
  slowWalkSpeed: number;
  walkSpeed: number;
  /** Between a walk and a run: the pace of someone who has somewhere to be. */
  fastWalkSpeed: number;
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
  /**
   * Turning costs speed: at a right angle or more, the player keeps this fraction of it. Running
   * into a 180° turn becomes a wide, decelerating arc instead of a pivot on the spot.
   */
  turnSlowdown: number;
  /** Beyond this much of a turn while standing still, the character takes a step round. */
  turnInPlaceDeg: number;

  // Gravity (m/s²)
  gravity: number;
  maxFallSpeed: number;

  // Jump
  /** Upward speed at the moment of a jump (m/s). */
  jumpSpeed: number;
  /**
   * Grace after walking off an edge in which a jump still counts — the difference between a
   * character that feels responsive and one that feels like it is arguing with you.
   */
  coyoteTime: number;
  /** A jump pressed this long before landing still fires on touchdown. */
  jumpBufferTime: number;

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
  /** Roughly this often, a player standing still shifts their weight and looks about. */
  idleVariationSeconds: number;
  /** Cross-fade into and out of one-shot actions. */
  actionFadeTime: number;
  minMotionSpeed: number;
  maxMotionSpeed: number;


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
  fastWalkSpeed: 3.0,
  runSpeed: 4.0,
  crouchSpeed: 1.4,
  idleThreshold: 0.1,

  acceleration: 10,
  deceleration: 14,
  airControl: 0.3,

  turnSmoothTime: 0.1,
  runTurnSmoothTime: 0.16,
  faceTargetTime: 0.15,
  turnSlowdown: 0.45,
  turnInPlaceDeg: 95,

  gravity: -20,
  maxFallSpeed: -30,

  // 5 m/s against -20 m/s² is an apex of about 0.62 m: the temple steps and the plinths, and
  // nothing the village was built to keep you out of.
  jumpSpeed: 5,
  coyoteTime: 0.12,
  jumpBufferTime: 0.12,

  standHeight: 1.62,
  crouchHeight: 1.05,
  radius: 0.28,
  crouchTransitionTime: 0.18,
  stepHeight: 0.3,
  maxSlopeDegrees: 45,

  blendTime: 0.12,
  idleVariationSeconds: 14,
  actionFadeTime: 0.18,
  minMotionSpeed: 0.7,
  maxMotionSpeed: 1.35,


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
  if (!(c.slowWalkSpeed < c.walkSpeed && c.walkSpeed < c.fastWalkSpeed && c.fastWalkSpeed < c.runSpeed)) {
    errors.push('Speeds must increase: slow walk < walk < fast walk < run.');
  }
  if (c.turnSlowdown <= 0 || c.turnSlowdown > 1) errors.push('Turn slowdown must be a fraction of speed kept (0–1].');
  if (c.acceleration <= 0 || c.deceleration <= 0) errors.push('Acceleration must be positive.');
  if (c.gravity >= 0) errors.push('Gravity must be negative.');
  if (c.jumpSpeed <= 0) errors.push('Jump speed must be positive.');
  if (c.coyoteTime < 0 || c.jumpBufferTime < 0) errors.push('Jump timings cannot be negative.');
  if (c.crouchHeight >= c.standHeight) errors.push('Crouch height must be below stand height.');
  if (c.radius * 2 > c.crouchHeight) errors.push('Capsule radius too large for crouch height.');
  if (c.minMotionSpeed <= 0 || c.minMotionSpeed > c.maxMotionSpeed) {
    errors.push('Motion speed clamp is invalid.');
  }
  return errors;
}

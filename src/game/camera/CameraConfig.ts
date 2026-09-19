/**
 * Every tunable camera value. One object, one place — ThirdPersonCamera hard-codes no feel.
 *
 * Cinemachine vocabulary, for anyone coming from Unity:
 *   followDamping*       ≈ Body › Damping
 *   distance / pivotHeight / shoulderOffset ≈ Third Person Follow › Camera Distance / Shoulder Offset
 *   low/highAngleDistanceScale ≈ FreeLook's bottom / top rig radii
 *   collision*           ≈ Cinemachine Deoccluder (Pull Camera Forward, damping when occluded)
 *   recenter*            ≈ Recentering (wait time / recentering time)
 */

/** Offsets blended in while a gait is active. */
export interface GaitFraming {
  /** Metres added to the boom length. */
  distanceOffset: number;
  /** Metres added to the pivot height. */
  heightOffset: number;
  /** Degrees added to the vertical field of view. */
  fovOffset: number;
}

export type RecenterMode = 'off' | 'controller' | 'always';

export interface CameraConfig {
  // ---- Framing ------------------------------------------------------------------------------
  /** Vertical field of view, degrees. */
  fov: number;
  /**
   * Narrow (portrait) screens widen the vertical FOV until at least this much is visible
   * horizontally — otherwise a phone held upright shows little but the player's back.
   */
  minHorizontalFov: number;
  /** Hard cap on the vertical FOV after that widening (and the run push), degrees. */
  maxFov: number;
  /** Look pivot above the player's feet, metres. Roughly eye height. */
  pivotHeight: number;
  /** Default boom length behind the pivot, metres. */
  distance: number;
  /** Sideways offset of the boom to the right, metres. 0 centres the player. */
  shoulderOffset: number;
  /** Starting pitch: positive means the camera sits above, looking down. */
  defaultPitchDeg: number;
  pitchMinDeg: number;
  pitchMaxDeg: number;
  /** Boom length multiplier at pitchMin (looking up from low). <1 keeps the camera off the ground. */
  lowAngleDistanceScale: number;
  /** Boom length multiplier at pitchMax (looking down from high). >1 shows more of the street. */
  highAngleDistanceScale: number;
  /** Camera near plane, metres. Must fit inside the collision sphere. */
  nearPlane: number;

  // ---- Follow -------------------------------------------------------------------------------
  /** Seconds for the camera to catch up horizontally. */
  followDampingXZ: number;
  /** Seconds to catch up vertically — larger values swallow step-ups and small drops. */
  followDampingY: number;
  /** The camera never trails the player by more than this, metres. */
  maxFollowLag: number;

  // ---- Rotation -----------------------------------------------------------------------------
  /** Degrees per pixel of mouse movement (pointer locked). */
  mouseSensitivity: number;
  /** Degrees per pixel of touch drag. */
  touchSensitivity: number;
  /** Degrees per second of yaw at full right-stick deflection. */
  stickYawSpeed: number;
  /** Degrees per second of pitch at full right-stick deflection. */
  stickPitchSpeed: number;
  /** Stick response exponent: 1 = linear, 2 = precise near centre. */
  stickResponseCurve: number;
  /** Seconds for a held full-deflection turn to ramp from 60% to full speed. 0 = no ramp. */
  stickRampTime: number;
  invertY: boolean;
  /** Seconds of smoothing on yaw/pitch. 0 = raw input. Keep small: mouse aim must feel direct. */
  rotationDamping: number;

  // ---- Zoom ---------------------------------------------------------------------------------
  zoomEnabled: boolean;
  /** Closest boom length the player can zoom to, metres. */
  zoomMin: number;
  /** Furthest boom length the player can zoom to, metres. */
  zoomMax: number;
  /** Metres per mouse-wheel notch. */
  zoomStep: number;
  /** Metres per pixel of pinch. */
  pinchZoomSensitivity: number;
  /** Metres per second while a controller zoom button is held. */
  padZoomSpeed: number;
  /** Seconds for zoom to settle. */
  zoomDamping: number;

  // ---- Gait framing -------------------------------------------------------------------------
  run: GaitFraming;
  sneak: GaitFraming;
  /** Seconds for gait framing to blend in and out. */
  gaitBlendTime: number;

  // ---- Recentering --------------------------------------------------------------------------
  /**
   * Swing the camera back behind a moving player after a pause in look input. 'controller'
   * applies it to stick and touch only — mouse players expect the camera to stay put.
   */
  recenterMode: RecenterMode;
  /** Seconds without look input before recentering starts. */
  recenterDelay: number;
  /** Seconds the recentering swing takes. */
  recenterTime: number;
  /** Seconds the manual recenter (R3) takes. */
  manualRecenterTime: number;

  // ---- Collision ----------------------------------------------------------------------------
  /** Radius of the sphere swept along the boom, metres. */
  collisionRadius: number;
  /** Gap kept between the camera sphere and whatever it hit, metres. */
  collisionSkin: number;
  /** Seconds to pull in when something gets between camera and player. 0 = instant (recommended: never shows a wall). */
  collisionPullInTime: number;
  /** Seconds to ease back out once the obstruction clears. */
  collisionRecoverTime: number;
  /** Start fading the player out when the camera is this close to the pivot, metres. */
  playerFadeStart: number;
  /** Player fully hidden at this distance, metres. */
  playerFadeEnd: number;
}

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  fov: 55,
  minHorizontalFov: 42,
  maxFov: 80,
  pivotHeight: 1.5,
  distance: 3.4,
  shoulderOffset: 0.35,
  defaultPitchDeg: 10,
  pitchMinDeg: -30,
  pitchMaxDeg: 65,
  lowAngleDistanceScale: 0.6,
  highAngleDistanceScale: 1.15,
  nearPlane: 0.08,

  followDampingXZ: 0.08,
  followDampingY: 0.2,
  maxFollowLag: 0.9,

  mouseSensitivity: 0.1,
  touchSensitivity: 0.22,
  stickYawSpeed: 190,
  stickPitchSpeed: 115,
  stickResponseCurve: 1.8,
  stickRampTime: 0.3,
  invertY: false,
  rotationDamping: 0.035,

  zoomEnabled: true,
  zoomMin: 1.8,
  zoomMax: 5.5,
  zoomStep: 0.45,
  pinchZoomSensitivity: 0.012,
  padZoomSpeed: 3,
  zoomDamping: 0.18,

  run: { distanceOffset: 0.45, heightOffset: 0.05, fovOffset: 5 },
  sneak: { distanceOffset: -0.65, heightOffset: -0.42, fovOffset: -2 },
  gaitBlendTime: 0.35,

  recenterMode: 'controller',
  recenterDelay: 1.6,
  recenterTime: 1.1,
  manualRecenterTime: 0.22,

  collisionRadius: 0.2,
  collisionSkin: 0.03,
  collisionPullInTime: 0,
  collisionRecoverTime: 0.4,
  playerFadeStart: 0.75,
  playerFadeEnd: 0.4,
};

/** Returns human-readable problems; an empty list means the config is usable. */
export function validateCameraConfig(c: CameraConfig): string[] {
  const errors: string[] = [];
  if (!(c.fov > 20 && c.fov < 110)) errors.push('FOV must be between 20 and 110 degrees.');
  if (c.fov + c.run.fovOffset >= 110 || c.fov + c.sneak.fovOffset <= 20) errors.push('Gait FOV offsets push FOV out of range.');
  if (c.minHorizontalFov < 20 || c.minHorizontalFov > 100) errors.push('Minimum horizontal FOV must be between 20 and 100 degrees.');
  if (c.maxFov < c.fov + c.run.fovOffset || c.maxFov > 110) errors.push('Max FOV must allow the run push and stay under 110 degrees.');
  if (c.pitchMinDeg >= c.pitchMaxDeg) errors.push('Pitch min must be below pitch max.');
  if (c.pitchMinDeg < -89 || c.pitchMaxDeg > 89) errors.push('Pitch limits must stay inside ±89° (gimbal flip).');
  if (c.defaultPitchDeg < c.pitchMinDeg || c.defaultPitchDeg > c.pitchMaxDeg) errors.push('Default pitch is outside the pitch limits.');
  if (c.distance <= 0 || c.pivotHeight <= 0) errors.push('Distance and pivot height must be positive.');
  if (c.zoomMin <= 0 || c.zoomMin > c.zoomMax) errors.push('Zoom range is invalid.');
  if (c.distance < c.zoomMin || c.distance > c.zoomMax) errors.push('Default distance must sit inside the zoom range.');
  if (c.pivotHeight + c.sneak.heightOffset <= 0.3) errors.push('Sneak height offset puts the pivot at the ground.');
  if (c.zoomMin + c.sneak.distanceOffset <= 0.3) errors.push('Sneak distance offset can collapse the boom at minimum zoom.');
  if (c.lowAngleDistanceScale <= 0 || c.highAngleDistanceScale <= 0) errors.push('Angle distance scales must be positive.');
  if (c.collisionRadius <= 0) errors.push('Collision radius must be positive.');
  // The near plane's corners must sit inside the collision sphere, or walls clip at the screen edge.
  const halfV = Math.tan((c.maxFov * Math.PI) / 360) * c.nearPlane;
  const nearCorner = Math.hypot(c.nearPlane, halfV, halfV * (16 / 9));
  if (nearCorner >= c.collisionRadius) errors.push('Near plane is too far for the collision radius: walls will clip at the screen corners.');
  if (c.playerFadeEnd >= c.playerFadeStart) errors.push('Player fade end must be closer than fade start.');
  for (const [k, v] of Object.entries(c)) {
    if (typeof v === 'number' && k.match(/Damping|Time|Delay/) && v < 0) errors.push(`${k} must not be negative.`);
  }
  if (c.stickResponseCurve < 1) errors.push('Stick response curve must be ≥ 1.');
  return errors;
}

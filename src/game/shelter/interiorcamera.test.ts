/**
 * The interior camera, held on a player who is standing still, should not move.
 *
 * The shot is a fixed point in the corner of the room looking at the player. If the picture
 * shakes, one of three things is moving: the camera's position, the direction it looks, or the
 * thing it looks at. This puts the real controller, the real camera rig and a real shot inside
 * every shelter, does nothing at all, and measures all three every frame.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Vector2, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA_CONFIG } from '../camera/CameraConfig';
import { type CameraTarget, ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { DEFAULT_PLAYER_CONFIG } from '../config/playerConfig';
import type { Input } from '../core/Input';
import { Physics } from '../core/Physics';
import { PlayerController } from '../player/PlayerController';
import { PlayerState } from '../player/PlayerState';
import { buildColliders } from '../world/village/colliders';
import { VILLAGE } from '../world/village/layout';
import { buildLevel, type Level } from '../world/village/solids';
import { HouseInterior } from './HouseInterior';
import { DEFAULT_SHELTER_CONFIG } from './ShelterManager';

const DT = 1 / 60;

let level: Level;

beforeAll(async () => {
  await RAPIER.init();
  level = buildLevel(VILLAGE);
});

function rig(house: (typeof VILLAGE.houses)[number]) {
  const physics = new Physics(RAPIER);
  buildColliders(VILLAGE, level, physics);
  physics.step(DT);
  const interior = new HouseInterior(house);
  const controller = new PlayerController(physics, DEFAULT_PLAYER_CONFIG, new PlayerState(), interior.inside.clone(), interior.inwardYaw);
  const input = { move: new Vector2(), run: false, slow: false, crouchPressed: false, interactPressed: false, jumpPressed: false } as unknown as Input;

  const target: CameraTarget = {
    get feet() {
      return controller.feet;
    },
    get yaw() {
      return controller.yaw;
    },
    get bodyHeight() {
      return controller.height;
    },
    get planarSpeed() {
      return controller.planarSpeed;
    },
    get gait() {
      return 'normal' as const;
    },
    get collider() {
      return controller.collider;
    },
    setCameraFade() {},
  };
  const camera = new PerspectiveCamera(DEFAULT_CAMERA_CONFIG.fov, 16 / 9, DEFAULT_CAMERA_CONFIG.nearPlane, 500);
  const cam = new ThirdPersonCamera(camera, target, { look: new Vector2(), lookStick: new Vector2(), touchLook: false, zoomNotches: 0, pinchPixels: 0, padZoom: 0, lookSource: null, recenterPressed: false }, physics, DEFAULT_CAMERA_CONFIG);
  cam.snap();
  cam.setShot({ position: interior.cameraPoint, lookHeight: DEFAULT_SHELTER_CONFIG.lookHeight, fov: DEFAULT_SHELTER_CONFIG.interiorFov }, 0.35, []);
  return {
    interior,
    camera,
    controller,
    step() {
      controller.update(DT, input, cam.viewYaw);
      physics.step(DT);
      cam.update(DT);
    },
  };
}

const shelters = VILLAGE.houses.filter((h) => h.shelter);

describe('the interior shot on a player standing still', () => {
  it.each(shelters.map((h) => [h.id, h] as const))('%s: position, direction and target all hold', (id, house) => {
    const r = rig(house);
    // Long enough for the hand-over into the shot to finish and the damping to settle.
    for (let i = 0; i < 240; i++) r.step();

    let lastPos = r.camera.position.clone();
    let lastQuat = r.camera.quaternion.clone();
    let worstMove = 0;
    let worstTurn = 0;
    const dir = new Vector3();
    for (let i = 0; i < 300; i++) {
      r.step();
      worstMove = Math.max(worstMove, r.camera.position.distanceTo(lastPos));
      worstTurn = Math.max(worstTurn, r.camera.quaternion.angleTo(lastQuat));
      lastPos = r.camera.position.clone();
      lastQuat = r.camera.quaternion.clone();
    }
    r.camera.getWorldDirection(dir);

    expect(worstMove, `${id}: camera moved between frames (m)`).toBeLessThan(0.0005);
    // A hundredth of a degree a frame is invisible; a shake is many times that.
    expect(worstTurn * (180 / Math.PI), `${id}: camera turned between frames (deg)`).toBeLessThan(0.02);
  });
});

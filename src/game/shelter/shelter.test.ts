/**
 * Every shelter, entered and left for real: the real character controller walks through the real
 * doorway (door collider switched off and on), the camera hands over to the interior shot and back
 * — checked against every wall every frame — and the player is SAFE inside while the moon drains
 * nobody.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Vector2, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA_CONFIG as C } from '../camera/CameraConfig';
import { type CameraTarget, ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { DEFAULT_PLAYER_CONFIG } from '../config/playerConfig';
import type { Input } from '../core/Input';
import { CAMERA_QUERY, Physics } from '../core/Physics';
import { PuritySystem } from '../moon/PuritySystem';
import { PlayerController } from '../player/PlayerController';
import { PlayerState, PlayerStateId } from '../player/PlayerState';
import { buildColliders } from '../world/village/colliders';
import { PLINTH_H } from '../world/village/dims';
import { VILLAGE } from '../world/village/layout';
import { buildLevel } from '../world/village/solids';
import { SafeHouse } from './SafeHouse';
import { type ShelterActor, ShelterManager } from './ShelterManager';

const DT = 1 / 60;

beforeAll(async () => {
  await RAPIER.init();
});

function makeWorld() {
  const level = buildLevel(VILLAGE);
  const physics = new Physics(RAPIER);
  const colliders = buildColliders(VILLAGE, level, physics);
  physics.step(DT);
  const shelter = new ShelterManager();
  for (const h of VILLAGE.houses.filter((h) => h.shelter)) shelter.add(new SafeHouse(h, shelter, colliders.doorColliders.get(h.id) ?? null, null));

  const start = shelter.houses[0].interior.outside;
  const state = new PlayerState();
  const controller = new PlayerController(physics, DEFAULT_PLAYER_CONFIG, state, start, 0);
  const actor: ShelterActor = {
    get feet() {
      return controller.feet;
    },
    walkTowards: (x, z, speed) => controller.walkTowards(x, z, speed),
    stopWalking: () => controller.stopWalking(),
    get walkRemaining() {
      return controller.walkRemaining;
    },
    setScripted: (on) => state.setScripted(on),
    placeAt: (p, yaw) => controller.teleport(p, yaw),
  };
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
      return state.value === PlayerStateId.Running ? 'run' : 'normal';
    },
    collider: controller.collider,
    setCameraFade() {},
  };
  const camInput = { look: { x: 0, y: 0 }, lookStick: { x: 0, y: 0 }, touchLook: false, zoomNotches: 0, pinchPixels: 0, padZoom: 0, lookSource: null, recenterPressed: false };
  const camera = new PerspectiveCamera(C.fov, 16 / 9, C.nearPlane, 500);
  const cam = new ThirdPersonCamera(camera, target, camInput, physics, C);
  shelter.attach(actor, cam, () => true, () => {});
  const input = { move: new Vector2(), run: false, slow: false, crouchPressed: false, interactPressed: false };
  let frames = 0;

  /** One frame in the engine's order, then the camera must be clear of every wall. */
  const step = (label: string) => {
    shelter.update(DT);
    controller.update(DT, input as unknown as Input, cam.viewYaw);
    physics.step(DT);
    cam.update(DT);
    frames++;
    const p = camera.position;
    if (physics.overlapsSphere(p, C.collisionRadius * 0.9, CAMERA_QUERY)) {
      throw new Error(`${label}: camera inside geometry at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}), shot blend ${cam.shotBlend.toFixed(2)}`);
    }
    if (controller.feet.y < -0.1) throw new Error(`${label}: fell through the floor`);
  };
  const until = (done: () => boolean, label: string, max = 60 * 12) => {
    for (let i = 0; i < max; i++) {
      if (done()) return;
      step(label);
    }
    throw new Error(`${label}: timed out`);
  };
  return { physics, shelter, controller, state, cam, input, step, until, frames: () => frames };
}

describe('safe houses', () => {
  it('there are at least five, spread through the village', () => {
    const shelters = VILLAGE.houses.filter((h) => h.shelter);
    expect(shelters.length).toBeGreaterThanOrEqual(5);
    // Not all in one corner: some north, some south of the festival ground.
    expect(shelters.some((h) => h.z < -5)).toBe(true);
    expect(shelters.some((h) => h.z > 10)).toBe(true);
  });

  it.each(VILLAGE.houses.filter((h) => h.shelter).map((h) => [h.id] as const))(
    '%s: walk in, safe through the moonlight, walk out — camera clear the whole way',
    (id) => {
      const w = makeWorld();
      const house = w.shelter.houses.find((h) => h.houseId === id) as SafeHouse;
      const i = house.interior;

      // On the veranda, facing the door; the camera settles behind.
      w.controller.teleport(i.outside, i.inwardYaw);
      w.cam.setOrientation(i.inwardYaw, (C.defaultPitchDeg * Math.PI) / 180, true);
      w.cam.snap();
      for (let k = 0; k < 30; k++) w.step(`${id}: settle`);
      expect(w.shelter.isSafe).toBe(false);

      // The shut door is solid.
      expect(house.isShut).toBe(true);

      w.shelter.enter(house);
      expect(w.state.isLocked).toBe(true);
      w.until(() => !w.shelter.busy, `${id}: entering`);
      expect(w.shelter.current, 'inside the room').toBe(house);
      expect(w.shelter.isSafe).toBe(true);
      expect(i.contains(w.controller.feet, 0.2)).toBe(true);
      expect(w.controller.feet.y).toBeCloseTo(PLINTH_H, 1);
      expect(w.state.isLocked, 'control returned').toBe(false);
      // The door swings shut behind; the interior camera takes over.
      w.until(() => house.isShut && w.cam.shotBlend === 1, `${id}: door shutting`);

      // The moon is out: indoors, nothing drains.
      const purity = new PuritySystem();
      for (let k = 0; k < 60 * 5; k++) {
        w.step(`${id}: waiting indoors`);
        purity.update(DT, { dangerous: true, sheltered: w.shelter.isSafe, openGround: false });
      }
      expect(purity.value).toBe(100);

      // Walk the room's corners with the interior camera watching; still safe, still clear.
      const r = i.dims;
      for (const [lx, lz] of [
        [r.x0 + 0.5, r.zFront - 0.6],
        [r.x1 - 0.5, r.zFront - 0.6],
        [r.x1 - 0.5, r.zBack + 0.6],
        [r.x0 + 0.5, r.zBack + 0.6],
      ]) {
        const p = i.at(lx, PLINTH_H, lz);
        w.controller.walkTowards(p.x, p.z, 1.8);
        w.until(() => w.controller.walkRemaining < 0.35, `${id}: walking the room`, 60 * 6);
        expect(w.shelter.isSafe).toBe(true);
      }
      w.controller.stopWalking();
      // Can't walk out through the shut door.
      const out = i.outside;
      w.controller.walkTowards(out.x, out.z, 2);
      for (let k = 0; k < 90; k++) w.step(`${id}: pushing the shut door`);
      expect(w.shelter.isSafe, 'the shut door holds').toBe(true);
      w.controller.stopWalking();

      w.shelter.exit(house);
      w.until(() => !w.shelter.busy, `${id}: leaving`);
      expect(w.shelter.isSafe).toBe(false);
      expect(w.controller.feet.distanceTo(new Vector3(out.x, w.controller.feet.y, out.z))).toBeLessThan(0.3);
      expect(w.controller.feet.y, 'on the veranda').toBeCloseTo(PLINTH_H, 1);
      w.until(() => house.isShut && w.cam.shotBlend === 0, `${id}: door shutting behind`);
    },
    60_000,
  );
});

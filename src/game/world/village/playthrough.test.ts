/**
 * The village, played. An autopilot drives the real character controller over the real colliders —
 * home to every offering, every offering to its nearest shelter, and home to the temple — while the
 * camera orbits the player the whole way. Every frame: the player is on solid ground, and the
 * camera is outside every wall, roof and tree it passes.
 *
 * If a doorway is too narrow, a step too tall or a gap too tight, this fails with the exact spot.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Vector2, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA_CONFIG } from '../../camera/CameraConfig';
import { type CameraTarget, ThirdPersonCamera } from '../../camera/ThirdPersonCamera';
import { DEFAULT_PLAYER_CONFIG } from '../../config/playerConfig';
import type { Input } from '../../core/Input';
import { CAMERA_QUERY, Physics } from '../../core/Physics';
import { PlayerController } from '../../player/PlayerController';
import { PlayerState, PlayerStateId } from '../../player/PlayerState';
import { buildColliders, type LevelColliders } from './colliders';
import { VILLAGE } from './layout';
import { buildNavGrid, distanceField, nearestFree, type NavGrid, simplifyPath, traceBack } from './navgrid';
import { buildLevel, type Level } from './solids';

const DT = 1 / 60;
const DEG = Math.PI / 180;

let level: Level;
let grid: NavGrid;

beforeAll(async () => {
  await RAPIER.init();
  level = buildLevel(VILLAGE);
  grid = buildNavGrid(VILLAGE, level);
});

type Gait = 'walk' | 'run' | 'sneak';

interface Sim {
  physics: Physics;
  colliders: LevelColliders;
  controller: PlayerController;
  state: PlayerState;
  cam: ThirdPersonCamera;
  camera: PerspectiveCamera;
  input: { move: Vector2; run: boolean; slow: boolean; crouchPressed: boolean; interactPressed: boolean };
  frames: number;
  cameraChecks: number;
}

function makeSim(start: { x: number; y: number; z: number; yaw: number }): Sim {
  const physics = new Physics(RAPIER);
  const colliders = buildColliders(VILLAGE, level, physics);
  physics.step(DT);
  const state = new PlayerState();
  const controller = new PlayerController(physics, DEFAULT_PLAYER_CONFIG, state, new Vector3(start.x, start.y, start.z), start.yaw);
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
      return state.value === PlayerStateId.Running ? 'run' : state.value === PlayerStateId.Sneaking ? 'sneak' : 'normal';
    },
    collider: controller.collider,
    setCameraFade() {},
  };
  const camInput = { look: { x: 0, y: 0 }, lookStick: { x: 0, y: 0 }, touchLook: false, zoomNotches: 0, pinchPixels: 0, padZoom: 0, lookSource: null, recenterPressed: false };
  const camera = new PerspectiveCamera(DEFAULT_CAMERA_CONFIG.fov, 16 / 9, DEFAULT_CAMERA_CONFIG.nearPlane, 500);
  const cam = new ThirdPersonCamera(camera, target, camInput, physics, DEFAULT_CAMERA_CONFIG);
  const input = { move: new Vector2(), run: false, slow: false, crouchPressed: false, interactPressed: false };
  return { physics, colliders, controller, state, cam, camera, input, frames: 0, cameraChecks: 0 };
}

/** One frame in the engine's order: player → physics → camera. Then the invariants. */
function step(sim: Sim, label: string): void {
  sim.controller.update(DT, sim.input as unknown as Input, sim.cam.yaw);
  sim.input.crouchPressed = false;
  sim.physics.step(DT);
  // Orbit the camera while walking so it meets every building from every side.
  const t = sim.frames * DT;
  sim.cam.setOrientation(sim.cam.yaw + 50 * DEG * DT, (18 + 30 * Math.sin(t * 0.7)) * DEG);
  sim.cam.update(DT);
  sim.frames++;

  const feet = sim.controller.feet;
  if (feet.y < -0.15) throw new Error(`${label}: fell through the ground at (${feet.x.toFixed(2)}, ${feet.y.toFixed(2)}, ${feet.z.toFixed(2)})`);
  if (sim.physics.overlapsSphere(sim.camera.position, DEFAULT_CAMERA_CONFIG.collisionRadius * 0.95, CAMERA_QUERY)) {
    const p = sim.camera.position;
    throw new Error(`${label}: camera inside geometry at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}), player at (${feet.x.toFixed(2)}, ${feet.z.toFixed(2)})`);
  }
  if (sim.cam.stats.safetyFixes > 0) throw new Error(`${label}: camera safety net fired near (${feet.x.toFixed(2)}, ${feet.z.toFixed(2)})`);
  sim.cameraChecks++;
}

/** Walks the controller along a nav path to (x, z). Fails loudly, with coordinates, if it gets stuck. */
function walkTo(sim: Sim, x: number, z: number, gait: Gait, label: string, arrive = 0.45): void {
  const from = nearestFree(grid, sim.controller.feet.x, sim.controller.feet.z, 1.5);
  const goal = nearestFree(grid, x, z, 2.2);
  const path = simplifyPath(grid, traceBack(grid, distanceField(grid, from), goal));
  if (!path.length) throw new Error(`${label}: no nav path`);
  // The goal cell centre, then the exact spot if it is standable.
  const waypoints = [...path.slice(1), { x, z }];

  if (gait === 'sneak' && !sim.controller.crouched) sim.input.crouchPressed = true;
  if (gait !== 'sneak' && sim.controller.crouched) sim.input.crouchPressed = true;
  sim.input.run = gait === 'run';

  let w = 0;
  let best = Infinity;
  let sinceProgress = 0;
  while (w < waypoints.length) {
    const target = waypoints[w];
    const f = sim.controller.feet;
    const dx = target.x - f.x;
    const dz = target.z - f.z;
    const d = Math.hypot(dx, dz);
    const last = w === waypoints.length - 1;
    if (d < (last ? arrive : 0.6)) {
      w++;
      best = Infinity;
      sinceProgress = 0;
      continue;
    }
    // Desired world direction → camera-relative stick (inverse of PlayerController's mapping).
    const cy = sim.cam.yaw;
    const ux = dx / d;
    const uz = dz / d;
    sim.input.move.set(-ux * Math.cos(cy) + uz * Math.sin(cy), ux * Math.sin(cy) + uz * Math.cos(cy));
    if (last && d < 1.2) sim.input.move.multiplyScalar(Math.max(d / 1.2, 0.35)); // ease in
    step(sim, label);
    if (d < best - 0.25) {
      best = d;
      sinceProgress = 0;
    } else if ((sinceProgress += DT) > 3) {
      throw new Error(`${label}: stuck at (${f.x.toFixed(2)}, ${f.y.toFixed(2)}, ${f.z.toFixed(2)}) heading for (${target.x.toFixed(2)}, ${target.z.toFixed(2)})`);
    }
    if (sim.frames > 60 * 60 * 20) throw new Error(`${label}: took too long`);
  }
  sim.input.move.set(0, 0);
  for (let i = 0; i < 20; i++) step(sim, `${label} (settle)`);
}

function nearestShelter(x: number, z: number) {
  const field = distanceField(grid, nearestFree(grid, x, z, 2.2));
  let best = level.doors[0];
  let bestD = Infinity;
  for (const d of level.doors.filter((d) => d.shelter)) {
    const dd = field[nearestFree(grid, d.x, d.z, 2.2)];
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

describe('playthrough (real controller, real colliders, camera orbiting)', () => {
  it('home → up the temple steps → the offering point, inside the temple trigger', () => {
    const sim = makeSim(level.spawn);
    const t = level.templeOffer;
    walkTo(sim, t.x, t.z, 'walk', 'home → temple');
    const f = sim.controller.feet;
    expect(f.y).toBeCloseTo(VILLAGE.temple.platformH, 1); // standing on the jagati, not beside it
    const sensors = sim.physics.sensorsAt(new Vector3(f.x, f.y + 1, f.z), new Set());
    expect(sensors.has(sim.colliders.templeTrigger.handle)).toBe(true);
    expect(sim.cameraChecks).toBeGreaterThan(1000);
  }, 120_000);

  it.each(VILLAGE.offerings.map((o) => [o.id, o] as const))('home → %s → nearest shelter door', (id, o) => {
    const sim = makeSim(level.spawn);
    walkTo(sim, o.x, o.z, 'run', `home → ${id}`, 1.4);
    const door = nearestShelter(o.x, o.z);
    walkTo(sim, door.x, door.z, 'run', `${id} → ${door.houseId}'s door`);
    expect(sim.controller.feet.y, `on ${door.houseId}'s veranda`).toBeCloseTo(0.45, 1);
    const f = sim.controller.feet;
    const sensors = sim.physics.sensorsAt(new Vector3(f.x, f.y + 1, f.z), new Set());
    const inHouseZone = [...sensors].some((h) => sim.colliders.houseZones.get(h) === door.houseId);
    expect(inHouseZone, `inside ${door.houseId}'s house trigger zone`).toBe(true);
  }, 120_000);

  it('sneaking: through the garden gate, down the Shindes\' alley, and up to their door', () => {
    const sim = makeSim(level.spawn);
    walkTo(sim, -35, -21, 'run', 'home → garden');
    const shinde = level.doors.find((d) => d.houseId === 'shinde');
    if (!shinde) throw new Error('no shinde door');
    walkTo(sim, shinde.x, shinde.z, 'sneak', 'garden → Shindes (crouched)');
    expect(sim.controller.crouched).toBe(true);
  }, 120_000);

  it('the ring road: home → west ring → temple side gate, and the east ring back', () => {
    const sim = makeSim(level.spawn);
    for (const [x, z, label] of [
      [-42, 31, 'south-west lane'],
      [-44.5, 4, 'ring west'],
      [-46, -36, 'ring north-west'],
      [-13, -45.5, 'temple west gate'],
      [13, -45.5, 'across the courtyard to the east gate'],
      [43, -10, 'ring east'],
      [42, 30, 'ring south-east'],
      [3, 43.5, 'home'],
    ] as const) {
      walkTo(sim, x, z, 'run', label, 1.2);
    }
  }, 180_000);
});

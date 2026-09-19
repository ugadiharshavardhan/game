/**
 * The camera against every wall in the village. Every walkable spot that hugs a wall, doorway,
 * veranda post, stall or tree (sampled), with the camera swept through yaw and pitch at each —
 * it must never be inside geometry, and the safety net must never be needed.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA_CONFIG as C } from '../../camera/CameraConfig';
import { type CameraTarget, ThirdPersonCamera } from '../../camera/ThirdPersonCamera';
import { CAMERA_QUERY, Physics, PLAYER_QUERY } from '../../core/Physics';
import { buildColliders } from './colliders';
import { VILLAGE } from './layout';
import { buildNavGrid, centreOf, type NavGrid } from './navgrid';
import { buildLevel } from './solids';

const DEG = Math.PI / 180;
const DT = 1 / 60;

let physics: Physics;
let grid: NavGrid;

beforeAll(async () => {
  await RAPIER.init();
  const level = buildLevel(VILLAGE);
  grid = buildNavGrid(VILLAGE, level);
  physics = new Physics(RAPIER);
  buildColliders(VILLAGE, level, physics);
  physics.step(DT);
});

/** Walkable cells with a blocked cell within `reach` cells: the spots that hug something solid. */
function wallHuggers(g: NavGrid, reach: number, every: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  let n = 0;
  for (let row = reach; row < g.rows - reach; row++) {
    for (let col = reach; col < g.cols - reach; col++) {
      if (g.blocked[row * g.cols + col]) continue;
      let near = false;
      for (let dr = -reach; dr <= reach && !near; dr++)
        for (let dc = -reach; dc <= reach && !near; dc++) if (g.blocked[(row + dr) * g.cols + col + dc]) near = true;
      if (near && n++ % every === 0) out.push(centreOf(g, row * g.cols + col));
    }
  }
  return out;
}

describe('camera against every wall in the village', () => {
  it('never enters geometry at any wall-hugging spot, from any angle', { timeout: 120_000 }, () => {
    const spots = wallHuggers(grid, 2, 9);
    expect(spots.length).toBeGreaterThan(2000); // ~2,400 spots; ~230,000 camera frames in all

    const target: CameraTarget & { feet: Vector3; yaw: number } = {
      feet: new Vector3(),
      yaw: 0,
      bodyHeight: 1.62,
      planarSpeed: 0,
      gait: 'normal',
      collider: undefined as never,
      setCameraFade() {},
    };
    const input = { look: { x: 0, y: 0 }, lookStick: { x: 0, y: 0 }, touchLook: false, zoomNotches: 0, pinchPixels: 0, padZoom: 0, lookSource: null, recenterPressed: false };
    const camera = new PerspectiveCamera(C.fov, 16 / 9, C.nearPlane, 500);
    const down = new Vector3(0, -1, 0);
    const probe = new Vector3();
    let frames = 0;
    const failures: string[] = [];

    for (const s of spots) {
      // Stand on whatever floor is there: ground, veranda, temple platform.
      const hit = physics.castRay(probe.set(s.x, 2.2, s.z), down, 3, undefined, PLAYER_QUERY);
      target.feet.set(s.x, hit === null ? 0 : 2.2 - hit, s.z);
      const cam = new ThirdPersonCamera(camera, target, input, physics, C);
      for (let yaw = 0; yaw < 360; yaw += 45) {
        for (const pitch of [C.pitchMinDeg, C.defaultPitchDeg, 40, C.pitchMaxDeg]) {
          cam.setOrientation(yaw * DEG, pitch * DEG);
          for (let f = 0; f < 3; f++) {
            cam.update(DT);
            frames++;
            if (physics.overlapsSphere(camera.position, C.collisionRadius * 0.95, CAMERA_QUERY) || cam.stats.safetyFixes > 0) {
              failures.push(`(${s.x.toFixed(2)}, ${target.feet.y.toFixed(2)}, ${s.z.toFixed(2)}) yaw ${yaw} pitch ${pitch}`);
            }
          }
        }
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
    expect(frames).toBeGreaterThan(200_000);
  });
});

/**
 * Development-only handle for automated browser verification: `window.__seva`.
 * Loaded with a dynamic import behind `import.meta.env.DEV`, so production builds never include it.
 *
 *   __seva.teleport(x, z, yawDeg)   __seva.look(yawDeg, pitchDeg)   __seva.info()
 *   await __seva.walkTo(x, z, { run, sneak })  — autopilot over the nav grid, real controller
 *   __seva.moon('moonlight')   __seva.give('flowers', 3)   __seva.interact()
 *   await __seva.enter('patil') / __seva.leave()  — a shelter's door sequence, for real
 */
import { Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import type { MoonPhase } from '../../shared/types';
import type { ItemId } from '../../shared/items';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import type { Gameplay } from '../Gameplay';
import type { Player } from '../player/Player';
import type { World } from '../world/World';
import type { Input } from './Input';
import type { Physics } from './Physics';

export interface DevHandle {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  input: Input;
  physics: Physics;
  player: Player;
  cameraRig: ThirdPersonCamera;
  world: World;
  gameplay: Gameplay;
}

const DEG = Math.PI / 180;

export async function installDevtools(h: DevHandle): Promise<void> {
  const [{ VILLAGE }, { buildLevel }, nav] = await Promise.all([
    import('../world/village/layout'),
    import('../world/village/solids'),
    import('../world/village/navgrid'),
  ]);
  const level = buildLevel(VILLAGE);
  const grid = nav.buildNavGrid(VILLAGE, level);

  // Autopilot: after Input computes the frame's move from keys, overwrite it with the route.
  let route: { x: number; z: number }[] | null = null;
  let done: ((r: { ok: boolean; reason?: string }) => void) | null = null;
  let best = Infinity;
  let stuckFor = 0;
  const originalUpdate = h.input.update.bind(h.input);
  h.input.update = () => {
    originalUpdate();
    if (!route) return;
    const f = h.player.feet;
    const target = route[0];
    const d = Math.hypot(target.x - f.x, target.z - f.z);
    if (d < (route.length === 1 ? 0.45 : 0.6)) {
      route.shift();
      best = Infinity;
      stuckFor = 0;
      if (!route.length) {
        route = null;
        h.input.move.set(0, 0);
        done?.({ ok: true });
        return;
      }
      return;
    }
    const cy = h.cameraRig.viewYaw;
    const ux = (target.x - f.x) / d;
    const uz = (target.z - f.z) / d;
    h.input.move.set(-ux * Math.cos(cy) + uz * Math.sin(cy), ux * Math.sin(cy) + uz * Math.cos(cy));
    if (d < best - 0.25) {
      best = d;
      stuckFor = 0;
    } else if ((stuckFor += 1 / 60) > 4) {
      route = null;
      done?.({ ok: false, reason: `stuck at (${f.x.toFixed(2)}, ${f.z.toFixed(2)})` });
    }
  };

  const api = {
    /** The live scene, for inspection (triangle counts by object, and so on). */
    scene: h.scene,
    camera: h.camera,
    teleport(x: number, z: number, yawDeg = 180) {
      // A teleport ends any walk in progress.
      if (route) {
        route = null;
        h.input.move.set(0, 0);
        done?.({ ok: false, reason: 'interrupted' });
      }
      const y = level.solids.some((s) => s.kind === 'box' && s.nav === 'walkable' && Math.abs(s.x - x) < s.sx / 2 && Math.abs(s.z - z) < s.sz / 2) ? 0.9 : 0;
      h.player.controller.teleport(new Vector3(x, y, z), yawDeg * DEG);
      h.cameraRig.setOrientation(yawDeg * DEG, 10 * DEG, true);
      h.cameraRig.snap();
    },
    look(yawDeg: number, pitchDeg: number) {
      h.cameraRig.setOrientation(yawDeg * DEG, pitchDeg * DEG, true);
    },
    walkTo(x: number, z: number, opts: { run?: boolean } = {}): Promise<{ ok: boolean; reason?: string }> {
      const from = nav.nearestFree(grid, h.player.feet.x, h.player.feet.z, 1.5);
      const path = nav.simplifyPath(grid, nav.traceBack(grid, nav.distanceField(grid, from), nav.nearestFree(grid, x, z, 2.2)));
      if (!path.length) return Promise.resolve({ ok: false, reason: 'no path' });
      route = [...path.slice(1), { x, z }];
      best = Infinity;
      stuckFor = 0;
      h.input.run = !!opts.run;
      const origRun = Object.getOwnPropertyDescriptor(h.input, 'run');
      if (opts.run) Object.defineProperty(h.input, 'run', { configurable: true, get: () => true, set: () => {} });
      return new Promise((resolve) => {
        done = (r) => {
          if (origRun) Object.defineProperty(h.input, 'run', origRun);
          else delete (h.input as { run?: boolean }).run;
          h.input.run = false;
          resolve(r);
        };
      });
    },
    moon(phase: MoonPhase) {
      h.gameplay.moon.skipTo(phase);
    },
    give(item: ItemId, n = 1) {
      return h.gameplay.inventory.add(item, n);
    },
    interact() {
      h.input.interactPressed = true;
    },
    /** Walks to a shelter's door and goes in; resolves once inside with the door shut. */
    async enter(houseId: string): Promise<{ ok: boolean; reason?: string }> {
      const shelter = h.world.shelter;
      const house = shelter?.houses.find((x) => x.houseId === houseId);
      if (!shelter || !house) return { ok: false, reason: 'no such shelter' };
      const o = house.interior.outside;
      const walk = await api.walkTo(o.x, o.z);
      if (!walk.ok) return walk;
      shelter.enter(house);
      await until(() => !shelter.busy && house.isShut);
      return { ok: shelter.current === house };
    },
    async leave(): Promise<{ ok: boolean }> {
      const shelter = h.world.shelter;
      const house = shelter?.current;
      if (!shelter || !house) return { ok: false };
      shelter.exit(house);
      await until(() => !shelter.busy && house.isShut);
      return { ok: shelter.current === null };
    },
    info() {
      const r = h.renderer.info;
      const f = h.player.feet;
      const w = h.world as World & { triggers?: { area: { name: string } | null; houseId: string | null; inTemple: boolean } };
      return {
        pos: [f.x, f.y, f.z].map((v) => +v.toFixed(2)),
        state: h.player.state.value,
        area: w.triggers?.area?.name ?? null,
        houseZone: w.triggers?.houseId ?? null,
        inTemple: w.triggers?.inTemple ?? false,
        camera: { ...h.cameraRig.stats, fov: +h.camera.fov.toFixed(2), yaw: +(h.cameraRig.yaw / DEG).toFixed(1), pitch: +(h.cameraRig.pitch / DEG).toFixed(1) },
        render: { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs?.length ?? 0 },
        safe: h.world.shelter?.isSafe ?? false,
        shelter: h.world.shelter?.current?.houseId ?? null,
        moon: h.gameplay.moon.phase,
        purity: Math.round(h.gameplay.purity.value),
        bag: h.gameplay.inventory.snapshot(),
        target: h.gameplay.interaction.target?.id ?? null,
      };
    },
  };
  (window as unknown as { __seva: typeof api }).__seva = api;

  function until(done: () => boolean, timeoutMs = 15000): Promise<void> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => (done() || performance.now() - t0 > timeoutMs ? resolve() : requestAnimationFrame(tick));
      tick();
    });
  }
}

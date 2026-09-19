/**
 * The village as a playable World: environment, colliders, visuals (art or greybox), doors, the
 * temple, and the trigger system — all built from one layout.
 */
import { type Camera, type Scene, Vector3, type WebGLRenderer } from 'three';
import { EventBus } from '../../../shared/EventBus';
import type { Physics } from '../../core/Physics';
import { buildEnvironment } from '../environment';
import type { World } from '../World';
import { buildColliders } from './colliders';
import { HouseDoor, TempleOffering } from './interactables';
import { VILLAGE } from './layout';
import type { VillageVisuals, VisualsContext } from './render/types';
import { buildLevel } from './solids';
import { TriggerSystem } from './TriggerSystem';

export type VillageView = 'art' | 'greybox';

export async function buildVillage(scene: Scene, renderer: WebGLRenderer, physics: Physics, view: VillageView): Promise<World & { triggers: TriggerSystem }> {
  const level = buildLevel(VILLAGE);
  const env = buildEnvironment(scene, renderer);
  const colliders = buildColliders(VILLAGE, level, physics);
  const ctx: VisualsContext = {
    scene,
    renderer,
    layout: VILLAGE,
    level,
    env,
    onProgress: (p) => EventBus.emit('preload:progress', { progress: 0.2 + 0.5 * p }),
  };

  let visuals: VillageVisuals;
  if (view === 'greybox') {
    const { buildGreybox } = await import('./render/greybox');
    visuals = await buildGreybox(ctx);
  } else {
    const { buildArt } = await import('./render/art/VillageArt');
    visuals = await buildArt(ctx);
  }

  const doors = level.doors.map((d) => new HouseDoor(d, visuals.doorHinges.get(d.houseId) ?? null, -1));
  const t = level.templeOffer;
  const temple = new TempleOffering(new Vector3(t.x, t.y, t.z));
  const triggers = new TriggerSystem(physics, colliders);
  let time = 0;

  return {
    interactables: [...doors, temple],
    spawn: new Vector3(level.spawn.x, level.spawn.y, level.spawn.z),
    spawnYaw: level.spawn.yaw,
    sun: env.sun,
    triggers,
    follow: (target) => env.follow(target),
    update(dt: number, feet: Vector3, camera: Camera) {
      time += dt;
      triggers.update(dt, feet);
      visuals.update(dt, { camera, time, templeGlow: temple.lampBoost });
    },
    dispose() {
      visuals.dispose();
      env.dispose();
    },
  };
}

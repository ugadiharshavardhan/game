/**
 * The village as a playable World: environment, colliders, visuals (art or greybox), the puja items,
 * the shelters and their doors, the temple altar, the villagers, and the trigger system — all built
 * from one layout.
 */
import { type Scene, Vector3, type WebGLRenderer } from 'three';
import { CAMERA_QUERY } from '../../core/Physics';
import { EventBus } from '../../../shared/EventBus';
import type { InventoryStack } from '../../../shared/items';
import type { Physics } from '../../core/Physics';
import type { IInteractable } from '../../interaction/IInteractable';
import { PujaItem } from '../../items/PujaItem';
import { SafeHouse } from '../../shelter/SafeHouse';
import { ShelterManager } from '../../shelter/ShelterManager';
import { HouseInterior } from '../../shelter/HouseInterior';
import { MoonLightingController } from '../../moon/MoonLightingController';
import { PROFILES, type QualityProfile } from '../../core/quality';
import { buildEnvironment, EVENING } from '../environment';
import type { World, WorldFrame, WorldServices } from '../World';
import { buildColliders } from './colliders';
import { PujaSequence } from './PujaSequence';
import { DroppedOfferings, LockedDoor, TempleAltar, VillagerTalk } from './interactables';
import { VILLAGE } from './layout';
import type { DropVisual, VillageVisuals, VisualsContext } from './render/types';
import { buildLevel } from './solids';
import { TriggerSystem } from './TriggerSystem';

export type VillageView = 'art' | 'greybox';

export async function buildVillage(
  scene: Scene,
  renderer: WebGLRenderer,
  physics: Physics,
  view: VillageView,
  services: WorldServices,
  quality: QualityProfile = PROFILES.high,
): Promise<World & { triggers: TriggerSystem; items: PujaItem[] }> {
  const level = buildLevel(VILLAGE);
  const env = buildEnvironment(scene, renderer, { ...EVENING, mist: quality.mist });
  const colliders = buildColliders(VILLAGE, level, physics);
  const ctx: VisualsContext = {
    scene,
    renderer,
    layout: VILLAGE,
    level,
    env,
    quality,
    sound: services.playSound,
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

  // Shelters: an open door and a room behind it. The other houses are locked.
  const shelter = new ShelterManager();
  const doors: IInteractable[] = [];
  for (const h of VILLAGE.houses) {
    const hinge = visuals.doorHinges.get(h.id) ?? null;
    if (h.shelter) {
      const house = new SafeHouse(h, shelter, colliders.doorColliders.get(h.id) ?? null, hinge);
      shelter.add(house);
      doors.push(house.entrance, house.exit);
    } else {
      const i = new HouseInterior(h);
      const door = level.doors.find((d) => d.houseId === h.id);
      if (door) doors.push(new LockedDoor(door, i.threshold, i.doorFaceOut, hinge));
    }
  }

  const items = VILLAGE.offerings.map((spot) => {
    const item = new PujaItem(spot, services.inventory, physics);
    item.visual = visuals.itemVisuals.get(spot.id) ?? null;
    return item;
  });

  // After the art, so anything that bakes the moon's direction into a shader (the beams through
  // an interior's window) reads the moon at its height rather than the instant it clears the trees.
  const lighting = new MoonLightingController(env);

  const pandal = VILLAGE.landmarks.find((l) => l.kind === 'pandal');
  const t = level.templeOffer;
  const altar = new TempleAltar(new Vector3(t.x, t.y, t.z), services.inventory, services.onPray, services.onPujaComplete);
  const villagers = VILLAGE.villagers
    .filter((v) => v.name && v.lines?.length)
    .map((v) => new VillagerTalk({ ...v, name: v.name ?? '', lines: v.lines ?? [] }));

  const triggers = new TriggerSystem(physics, colliders);
  const drops = new Map<IInteractable, DropVisual>();
  let time = 0;
  const feet = new Vector3();
  const up = new Vector3(0, 1, 0);
  const probe = new Vector3();
  const shelterDoors = level.doors.filter((d) => d.shelter);
  const offerPoint = new Vector3(t.x, t.y, t.z);
  let puja: PujaSequence | null = null;

  return {
    interactables: [...items, ...doors, altar, ...villagers],
    shelter,
    items,
    spawn: new Vector3(level.spawn.x, level.spawn.y, level.spawn.z),
    spawnYaw: level.spawn.yaw,
    sun: env.sun,
    triggers,
    itemIcons: visuals.itemIcons,
    soundSpots: {
      festival: pandal ? new Vector3(pandal.x, 2, pandal.z) : null,
      temple: new Vector3(t.x, t.y + 1.5, t.z),
    },
    follow: (target) => env.follow(target),
    isOpenGround: () => triggers.area?.open ?? false,
    // Something overhead — a veranda, an awning, the temple's hall — keeps the moon off you.
    isCovered: () => physics.castRay(probe.set(feet.x, feet.y + 1.2, feet.z), up, 7, undefined, CAMERA_QUERY) !== null,
    shelterDistance: (p: Vector3) => shelterDoors.reduce((best, d) => Math.min(best, Math.hypot(p.x - d.x, p.z - d.z)), Infinity),
    pujaSequence(stage, done) {
      // Around the devotee where he stands, with the sanctum behind him.
      puja = new PujaSequence(stage, feet, () => {
        puja = null;
        done();
      });
      visuals.puja?.start(offerPoint);
      return () => puja?.finish();
    },
    dropOfferings(at: Vector3, stacks: InventoryStack[], onEmpty: (d: IInteractable) => void) {
      const visual = visuals.makeDropVisual(at);
      const drop = new DroppedOfferings(at, stacks, services.inventory, (d) => {
        visual.dispose();
        drops.delete(d);
        onEmpty(d);
      });
      drop.visual = visual;
      drops.set(drop, visual);
      return drop;
    },
    update(dt: number, at: Vector3, frame: WorldFrame) {
      time += dt;
      feet.copy(at);
      triggers.update(dt, at);
      puja?.update(dt);
      visuals.puja?.update(dt, time);
      lighting.update(dt, frame.moon);
      // The art follows the sky the lighting actually reached, not the state machine's ideal.
      visuals.update(dt, {
        camera: frame.camera,
        time,
        templeGlow: Math.max(altar.lampBoost, visuals.puja?.glow ?? 0),
        moonlight: lighting.night,
        goingHome: frame.moon.goingHome,
        dangerous: frame.moon.dangerous,
        player: at,
        noise: frame.noise,
      });
    },
    dispose() {
      for (const v of drops.values()) v.dispose();
      visuals.dispose();
      env.dispose();
    },
  };
}

/**
 * The village as a playable World: environment, colliders, visuals (art or greybox), the puja items,
 * the shelters and their doors, the temple altar, the villagers, and the trigger system — all built
 * from one layout.
 */
import { type Scene, Vector3, type WebGLRenderer } from 'three';
import { EventBus } from '../../../shared/EventBus';
import type { InventoryStack } from '../../../shared/items';
import type { Physics } from '../../core/Physics';
import type { IInteractable } from '../../interaction/IInteractable';
import { PujaItem } from '../../items/PujaItem';
import { SafeHouse } from '../../shelter/SafeHouse';
import { ShelterManager } from '../../shelter/ShelterManager';
import { HouseInterior } from '../../shelter/HouseInterior';
import { buildEnvironment } from '../environment';
import type { World, WorldFrame, WorldServices } from '../World';
import { buildColliders } from './colliders';
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
): Promise<World & { triggers: TriggerSystem; items: PujaItem[] }> {
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

  const t = level.templeOffer;
  const altar = new TempleAltar(new Vector3(t.x, t.y, t.z), services.inventory, services.onPray);
  const villagers = VILLAGE.villagers
    .filter((v) => v.name && v.lines?.length)
    .map((v) => new VillagerTalk({ ...v, name: v.name ?? '', lines: v.lines ?? [] }));

  const triggers = new TriggerSystem(physics, colliders);
  const drops = new Map<IInteractable, DropVisual>();
  let time = 0;

  return {
    interactables: [...items, ...doors, altar, ...villagers],
    shelter,
    items,
    spawn: new Vector3(level.spawn.x, level.spawn.y, level.spawn.z),
    spawnYaw: level.spawn.yaw,
    sun: env.sun,
    triggers,
    itemIcons: visuals.itemIcons,
    follow: (target) => env.follow(target),
    isOpenGround: () => triggers.area?.open ?? false,
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
    update(dt: number, feet: Vector3, frame: WorldFrame) {
      time += dt;
      triggers.update(dt, feet);
      env.setMoonlight(frame.moonlight);
      visuals.update(dt, { camera: frame.camera, time, templeGlow: altar.lampBoost, moonlight: frame.moonlight });
    },
    dispose() {
      for (const v of drops.values()) v.dispose();
      visuals.dispose();
      env.dispose();
    },
  };
}

/**
 * Level solids → Rapier colliders. Used by the game and by the playthrough tests, so both walk the
 * exact same world.
 */
import type { Collider } from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { Layer, type Physics } from '../../core/Physics';
import type { Level, SolidLayer } from './solids';
import type { AreaDef, VillageLayout } from './types';

const LAYER: Record<Exclude<SolidLayer, 'none'>, Layer> = {
  world: Layer.World,
  prop: Layer.Prop,
  blocker: Layer.Blocker,
};

export interface LevelColliders {
  /** Sensor handle → the area it belongs to. */
  zones: Map<number, AreaDef>;
  /** The sensor around the temple offering point. */
  templeTrigger: Collider;
  /** Sensor handle → house id, one per veranda. */
  houseZones: Map<number, string>;
  /** Each shelter's door leaf, enabled while the door is shut (house id → collider). */
  doorColliders: Map<string, Collider>;
}

export function buildColliders(layout: VillageLayout, level: Level, physics: Physics): LevelColliders {
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();
  const c = new Vector3();
  const s = new Vector3();

  // Flat ground under the whole village (the visual terrain only rises outside the playable edge).
  const b = layout.bounds;
  physics.addBox(new Vector3((b.minX + b.maxX) / 2, -0.5, (b.minZ + b.maxZ) / 2), new Vector3(b.maxX - b.minX + 80, 1, b.maxZ - b.minZ + 80));

  const doorColliders = new Map<string, Collider>();
  for (const solid of level.solids) {
    if (solid.layer === 'none') continue;
    const layer = LAYER[solid.layer];
    if (solid.kind === 'box') {
      const col = physics.addBox(c.set(solid.x, solid.y, solid.z), s.set(solid.sx, solid.sy, solid.sz), q.setFromAxisAngle(up, solid.rot), layer);
      if (solid.tag.endsWith(':door')) doorColliders.set(solid.tag.split(':')[1], col);
    } else if (solid.kind === 'cyl') {
      physics.addCylinder(c.set(solid.x, solid.y + solid.h / 2, solid.z), solid.h / 2, solid.r, layer);
    } else {
      physics.addConvexHull(solid.points.map((p) => new Vector3(p.x, p.y, p.z)), layer);
    }
  }

  const zones = new Map<number, AreaDef>();
  for (const a of level.zones) {
    const sensor = physics.addSensorBox(new Vector3(a.x, 2, a.z), new Vector3(a.w, 4, a.d), a.rot ? q.setFromAxisAngle(up, a.rot) : undefined);
    zones.set(sensor.handle, a);
  }

  const houseZones = new Map<number, string>();
  for (const d of level.doors) {
    const sensor = physics.addSensorBox(new Vector3(d.x, d.y + 1, d.z), new Vector3(2.4, 2, 1.6), q.setFromAxisAngle(up, d.yaw));
    houseZones.set(sensor.handle, d.houseId);
  }

  const t = level.templeOffer;
  const templeTrigger = physics.addSensorBox(new Vector3(t.x, t.y + 1, t.z), new Vector3(3.2, 2, 2.6));

  return { zones, templeTrigger, houseZones, doorColliders };
}

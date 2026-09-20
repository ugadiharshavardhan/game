/**
 * Watches the player against the level's sensor volumes: named areas (for the HUD's place names),
 * house zones (the veranda in front of each door) and the temple trigger. The moon system will
 * read `houseId` and `inTemple`; for now the HUD reads the area.
 */
import { Vector3 } from 'three';
import { EventBus } from '../../../shared/EventBus';
import type { Physics } from '../../core/Physics';
import type { LevelColliders } from './colliders';
import type { AreaDef } from './types';

export class TriggerSystem {
  /** The named area the player is in, or null on the lanes between them. */
  area: AreaDef | null = null;
  /** The house whose veranda the player is on, or null. */
  houseId: string | null = null;
  inTemple = false;

  private timer = 0;
  private readonly probe = new Vector3();
  private readonly hits = new Set<number>();
  private readonly physics: Physics;
  private readonly colliders: LevelColliders;

  constructor(physics: Physics, colliders: LevelColliders) {
    this.physics = physics;
    this.colliders = colliders;
  }

  update(dt: number, feet: Vector3): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.15; // sensors don't need 60 Hz

    this.physics.sensorsAt(this.probe.set(feet.x, feet.y + 1, feet.z), this.hits);
    let area: AreaDef | null = null;
    let house: string | null = null;
    let temple = false;
    for (const h of this.hits) {
      const a = this.colliders.zones.get(h);
      // Overlapping areas: the smaller, more specific one wins (the sweet shop inside the lanes).
      if (a && (!area || a.w * a.d < area.w * area.d)) area = a;
      house ??= this.colliders.houseZones.get(h) ?? null;
      if (h === this.colliders.templeTrigger.handle) temple = true;
    }
    this.houseId = house;
    if (temple !== this.inTemple) EventBus.emit('ui:at-temple', { inside: temple });
    this.inTemple = temple;
    if (area?.id !== this.area?.id) {
      this.area = area;
      EventBus.emit('ui:area', area ? { name: area.name, open: area.open ?? false } : null);
    }
  }
}

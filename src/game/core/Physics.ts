import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Quaternion, Vector3 } from 'three';

export type Rapier = typeof RAPIER_NS;

/**
 * Thin wrapper over a Rapier world: static level geometry, ray casts, stepping.
 * Gravity is zero — the character controller applies its own, kinematically.
 */
export class Physics {
  readonly world: InstanceType<Rapier['World']>;
  readonly R: Rapier;

  constructor(
    R: Rapier,
  ) {
    this.R = R;
    this.world = new R.World({ x: 0, y: 0, z: 0 });
  }

  /** A fixed box. `size` is the full extent, like a Three.js BoxGeometry. */
  addBox(center: Vector3, size: Vector3, rotation?: Quaternion): Collider {
    const desc = this.R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setTranslation(
      center.x,
      center.y,
      center.z,
    );
    if (rotation) desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    return this.world.createCollider(desc);
  }

  /** A fixed sensor sphere (for interactables). */
  addSensor(center: Vector3, radius: number): Collider {
    return this.world.createCollider(
      this.R.ColliderDesc.ball(radius).setTranslation(center.x, center.y, center.z).setSensor(true),
    );
  }

  /** Distance to the first solid hit along `dir` (unit), or null. Sensors and `exclude` are ignored. */
  castRay(origin: Vector3, dir: Vector3, maxDistance: number, exclude?: Collider): number | null {
    const ray = new this.R.Ray(origin, dir);
    const hit = this.world.castRay(
      ray,
      maxDistance,
      true,
      this.R.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      exclude,
    );
    return hit ? hit.timeOfImpact : null;
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}

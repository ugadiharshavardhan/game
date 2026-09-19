import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { Quaternion, Vector3 } from 'three';

export type Rapier = typeof RAPIER_NS;
type Ball = InstanceType<Rapier['Ball']>;

/**
 * Collision layers. A collider *is* one layer and collides with the layers in its filter.
 *
 * The split that matters is World vs Prop vs Blocker: all three stop the player, but only
 * World stops the camera. Thin poles, fence rails and the invisible map boundary would
 * otherwise yank the camera in every time one passed behind the player — the most common
 * cause of a third-person camera that feels twitchy.
 */
export const Layer = {
  /** Walls, roofs, terrain, anything big: blocks the player and the camera. */
  World: 1 << 0,
  Player: 1 << 1,
  /** Invisible player-only walls (map edge). The camera may pass through. */
  Blocker: 1 << 2,
  /** Thin or small solids (posts, fences, props): block the player, not the camera. */
  Prop: 1 << 3,
  /** Only used as the membership of camera queries. */
  Camera: 1 << 4,
  Trigger: 1 << 5,
} as const;
export type Layer = (typeof Layer)[keyof typeof Layer];

/** Rapier packs membership into the high 16 bits and the filter into the low 16. */
export const groups = (membership: number, filter: number): number => ((membership & 0xffff) << 16) | (filter & 0xffff);

const ALL = 0xffff;
/** What the player's character controller collides with. */
export const PLAYER_QUERY = groups(Layer.Player, Layer.World | Layer.Blocker | Layer.Prop);
/** What the camera treats as solid. */
export const CAMERA_QUERY = groups(Layer.Camera, Layer.World);

/**
 * Thin wrapper over a Rapier world: static level geometry, queries, stepping.
 * Gravity is zero — the character controller applies its own, kinematically.
 */
export class Physics {
  readonly world: InstanceType<Rapier['World']>;
  readonly R: Rapier;
  private readonly balls = new Map<number, Ball>();
  private readonly identity = { x: 0, y: 0, z: 0, w: 1 };

  constructor(R: Rapier) {
    this.R = R;
    this.world = new R.World({ x: 0, y: 0, z: 0 });
  }

  /** A fixed box. `size` is the full extent, like a Three.js BoxGeometry. */
  addBox(center: Vector3, size: Vector3, rotation?: Quaternion, layer: Layer = Layer.World): Collider {
    const desc = this.R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(layer, ALL));
    if (rotation) desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    return this.world.createCollider(desc);
  }

  /** A fixed upright cylinder (tree trunks, pillars, posts). */
  addCylinder(center: Vector3, halfHeight: number, radius: number, layer: Layer = Layer.World): Collider {
    return this.world.createCollider(
      this.R.ColliderDesc.cylinder(halfHeight, radius)
        .setTranslation(center.x, center.y, center.z)
        .setCollisionGroups(groups(layer, ALL)),
    );
  }

  /** A fixed convex hull of world-space points (roofs, the shikhara). */
  addConvexHull(points: readonly Vector3[], layer: Layer = Layer.World): Collider | null {
    const flat = new Float32Array(points.length * 3);
    points.forEach((p, i) => flat.set([p.x, p.y, p.z], i * 3));
    const desc = this.R.ColliderDesc.convexHull(flat);
    if (!desc) return null;
    return this.world.createCollider(desc.setCollisionGroups(groups(layer, ALL)));
  }

  /**
   * Terrain. `heights` is row-major over (rows × cols) samples covering `size` metres centred on
   * `center`; converted here to the column-major layout Rapier expects.
   */
  addHeightfield(center: Vector3, size: { x: number; z: number }, rows: number, cols: number, heights: Float32Array): Collider {
    const colMajor = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) colMajor[c * rows + r] = heights[r * cols + c];
    return this.world.createCollider(
      this.R.ColliderDesc.heightfield(rows - 1, cols - 1, colMajor, { x: size.x, y: 1, z: size.z })
        .setTranslation(center.x, center.y, center.z)
        .setCollisionGroups(groups(Layer.World, ALL)),
    );
  }

  /** A fixed sensor sphere (for interactables). */
  addSensor(center: Vector3, radius: number): Collider {
    return this.world.createCollider(
      this.R.ColliderDesc.ball(radius)
        .setTranslation(center.x, center.y, center.z)
        .setSensor(true)
        .setCollisionGroups(groups(Layer.Trigger, Layer.Player)),
    );
  }

  /** A fixed sensor box (area and house trigger zones). */
  addSensorBox(center: Vector3, size: Vector3, rotation?: Quaternion): Collider {
    const desc = this.R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setTranslation(center.x, center.y, center.z)
      .setSensor(true)
      .setCollisionGroups(groups(Layer.Trigger, Layer.Player));
    if (rotation) desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    return this.world.createCollider(desc);
  }

  /** Distance to the first solid hit along `dir` (unit), or null. Sensors and `exclude` are ignored. */
  castRay(origin: Vector3, dir: Vector3, maxDistance: number, exclude?: Collider, filter = PLAYER_QUERY): number | null {
    const ray = new this.R.Ray(origin, dir);
    const hit = this.world.castRay(ray, maxDistance, true, this.R.QueryFilterFlags.EXCLUDE_SENSORS, filter, exclude);
    return hit ? hit.timeOfImpact : null;
  }

  /**
   * Sweeps a sphere from `origin` along `dir` (unit). Returns how far it travels before touching
   * something, or null if it reaches `maxDistance` untouched. A sphere, not a ray: a ray slips
   * through the gap at a wall corner and the camera ends up looking at the inside of the wall.
   */
  castSphere(origin: Vector3, dir: Vector3, maxDistance: number, radius: number, filter = CAMERA_QUERY): number | null {
    if (maxDistance <= 1e-5) return null;
    const hit = this.world.castShape(
      origin,
      this.identity,
      dir,
      this.ball(radius),
      0,
      maxDistance,
      // A sphere resting against a wall and moving away from it must not report a hit at 0.
      false,
      this.R.QueryFilterFlags.EXCLUDE_SENSORS,
      filter,
    );
    return hit ? hit.time_of_impact : null;
  }

  /** True if a sphere at `center` overlaps any solid in `filter`. */
  overlapsSphere(center: Vector3, radius: number, filter = CAMERA_QUERY): boolean {
    let found = false;
    this.world.intersectionsWithShape(
      center,
      this.identity,
      this.ball(radius),
      () => {
        found = true;
        return false; // stop at the first
      },
      this.R.QueryFilterFlags.EXCLUDE_SENSORS,
      filter,
    );
    return found;
  }

  /** Sensors whose volume contains `point`. Used by the trigger system. */
  sensorsAt(point: Vector3, out: Set<number>): Set<number> {
    out.clear();
    this.world.intersectionsWithPoint(
      point,
      (c) => {
        if (c.isSensor()) out.add(c.handle);
        return true;
      },
      undefined,
      groups(Layer.Player, Layer.Trigger),
    );
    return out;
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }

  private ball(radius: number): Ball {
    let b = this.balls.get(radius);
    if (!b) {
      b = new this.R.Ball(radius);
      this.balls.set(radius, b);
    }
    return b;
  }
}

/**
 * A shelter house's front room, in world space: where the player stands outside the door, walks
 * through, waits, and where the interior camera sits. Built from the same `interiorDims` as the
 * room's colliders and its art, so the walk, the walls and the picture always agree.
 */
import { Vector3 } from 'three';
import { DOOR_H, houseDims, interiorDims, type InteriorDims, PLINTH_H, toWorld } from '../world/village/dims';
import type { HouseDef } from '../world/village/types';

export class HouseInterior {
  readonly houseId: string;
  readonly family: string;
  readonly isHome: boolean;
  readonly dims: InteriorDims;
  /** On the veranda, facing the door. */
  readonly outside: Vector3;
  /** The middle of the doorway, in the wall. */
  readonly threshold: Vector3;
  /** Just inside the doorway. */
  readonly innerDoor: Vector3;
  /** Where the player stops once inside. */
  readonly inside: Vector3;
  /** Where the "Leave house" prompt is used from. */
  readonly exitPoint: Vector3;
  /** The doorway's centre at head height, inside and out — prompt anchors. */
  readonly doorFaceOut: Vector3;
  readonly doorFaceIn: Vector3;
  /** The interior camera. */
  readonly cameraPoint: Vector3;
  /** Heading that walks into the house, and out of it. */
  readonly inwardYaw: number;
  readonly outwardYaw: number;

  private readonly house: HouseDef;

  constructor(house: HouseDef) {
    this.house = house;
    this.houseId = house.id;
    this.family = house.family;
    this.isHome = !!house.start;
    const d = houseDims(house);
    const r = (this.dims = interiorDims(house));
    const x = d.doorX;
    const midWall = (r.zFront + d.halfD) / 2;
    this.outside = this.at(x, PLINTH_H, d.doorStandZ);
    this.threshold = this.at(x, PLINTH_H, midWall);
    this.innerDoor = this.at(x, PLINTH_H, r.zFront - 0.45);
    this.inside = this.at(x, PLINTH_H, r.standZ);
    this.exitPoint = this.at(x, PLINTH_H, r.exitZ);
    this.doorFaceOut = this.at(x, PLINTH_H + DOOR_H * 0.62, d.halfD + 0.05);
    this.doorFaceIn = this.at(x, PLINTH_H + DOOR_H * 0.62, r.zFront - 0.05);
    this.cameraPoint = this.at(r.camera.x, r.camera.y, r.camera.z);
    this.inwardYaw = house.rot + Math.PI;
    this.outwardYaw = house.rot;
  }

  /** Local (x, y, z) in the house's frame → world. */
  at(lx: number, y: number, lz: number): Vector3 {
    const p = toWorld({ x: this.house.x, z: this.house.z }, this.house.rot, lx, lz);
    return new Vector3(p.x, y, p.z);
  }

  /** World → the house's local (x, z). */
  local(p: Vector3): { x: number; z: number } {
    const dx = p.x - this.house.x;
    const dz = p.z - this.house.z;
    const c = Math.cos(this.house.rot);
    const s = Math.sin(this.house.rot);
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }

  /** True when a point (the player's feet) is inside the room. `margin` shrinks the room. */
  contains(p: Vector3, margin = 0): boolean {
    const l = this.local(p);
    const r = this.dims;
    return (
      l.x > r.x0 + margin &&
      l.x < r.x1 - margin &&
      l.z > r.zBack + margin &&
      l.z < r.zFront - margin &&
      p.y > r.floorY - 0.3 &&
      p.y < r.ceilingY
    );
  }

  /** "your home", "the Patils’ home", "the farmhands’ hut". */
  get label(): string {
    if (this.isHome) return 'your home';
    return `${this.family}’ ${this.house.kind === 'hut' ? 'hut' : 'home'}`;
  }
}

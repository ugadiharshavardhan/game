/**
 * Shelter from the moon: which house the player is in, and the walk through the door.
 *
 * Entering:  the door swings open → the player walks through the doorway (input locked, a real
 *            walk on the real colliders) → as they cross into the room the camera hands over to
 *            the interior shot, travelling through the doorway → the door swings shut. SAFE.
 * Leaving:   the camera hands back to the follow rig (already behind the player) → the door
 *            opens → the player walks out onto the veranda → the door shuts behind them.
 *
 * "Safe" is simply "standing in a shelter's room" — checked every frame from the player's
 * position, so it can never disagree with where the player actually is. Nothing here touches the
 * inventory or the run: going in and out preserves everything.
 */
import { Vector3 } from 'three';
import { EventBus } from '../../shared/EventBus';
import type { SoundKey } from '../audio/SoundFx';
import type { CameraShot } from '../camera/ThirdPersonCamera';
import { PLINTH_H } from '../world/village/dims';
import type { SafeHouse } from './SafeHouse';

/** What the shelter needs from the player. */
export interface ShelterActor {
  readonly feet: Vector3;
  walkTowards(x: number, z: number, speed: number): void;
  stopWalking(): void;
  readonly walkRemaining: number;
  setScripted(on: boolean): void;
  /** Failsafe for a walk that can't finish (something in the doorway): put the player there. */
  placeAt(point: Vector3, yaw: number): void;
}

/** What the shelter needs from the camera. */
/** A camera that can be taken off the player and given a shot to hold. */
export interface ScriptedCamera {
  setShot(shot: CameraShot | null, seconds: number, via?: readonly Vector3[]): void;
  setOrientation(yaw: number, pitch: number, immediate?: boolean): void;
}

export type ShelterCamera = ScriptedCamera;

export interface ShelterConfig {
  /** Walking pace through the doorway, m/s. */
  walkSpeed: number;
  /** Camera hand-over into the room, and back out, seconds. */
  cameraInTime: number;
  cameraOutTime: number;
  /** Interior shot: vertical FOV and the height it frames the player at. */
  interiorFov: number;
  lookHeight: number;
  /** Camera pitch the rig takes behind the player at the door. */
  doorPitchDeg: number;
}

export const DEFAULT_SHELTER_CONFIG: ShelterConfig = {
  walkSpeed: 1.45,
  cameraInTime: 1.3,
  cameraOutTime: 0.8,
  interiorFov: 64,
  lookHeight: 1.1,
  doorPitchDeg: 8,
};

type Step = (dt: number) => boolean;

const DEG = Math.PI / 180;

export class ShelterManager {
  /** The house whose room the player is standing in, or null outdoors. */
  current: SafeHouse | null = null;
  readonly houses: SafeHouse[] = [];

  private actor: ShelterActor | null = null;
  private camera: ShelterCamera | null = null;
  private steps: Step[] = [];
  private shotOwner: SafeHouse | null = null;
  private moonOut: () => boolean = () => false;
  private play: (key: SoundKey) => void = () => {};
  private readonly config: ShelterConfig;

  constructor(config: ShelterConfig = DEFAULT_SHELTER_CONFIG) {
    this.config = config;
  }

  add(house: SafeHouse): void {
    this.houses.push(house);
  }

  /** Connects the player, the camera, the moon and the sound once they exist. */
  attach(actor: ShelterActor, camera: ShelterCamera, moonOut: () => boolean, play: (key: SoundKey) => void): void {
    this.actor = actor;
    this.camera = camera;
    this.moonOut = moonOut;
    this.play = play;
  }

  get isSafe(): boolean {
    return this.current !== null;
  }

  /** True while a walk through a door is playing. */
  get busy(): boolean {
    return this.steps.length > 0;
  }

  moonIsOut(): boolean {
    return this.moonOut();
  }

  enter(house: SafeHouse): void {
    const a = this.actor;
    const cam = this.camera;
    if (!a || !cam || this.busy) return;
    const c = this.config;
    const i = house.interior;
    a.setScripted(true);
    cam.setOrientation(i.inwardYaw, c.doorPitchDeg * DEG);
    house.open();
    let handedOver = false;
    const walkIn = this.walk(i.inside, 0.04, i.inwardYaw);
    this.steps = [
      () => house.openness > 0.55,
      this.walk(i.threshold, 0.12, i.inwardYaw),
      (dt) => {
        if (!handedOver && i.contains(a.feet, 0.05)) {
          handedOver = true;
          // Through the doorway at head height, then up to the corner.
          const eye = PLINTH_H + 1.7;
          this.shotFor(house, c.cameraInTime, [new Vector3(i.threshold.x, eye, i.threshold.z), new Vector3(i.innerDoor.x, eye, i.innerDoor.z)]);
        }
        return walkIn(dt);
      },
      () => {
        a.stopWalking();
        house.close(() => this.play('door-close'));
        a.setScripted(false);
        return true;
      },
    ];
  }

  exit(house: SafeHouse): void {
    const a = this.actor;
    const cam = this.camera;
    if (!a || !cam || this.busy) return;
    const c = this.config;
    const i = house.interior;
    a.setScripted(true);
    // The rig swings round behind the player (still inside), then the view hands back to it.
    cam.setOrientation(i.outwardYaw, c.doorPitchDeg * DEG);
    cam.setShot(null, c.cameraOutTime);
    this.shotOwner = null;
    house.open();
    this.steps = [
      this.walk(i.innerDoor, 0.1, i.outwardYaw),
      () => house.openness > 0.55,
      this.walk(i.threshold, 0.12, i.outwardYaw),
      this.walk(i.outside, 0.05, i.outwardYaw),
      () => {
        a.stopWalking();
        house.close(() => this.play('door-close'));
        a.setScripted(false);
        return true;
      },
    ];
  }

  update(dt: number): void {
    for (const h of this.houses) h.update(dt);
    // Run the walk: each step returns true when done; several may finish in one frame.
    while (this.steps.length && this.steps[0](dt)) {
      this.steps.shift();
      dt = 0; // later steps start fresh this frame
    }

    const a = this.actor;
    if (!a) return;
    const inside = this.houses.find((h) => h.interior.contains(a.feet)) ?? null;
    if (inside !== this.current) {
      this.current = inside;
      EventBus.emit('ui:shelter', { inside: inside !== null, family: inside ? inside.interior.label : null });
    }
    // Arrived indoors some other way (a teleport, a respawn): frame the room anyway.
    if (!this.busy && this.camera) {
      if (inside && this.shotOwner !== inside) this.shotFor(inside, 0.35, []);
      if (!inside && this.shotOwner) {
        this.camera.setShot(null, 0.35);
        this.shotOwner = null;
      }
    }
  }

  /**
   * The moonlight overwhelmed the player outside: the nearest household opens its door and takes
   * them in. Returns whose home it was, or null if there is none to reach.
   */
  takeIndoors(at: Vector3): string | null {
    const a = this.actor;
    if (!a || !this.houses.length) return null;
    let best = this.houses[0];
    let bestD = Infinity;
    for (const h of this.houses) {
      const d = h.interior.outside.distanceToSquared(at);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    this.steps.length = 0;
    a.stopWalking();
    a.setScripted(false);
    a.placeAt(best.interior.inside, best.interior.inwardYaw);
    best.close();
    this.current = best;
    this.camera?.setOrientation(best.interior.outwardYaw, this.config.doorPitchDeg * DEG, true);
    this.shotFor(best, 0.45, []);
    EventBus.emit('ui:shelter', { inside: true, family: best.interior.label });
    return best.interior.label;
  }

  private shotFor(house: SafeHouse, seconds: number, via: Vector3[]): void {
    const c = this.config;
    this.camera?.setShot({ position: house.interior.cameraPoint, lookHeight: c.lookHeight, fov: c.interiorFov }, seconds, via);
    this.shotOwner = house;
  }

  /**
   * A step that walks to `to` and is done within `tolerance` metres. If something blocks the way
   * for far longer than the walk should take, the player is placed there — a doorway sequence
   * must never leave the player locked.
   */
  private walk(to: Vector3, tolerance: number, yaw: number): Step {
    let started = false;
    let elapsed = 0;
    let limit = 0;
    return (dt) => {
      const a = this.actor;
      if (!a) return true;
      if (!started) {
        a.walkTowards(to.x, to.z, this.config.walkSpeed);
        limit = 2 + (2.5 * a.walkRemaining) / this.config.walkSpeed;
        started = true;
      }
      elapsed += dt;
      if (a.walkRemaining <= tolerance) return true;
      if (elapsed > limit) {
        a.placeAt(to, yaw);
        return true;
      }
      return false;
    };
  }
}

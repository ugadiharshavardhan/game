/**
 * Standing still indoors should be standing still.
 *
 * The interior camera is a fixed point in the corner of the room looking at the player, so any
 * wobble in where the player actually is becomes a wobble of the whole room. This puts the real
 * controller on the real colliders inside every shelter, asks it to do nothing at all, and
 * measures how far it moves between frames.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { Vector2, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER_CONFIG } from '../config/playerConfig';
import type { Input } from '../core/Input';
import { Physics } from '../core/Physics';
import { PlayerController } from '../player/PlayerController';
import { PlayerState } from '../player/PlayerState';
import { buildColliders } from '../world/village/colliders';
import { VILLAGE } from '../world/village/layout';
import { buildLevel, type Level } from '../world/village/solids';
import { HouseInterior } from './HouseInterior';

const DT = 1 / 60;

let level: Level;

beforeAll(async () => {
  await RAPIER.init();
  level = buildLevel(VILLAGE);
});

/** The real controller, standing on the real village, with nothing pressed. */
function still(): { controller: PlayerController; step: () => void } {
  const physics = new Physics(RAPIER);
  buildColliders(VILLAGE, level, physics);
  physics.step(DT);
  const controller = new PlayerController(physics, DEFAULT_PLAYER_CONFIG, new PlayerState(), new Vector3(0, 0, 0), 0);
  const input = {
    move: new Vector2(0, 0),
    run: false,
    slow: false,
    crouchPressed: false,
    interactPressed: false,
    jumpPressed: false,
  } as unknown as Input;
  return { controller, step: () => { controller.update(DT, input, 0); physics.step(DT); } };
}

const shelters = VILLAGE.houses.filter((h) => h.shelter);

describe('standing still inside a shelter', () => {
  it.each(shelters.map((h) => [h.id, h] as const))('%s: the player does not wobble', (id, house) => {
    const interior = new HouseInterior(house);
    const { controller, step } = still();
    controller.teleport(interior.inside, interior.inwardYaw);

    // Half a second to settle onto the floor, then watch.
    for (let i = 0; i < 30; i++) step();
    const settled = controller.feet.clone();
    let worst = 0;
    let last = controller.feet.clone();
    for (let i = 0; i < 300; i++) {
      step();
      worst = Math.max(worst, controller.feet.distanceTo(last));
      last = controller.feet.clone();
    }

    // A tenth of a millimetre a frame is the noise floor of a kinematic solver; anything the eye
    // could see as a vibration is far larger than this.
    expect(worst, `${id}: worst frame-to-frame movement`).toBeLessThan(0.0005);
    expect(controller.feet.distanceTo(settled), `${id}: drift over five seconds`).toBeLessThan(0.01);
    expect(controller.grounded, `${id}: still on the floor`).toBe(true);
    expect(controller.airborne, `${id}: not airborne`).toBe(false);
  });
});

/**
 * Is one night long enough to do the thing the night asks for?
 *
 * The playthrough tests prove the village can be *walked* — every doorway wide enough, every step
 * low enough. This one asks the question that bounding the run created: with the clock running
 * from half past six to five, and the moon taking the player off the street three times on the
 * way, does a competent route still finish the puja with time in hand?
 *
 * It measures the route rather than playing it: the shortest walkable path between each stop on
 * the real navigation grid, which the playthrough tests have already shown is walkable. That is a
 * floor on the time the run costs, so the margin it reports is the most generous one available —
 * if even this does not fit, nothing a player does will.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER_CONFIG } from '../../config/playerConfig';
import { DEFAULT_MOON_CONFIG } from '../../moon/MoonState';
import { DEFAULT_NIGHT_CONFIG } from '../../night/NightClock';
import { INVENTORY_CAPACITY } from '../../../shared/items';
import { VILLAGE } from './layout';
import { buildNavGrid, distanceField, nearestFree, type NavGrid } from './navgrid';
import { buildLevel, type Level } from './solids';

let level: Level;
let grid: NavGrid;

beforeAll(async () => {
  await RAPIER.init();
  level = buildLevel(VILLAGE);
  grid = buildNavGrid(VILLAGE, level);
});

/**
 * Metres along the navigation grid from one point to every other. One sweep answers every
 * "how far is that from here?" at once, which is what keeps this test seconds rather than minutes.
 */
function distancesFrom(from: { x: number; z: number }) {
  const field = distanceField(grid, nearestFree(grid, from.x, from.z, 2.2));
  return (to: { x: number; z: number }) => {
    const d = field[nearestFree(grid, to.x, to.z, 2.2)];
    if (!Number.isFinite(d)) throw new Error(`no route from (${from.x}, ${from.z}) to (${to.x}, ${to.z})`);
    return d;
  };
}

/** How many moonrises finish inside `seconds` of playable night, given the cycle's timings. */
export function moonrisesIn(seconds: number, m: typeof DEFAULT_MOON_CONFIG): number {
  const moon = m.durations.warning + m.durations.rising + m.durations.active + m.durations.fading;
  let count = 0;
  // The first cloudy stretch is its own length; every one after it is the configured `safe`.
  for (let t = m.firstSafe + moon; t <= seconds; t += m.durations.safe + moon) count++;
  return count;
}

/**
 * A sensible route: always walk to the nearest offering not yet taken, and carry the bag to the
 * temple whenever the next thing would not fit in it. Not the optimum — a player would not find
 * the optimum either — but the shape of the route anybody would actually walk.
 */
function greedyRoute(): { metres: number; trips: number; stops: number } {
  const temple = level.templeOffer;
  const left = VILLAGE.offerings.map((o) => ({ ...o }));
  let at: { x: number; z: number } = level.spawn;
  let carrying = 0;
  let metres = 0;
  let trips = 0;
  let stops = 0;

  while (left.length) {
    const distance = distancesFrom(at);
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = distance(left[i]);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    const next = left[bestIndex];
    // The bag would overflow: take what is in it to Bappa first.
    if (carrying + next.quantity > INVENTORY_CAPACITY) {
      metres += distance(temple);
      at = temple;
      carrying = 0;
      trips++;
      continue;
    }
    metres += bestDistance;
    at = next;
    carrying += next.quantity;
    stops++;
    left.splice(bestIndex, 1);
  }
  metres += distancesFrom(at)(temple);
  trips++;
  return { metres, trips, stops };
}

describe('the night is long enough to finish the puja in', () => {
  it('a sensible route fits inside one night, with the moon taking its share of it', () => {
    const route = greedyRoute();
    const c = DEFAULT_PLAYER_CONFIG;
    const n = DEFAULT_NIGHT_CONFIG;
    const m = DEFAULT_MOON_CONFIG;

    // Running the whole way, which nobody does, but which is what the route costs at its cheapest.
    const walking = route.metres / c.runSpeed;
    // Every stop is a pickup animation, and every trip to the temple is an offering.
    const handling = route.stops * 1.5 + route.trips * 2;

    // What the moon takes off the street: every moonrise costs the stretch from the disc clearing
    // the hills to the last of the fading. The warning before it is spent running for a door, so
    // it is not lost time.
    const playable = n.seconds * (n.dawn - n.evening);
    const moonrises = moonrisesIn(playable, m);
    const hiding = moonrises * (m.durations.rising + m.durations.active + m.durations.fading);

    const needed = walking + handling + hiding;
    const share = needed / n.seconds;

    // Measured on the village as it stands: a 642 m route over 3 trips to the temple, 128 s of
    // running, 30 s of picking things up and 273 s spent indoors under three moons — 431 s of the
    // night's 900, with 469 s of slack for a player who has never seen the place before.
    expect(moonrises, 'three moonrises in a night is the rhythm the cycle was retimed for').toBe(3);
    expect(needed, `route ${Math.round(route.metres)} m over ${route.trips} trips`).toBeLessThan(n.seconds);

    // The shape the night should have: a competent run uses a good half of it and finishes with
    // time in hand, so 05:00 is a real deadline for a player who fumbles and no threat to one who
    // does not. Both ends of this are a guard: shrink the night, or grow the village, and it fires.
    expect(share, 'a competent route uses a real share of the night').toBeGreaterThan(0.4);
    expect(share, 'and still leaves room to get caught out and recover').toBeLessThan(0.8);
  }, 120_000);

  it('cannot be finished without the bag going back to the temple more than once', () => {
    const route = greedyRoute();
    expect(route.trips, 'the puja asks for more than the bag holds').toBeGreaterThan(1);
    expect(route.stops).toBe(VILLAGE.offerings.length);
  }, 120_000);
});

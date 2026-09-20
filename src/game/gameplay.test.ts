/**
 * The run's rules working together: the moon drains an exposed player, a failure drops half the
 * bag where they stand (never all of it), the fallen offerings can be picked up again, and the
 * temple takes what the puja needs.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { DirectionalLight, Vector3 } from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EventBus } from '../shared/EventBus';
import { ITEM_IDS, ITEMS } from '../shared/items';
import { Physics } from './core/Physics';
import { Gameplay, type GameplayActor } from './Gameplay';
import { DEFAULT_NIGHT_CONFIG, type NightConfig } from './night/NightClock';
import type { IInteractable } from './interaction/IInteractable';
import type { PlayerAction } from './player/PlayerAnimation';
import { DroppedOfferings, TempleAltar } from './world/village/interactables';
import type { World } from './world/World';

beforeAll(async () => {
  await RAPIER.init();
});
afterEach(() => EventBus.clear());

const DT = 1 / 30;

function setup(open = true, night: NightConfig = DEFAULT_NIGHT_CONFIG) {
  const physics = new Physics(RAPIER);
  physics.addBox(new Vector3(0, -0.5, 0), new Vector3(40, 1, 40));
  const gameplay = new Gameplay(physics, null, null, 1, undefined, night);
  const services = gameplay.services;
  const altar = new TempleAltar(new Vector3(0, 0, 8), gameplay.inventory, services.onPray, services.onPujaComplete);
  const drops: IInteractable[] = [];
  const world: World = {
    interactables: [altar],
    shelter: null,
    spawn: new Vector3(),
    spawnYaw: 0,
    sun: new DirectionalLight(),
    follow() {},
    isOpenGround: () => open,
    isCovered: () => false,
    shelterDistance: () => 12,
    dropOfferings(at, stacks, onEmpty) {
      const d = new DroppedOfferings(at, stacks, gameplay.inventory, (x) => onEmpty(x));
      drops.push(d);
      return d;
    },
    dispose() {},
  };
  const actions: PlayerAction[] = [];
  const player: GameplayActor = {
    feet: new Vector3(0, 0, 0),
    yaw: 0,
    gait: 'normal',
    playAction(action, contact, done) {
      actions.push(action);
      contact();
      done();
    },
    setBusy() {},
    faceTowards() {},
    walkTowards() {},
    stopWalking() {},
    walkRemaining: 0,
    setScripted() {},
    placeAt() {},
  };
  gameplay.start(world, player, { setShot() {}, setOrientation() {} }, null);
  const frame = (interact = false) => {
    physics.step(DT);
    gameplay.update(DT, interact);
  };
  return { gameplay, player, drops, frame, altar, actions };
}

describe('Gameplay', () => {
  it('a failure under the moon drops half the bag where you stand — and you can pick it up again', () => {
    const { gameplay, player, drops, frame } = setup();
    const inv = gameplay.inventory;
    inv.add('flowers', 3);
    inv.add('durva', 2);
    inv.add('coconut', 1);
    inv.add('bananas', 4);
    const toasts: string[] = [];
    EventBus.on('ui:toast', ({ text }) => toasts.push(text));

    gameplay.moon.skipTo('active');
    let t = 0;
    while (!drops.length && t < 30) {
      frame();
      t += DT;
    }
    expect(drops, 'overwhelmed on open ground within the moonlight').toHaveLength(1);
    // A few offerings, not the bag: three of the ten.
    expect(inv.used).toBe(7);
    expect(gameplay.exposure.value).toBe(0);
    expect(toasts.some((x) => x.includes('overwhelms you'))).toBe(true);

    // Clouds cover the moon; walk back to the bundle and collect it.
    gameplay.moon.skipTo('safe');
    player.feet.set(0, 0, -0.9); // facing +z toward where it fell
    frame();
    frame(true);
    expect(inv.used).toBe(10);
    frame();
    expect(gameplay.interaction.target, 'the bundle is gone once emptied').toBeNull();
  });

  it('nothing drains, and nothing drops, while the clouds cover the moon', () => {
    const { gameplay, drops, frame } = setup();
    gameplay.inventory.add('modak', 5);
    for (let i = 0; i < 60 / DT; i++) frame();
    expect(drops).toHaveLength(0);
    expect(gameplay.exposure.value).toBe(0);
  });

  it('at the temple: offering moves what the puja needs, and prayer restores purity', () => {
    const { gameplay, player, frame, actions } = setup();
    gameplay.inventory.add('modak', 5);
    gameplay.inventory.add('rice', 2);
    gameplay.exposure.value = 30;
    player.feet.set(0, 0, 6.5);
    frame();
    expect(gameplay.interaction.target?.id).toBe('temple:altar');
    frame(true);
    expect(actions).toEqual(['Celebrate']);
    expect(gameplay.inventory.used).toBe(0);
    expect(gameplay.inventory.offered('modak')).toBe(5);
    expect(gameplay.exposure.value).toBe(0);
  });

  it('holds the moon back through the evening, then lets the night have it', () => {
    const { gameplay, frame } = setup();
    // A quarter of the first safe stretch in: still the evening, so the cycle has not begun.
    for (let i = 0; i < 40 / DT; i++) frame();
    expect(gameplay.night.phase).toBe('evening');
    expect(gameplay.moon.state).toBe('safe');
    expect(gameplay.moon.progress, 'the moon clock has not turned at all').toBe(0);

    // Past the evening, and the first safe stretch begins to run down.
    for (let i = 0; i < 80 / DT; i++) frame();
    expect(gameplay.night.phase).toBe('night');
    expect(gameplay.moon.progress).toBeGreaterThan(0);
  });

  it('ends the run at five o’clock, scored as unfinished', () => {
    // A ten-second night: the same clock, wound tight, so the test does not play one.
    const { gameplay, frame } = setup(false, { ...DEFAULT_NIGHT_CONFIG, seconds: 10 });
    gameplay.inventory.add('modak', 4);
    const results: { stats: { pujaComplete: boolean; itemsCollected: number }; breakdown: { completion: number; timeBonus: number } }[] = [];
    EventBus.on('run:completed', (r) => results.push(r));

    for (let i = 0; i < 11 / DT; i++) frame();

    expect(results, 'dawn ends the run').toHaveLength(1);
    expect(results[0].stats.pujaComplete).toBe(false);
    expect(results[0].breakdown.completion, 'the puja is worth nothing it did not finish').toBe(0);
    expect(results[0].breakdown.timeBonus, 'nor is being quick about not finishing').toBe(0);

    // And it ends exactly once, however many frames follow.
    for (let i = 0; i < 60; i++) frame();
    expect(results).toHaveLength(1);
  });

  it('never raises another moon once the sky has begun to lighten', () => {
    const { gameplay, frame } = setup(false, { ...DEFAULT_NIGHT_CONFIG, seconds: 60, evening: 0, dawn: 0.2, ends: false });
    // Well past dawn, with a full moon cycle's worth of time to try to rise in.
    for (let i = 0; i < 55 / DT; i++) frame();
    expect(gameplay.night.phase).toBe('dawn');
    expect(gameplay.moon.state).toBe('safe');
    expect(gameplay.moon.dangerous).toBe(false);
    expect(gameplay.moonFrame().retired).toBe(true);
    expect(gameplay.moonFrame().dawn).toBeGreaterThan(0.9);
  });

  it('a finished puja is scored as one, and is worth what dawn is not', () => {
    const { gameplay, player, frame } = setup(false);
    const results: { stats: { pujaComplete: boolean }; breakdown: { completion: number } }[] = [];
    EventBus.on('run:completed', (r) => results.push(r));
    // The bag holds fifteen and the puja asks for more, so it takes trips — as it does in play.
    player.feet.set(0, 0, 6.5);
    for (let trip = 0; trip < 10 && !gameplay.inventory.snapshot().pujaComplete; trip++) {
      for (const id of ITEM_IDS) gameplay.inventory.add(id, ITEMS[id].required);
      frame();
      frame(true);
    }

    expect(gameplay.inventory.snapshot().pujaComplete, 'every offering is before Bappa').toBe(true);
    expect(results, 'the closing sequence ends the run').toHaveLength(1);
    expect(results[0].stats.pujaComplete).toBe(true);
    expect(results[0].breakdown.completion).toBeGreaterThan(0);
  });

  it('the bag being open holds the action button', () => {
    const { gameplay, player, frame } = setup();
    gameplay.inventory.add('rice', 2);
    player.feet.set(0, 0, 6.5);
    EventBus.emit('game:inventory-open', { open: true });
    frame();
    frame(true);
    expect(gameplay.inventory.offered('rice')).toBe(0);
    EventBus.emit('game:inventory-open', { open: false });
    frame(true);
    expect(gameplay.inventory.offered('rice')).toBe(2);
  });
});

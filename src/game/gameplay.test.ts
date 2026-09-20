/**
 * The run's rules working together: the moon drains an exposed player, a failure empties the bag
 * (what is already before Bappa stays there; the rest is gathered again), and the temple takes
 * what the puja needs.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { DirectionalLight, Vector3 } from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EventBus } from '../shared/EventBus';
import { ITEM_IDS, ITEMS } from '../shared/items';
import { Physics } from './core/Physics';
import { Gameplay, type GameplayActor } from './Gameplay';
import { DEFAULT_NIGHT_CONFIG, type NightConfig } from './night/NightClock';
import type { PlayerAction } from './player/PlayerAnimation';
import { PujaItem } from './items/PujaItem';
import { TempleAltar } from './world/village/interactables';
import { VILLAGE } from './world/village/layout';
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
  // The village's own offering spots, on the run's own bag — so what a failure restocks is real.
  const spots = VILLAGE.offerings.map((o) => new PujaItem(o, gameplay.inventory, null));
  const world: World = {
    interactables: [altar, ...spots],
    shelter: null,
    spawn: new Vector3(),
    spawnYaw: 0,
    sun: new DirectionalLight(),
    follow() {},
    isOpenGround: () => open,
    isCovered: () => false,
    shelterDistance: () => 12,
    restockOfferings() {
      const offered = gameplay.inventory.snapshot().offered;
      for (const spot of spots) if (offered[spot.itemId] < spot.requiredQuantity) spot.restock();
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
  return { gameplay, player, spots, frame, altar, actions };
}

describe('Gameplay', () => {
  /** Runs the moon over an exposed player until their strength is spent. */
  const collapse = (gameplay: Gameplay, frame: () => void) => {
    gameplay.moon.skipTo('active');
    let t = 0;
    while (gameplay.health.collapses === 0 && t < 90) {
      frame();
      t += DT;
    }
    expect(gameplay.health.collapses, 'overwhelmed on open ground under the moon').toBe(1);
  };

  it('when strength runs out the bag is empty, and nothing is left on the ground', () => {
    const { gameplay, frame } = setup();
    const inv = gameplay.inventory;
    inv.add('flowers', 3);
    inv.add('durva', 2);
    inv.add('coconut', 1);
    inv.add('bananas', 4);
    const toasts: string[] = [];
    EventBus.on('ui:toast', ({ text }) => toasts.push(text));

    collapse(gameplay, frame);

    expect(inv.used, 'everything that was carried is gone').toBe(0);
    expect(inv.items).toHaveLength(0);
    expect(gameplay.health.value, 'and they come round with something left').toBeGreaterThan(0);
    expect(gameplay.exposure.value).toBe(0);
    expect(toasts.some((x) => x.includes('overwhelms you') && x.includes('gather'))).toBe(true);
  });

  it('what was already offered stays at the temple; what came after has to be gathered again', () => {
    const { gameplay, player, spots, frame } = setup();
    const inv = gameplay.inventory;

    // A first trip, offered: five flowers and two of the durva are before Bappa.
    inv.add('flowers', 5);
    inv.add('durva', 2);
    player.feet.set(0, 0, 6.5);
    frame();
    frame(true);
    expect(inv.offered('flowers')).toBe(5);
    expect(inv.offered('durva')).toBe(2);

    // A second trip, collected from the village itself, and then the moon catches them.
    const bananas = spots.find((s) => s.itemId === 'bananas') as PujaItem;
    const durva = spots.find((s) => s.itemId === 'durva' && s.currentQuantity > 0) as PujaItem;
    bananas.interact({} as never);
    durva.interact({} as never);
    expect(inv.count('bananas')).toBeGreaterThan(0);
    const before = { bananas: bananas.currentQuantity, durva: durva.currentQuantity };
    expect(before.bananas, 'the bananas were taken from where they lay').toBeLessThan(bananas.initialQuantity);

    player.feet.set(0, 0, -20);
    collapse(gameplay, frame);

    expect(inv.used, 'the second trip is gone').toBe(0);
    expect(inv.offered('flowers'), 'the first trip is not').toBe(5);
    expect(inv.offered('durva')).toBe(2);
    expect(bananas.currentQuantity, 'the bananas are back where they were found').toBe(bananas.initialQuantity);
    expect(inv.wanted('bananas'), 'and wanted again, from the start').toBeGreaterThan(0);
  });

  it('does not put back what Bappa already has in full', () => {
    const { gameplay, player, spots, frame } = setup();
    const inv = gameplay.inventory;
    inv.add('coconut', 1);
    player.feet.set(0, 0, 6.5);
    frame();
    frame(true);
    expect(inv.offered('coconut')).toBe(1);

    const coconut = spots.find((s) => s.itemId === 'coconut') as PujaItem;
    coconut.currentQuantity = 0; // taken earlier
    player.feet.set(0, 0, -20);
    inv.add('rice', 2);
    collapse(gameplay, frame);
    expect(coconut.currentQuantity, 'the coconut is done with; nothing to restock').toBe(0);
  });

  it('losing the bag is not a way to be paid for the same things twice', () => {
    const { gameplay, frame } = setup();
    const before = gameplay.run.stats.itemsCollected;
    gameplay.run.collected(6);
    gameplay.inventory.add('flowers', 5);
    gameplay.inventory.add('durva', 1);
    collapse(gameplay, frame);
    expect(gameplay.run.stats.itemsCollected, 'they no longer count as gathered').toBe(before);
    expect(gameplay.run.stats.itemsLost).toBe(6);
  });

  it('nothing drains, and nothing is lost, while the clouds cover the moon', () => {
    const { gameplay, frame } = setup();
    gameplay.inventory.add('modak', 5);
    for (let i = 0; i < 60 / DT; i++) frame();
    expect(gameplay.inventory.used).toBe(5);
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
    expect(actions).toEqual(['Pranam']);
    expect(gameplay.inventory.used).toBe(0);
    expect(gameplay.inventory.offered('modak')).toBe(5);
    expect(gameplay.exposure.value).toBe(0);
  });

  it('the moonlight takes your strength, and only a roof gives it back', () => {
    const { gameplay, frame } = setup();
    expect(gameplay.health.value).toBe(100);

    // Out in the open under a risen moon.
    gameplay.moon.skipTo('active');
    for (let i = 0; i < 5 / DT; i++) frame();
    const hurt = gameplay.health.value;
    expect(hurt, 'it falls').toBeLessThan(100);
    expect(gameplay.health.draining).toBe(true);

    // The clouds come back, but the player is still outside: it holds where it is.
    gameplay.moon.skipTo('safe');
    for (let i = 0; i < 10 / DT; i++) frame();
    expect(gameplay.health.value, 'the open air mends nobody').toBe(hurt);
    expect(gameplay.health.draining).toBe(false);
    expect(gameplay.exposure.value, 'exposure, by contrast, does clear outdoors').toBe(0);
  });

  it('it is strength running out that empties the bag, not the exposure meter filling', () => {
    const { gameplay, frame } = setup();
    gameplay.inventory.add('flowers', 3);
    gameplay.inventory.add('bananas', 4);
    gameplay.moon.skipTo('active');

    // Exposure fills first and pins there; nothing is lost for it.
    let t = 0;
    while (gameplay.exposure.value < 100 && t < 40) {
      frame();
      t += DT;
    }
    expect(gameplay.exposure.value).toBe(100);
    expect(gameplay.inventory.used, 'a full exposure meter is a warning, not a failure').toBe(7);
    expect(gameplay.health.value).toBeGreaterThan(0);

    // Strength runs out a little later, and that is what costs you.
    while (gameplay.health.collapses === 0 && t < 60) {
      frame();
      t += DT;
    }
    expect(gameplay.inventory.used).toBe(0);
    expect(gameplay.health.value, 'and you come round with something left').toBeGreaterThan(0);
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

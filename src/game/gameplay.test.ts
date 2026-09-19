/**
 * The run's rules working together: the moon drains an exposed player, a failure drops half the
 * bag where they stand (never all of it), the fallen offerings can be picked up again, and the
 * temple takes what the puja needs.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { DirectionalLight, Vector3 } from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EventBus } from '../shared/EventBus';
import { Physics } from './core/Physics';
import { Gameplay, type GameplayActor } from './Gameplay';
import type { IInteractable } from './interaction/IInteractable';
import type { PlayerAction } from './player/PlayerAnimation';
import { DroppedOfferings, TempleAltar } from './world/village/interactables';
import type { World } from './world/World';

beforeAll(async () => {
  await RAPIER.init();
});
afterEach(() => EventBus.clear());

const DT = 1 / 30;

function setup(open = true) {
  const physics = new Physics(RAPIER);
  physics.addBox(new Vector3(0, -0.5, 0), new Vector3(40, 1, 40));
  const gameplay = new Gameplay(physics, null, 1);
  const altar = new TempleAltar(new Vector3(0, 0, 8), gameplay.inventory, gameplay.services.onPray);
  const drops: IInteractable[] = [];
  const world: World = {
    interactables: [altar],
    shelter: null,
    spawn: new Vector3(),
    spawnYaw: 0,
    sun: new DirectionalLight(),
    follow() {},
    isOpenGround: () => open,
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

    gameplay.moon.skipTo('moonlight');
    let t = 0;
    while (!drops.length && t < 30) {
      frame();
      t += DT;
    }
    expect(drops, 'overwhelmed on open ground within the moonlight').toHaveLength(1);
    expect(inv.used).toBe(5);
    expect(gameplay.purity.value).toBeGreaterThan(0);
    expect(toasts.some((x) => x.includes('fell where you stood'))).toBe(true);

    // Clouds cover the moon; walk back to the bundle and collect it.
    gameplay.moon.skipTo('day');
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
    expect(gameplay.purity.value).toBe(100);
  });

  it('at the temple: offering moves what the puja needs, and prayer restores purity', () => {
    const { gameplay, player, frame, actions } = setup();
    gameplay.inventory.add('modak', 5);
    gameplay.inventory.add('rice', 2);
    gameplay.purity.value = 30;
    player.feet.set(0, 0, 6.5);
    frame();
    expect(gameplay.interaction.target?.id).toBe('temple:altar');
    frame(true);
    expect(actions).toEqual(['Celebrate']);
    expect(gameplay.inventory.used).toBe(0);
    expect(gameplay.inventory.offered('modak')).toBe(5);
    expect(gameplay.purity.value).toBe(100);
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

import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EventBus } from '../../shared/EventBus';
import type { PromptInfo } from '../../shared/events';
import type { SoundKey } from '../audio/SoundFx';
import { Physics } from '../core/Physics';
import { InventorySystem } from '../inventory/InventorySystem';
import { PujaItem, type PujaItemVisual } from '../items/PujaItem';
import { PlayerAction } from '../player/CharacterAnimationController';
import type { OfferingSpotDef } from '../world/village/types';
import type { IInteractable, InteractionActor, PromptText } from './IInteractable';
import { InteractionSystem } from './InteractionSystem';

beforeAll(async () => {
  await RAPIER.init();
});
afterEach(() => EventBus.clear());

/** A player stand-in: plays actions instantly (contact, then done) unless told to hold. */
function actor(x = 0, z = 0, yaw = 0) {
  const a = {
    feet: new Vector3(x, 0, z),
    yaw,
    busy: false,
    held: null as null | { contact: () => void; done: () => void },
    hold: false,
    actions: [] as PlayerAction[],
    playAction(action: PlayerAction, contact: () => void, done: () => void) {
      a.actions.push(action);
      if (a.hold) a.held = { contact, done };
      else {
        contact();
        done();
      }
    },
    setBusy(b: boolean) {
      a.busy = b;
    },
    faceTowards() {},
  };
  return a satisfies InteractionActor & Record<string, unknown>;
}

function thing(id: string, at: Vector3, o: Partial<{ priority: number; enabled: boolean; own: IInteractable['ownColliders']; action: PlayerAction | null }> = {}): IInteractable & { uses: number } {
  return {
    id,
    kind: 'item',
    position: at,
    promptAnchor: at.clone().setY(at.y + 0.6),
    interactRadius: 1.6,
    priority: o.priority ?? 2,
    ownColliders: o.own,
    uses: 0,
    isAvailable: () => true,
    prompt: (): PromptText => ({ verb: 'Use', mobileVerb: 'USE', detail: id, enabled: o.enabled ?? true, note: o.enabled === false ? 'Not now' : undefined }),
    action: () => (o.action === undefined ? PlayerAction.Pickup : o.action),
    sound: (): SoundKey => 'collect',
    interact() {
      this.uses++;
    },
  };
}

/**
 * A physics world with a floor and the system. Rapier indexes new colliders on its next step (the
 * game steps every frame), so `update` here steps first — as the previous frame would have.
 */
function world() {
  const physics = new Physics(RAPIER);
  physics.addBox(new Vector3(0, -0.5, 0), new Vector3(40, 1, 40));
  const played: SoundKey[] = [];
  const sys = new InteractionSystem(physics, { play: (k) => played.push(k) });
  const update = sys.update.bind(sys);
  sys.update = (dt, a, camera) => {
    physics.step(dt);
    update(dt, a, camera);
  };
  return { physics, sys, played };
}

describe('InteractionSystem', () => {
  it('finds what is in reach and in front, through its trigger volume', () => {
    const { sys } = world();
    const near = thing('near', new Vector3(0, 0, 1.2));
    const far = thing('far', new Vector3(0, 0, 4));
    sys.register(near);
    sys.register(far);
    sys.update(1 / 60, actor(), null);
    expect(sys.target).toBe(near);
  });

  it('reaches things on a counter as well as at your feet', () => {
    const { sys } = world();
    const counter = thing('counter', new Vector3(0, 0.92, 1.1));
    sys.register(counter);
    sys.update(1 / 60, actor(), null);
    expect(sys.target).toBe(counter);
  });

  it('never targets something behind the player', () => {
    const { sys } = world();
    sys.register(thing('behind', new Vector3(0, 0, -1.2)));
    sys.update(1 / 60, actor(0, 0, 0), null);
    expect(sys.target).toBeNull();
  });

  it('never targets through a wall', () => {
    const { physics, sys } = world();
    physics.addBox(new Vector3(0, 1.5, 0.7), new Vector3(4, 3, 0.2));
    sys.register(thing('beyond the wall', new Vector3(0, 0, 1.3)));
    sys.update(1 / 60, actor(), null);
    expect(sys.target).toBeNull();
  });

  it('an object never blocks the view of itself (a door)', () => {
    const { physics, sys } = world();
    const door = physics.addBox(new Vector3(0, 1.05, 1.0), new Vector3(1.1, 2.1, 0.3));
    sys.register(thing('door', new Vector3(0, 0, 1.0), { own: [door] }));
    sys.update(1 / 60, actor(), null);
    expect(sys.target?.id).toBe('door');
  });

  it('priority wins among things in reach — unless you are clearly facing the other', () => {
    const { sys } = world();
    const item = thing('item', new Vector3(0.5, 0, 1.1), { priority: 2 });
    const door = thing('door', new Vector3(0, 0, 0.9), { priority: 1 });
    sys.register(item);
    sys.register(door);
    sys.update(1 / 60, actor(), null);
    expect(sys.target).toBe(item);

    // Face the door squarely with the item well off to the side and behind the shoulder.
    const { sys: sys2 } = world();
    const side = thing('item', new Vector3(1.4, 0, -0.2), { priority: 2 });
    const ahead = thing('door', new Vector3(0, 0, 0.6), { priority: 1 });
    sys2.register(side);
    sys2.register(ahead);
    sys2.update(1 / 60, actor(), null);
    expect(sys2.target).toBe(ahead);
  });

  it('holds its choice between two equal candidates (no prompt flicker)', () => {
    const { sys } = world();
    const a = thing('a', new Vector3(-0.3, 0, 1.2));
    const b = thing('b', new Vector3(0.3, 0, 1.2));
    sys.register(a);
    sys.register(b);
    const p = actor(-0.05);
    sys.update(1 / 60, p, null);
    const first = sys.target;
    // Drift a little past the midpoint: the first choice stays.
    p.feet.x = 0.08;
    sys.update(1 / 60, p, null);
    expect(sys.target).toBe(first);
  });

  it('runs animation → contact (sound, interact) → done, busy meanwhile, never twice at once', () => {
    const { sys, played } = world();
    const t = thing('t', new Vector3(0, 0, 1));
    sys.register(t);
    const p = actor();
    p.hold = true;
    sys.update(1 / 60, p, null);
    expect(sys.tryBegin(p)).toBe(true);
    expect(p.busy).toBe(true);
    expect(p.actions).toEqual([PlayerAction.Pickup]);
    expect(sys.tryBegin(p)).toBe(false);
    expect(t.uses).toBe(0);
    p.held?.contact();
    expect(t.uses).toBe(1);
    expect(played).toEqual(['collect']);
    p.held?.done();
    expect(p.busy).toBe(false);
    expect(sys.active).toBeNull();
  });

  it('a greyed-out prompt says why, and does nothing', () => {
    const { sys, played } = world();
    const t = thing('t', new Vector3(0, 0, 1), { enabled: false });
    sys.register(t);
    const toasts: string[] = [];
    EventBus.on('ui:toast', ({ text }) => toasts.push(text));
    const p = actor();
    sys.update(1 / 60, p, null);
    expect(sys.tryBegin(p)).toBe(false);
    expect(t.uses).toBe(0);
    expect(played).toEqual(['deny']);
    expect(toasts).toEqual(['Not now']);
  });

  it('publishes the prompt when it changes, and its screen position every frame', () => {
    const { sys } = world();
    const prompts: (PromptInfo | null)[] = [];
    const positions: { x: number; y: number; visible: boolean }[] = [];
    EventBus.on('ui:prompt', (p) => prompts.push(p));
    EventBus.on('ui:prompt-position', (p) => positions.push(p));
    sys.register(thing('t', new Vector3(0, 0, 1.2)));
    const camera = new PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 1.8, -3);
    camera.lookAt(0, 1, 1);
    camera.updateMatrixWorld();
    const p = actor();
    for (let i = 0; i < 5; i++) sys.update(1 / 60, p, camera);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.verb).toBe('Use');
    expect(positions).toHaveLength(5);
    expect(positions[0].visible).toBe(true);
    expect(positions[0].x).toBeCloseTo(0.5, 1);
    p.feet.z = -6;
    sys.update(1 / 60, p, camera);
    expect(prompts.at(-1)).toBeNull();
  });

  it('unregistering removes it (a dropped bundle, picked up)', () => {
    const { sys } = world();
    const t = thing('t', new Vector3(0, 0, 1));
    sys.register(t);
    sys.update(1 / 60, actor(), null);
    expect(sys.target).toBe(t);
    sys.unregister(t);
    sys.update(1 / 60, actor(), null);
    expect(sys.target).toBeNull();
    expect(() => sys.register(t)).not.toThrow();
  });
});

describe('PujaItem through the interaction system', () => {
  const spot = (quantity: number, y = 0): OfferingSpotDef => ({ id: 'test-bananas', item: 'bananas', quantity, x: 0, z: 1.1, y, surface: y > 0 ? 'stall' : 'ground', rot: 0, tags: [] });

  function setup(quantity: number, y = 0) {
    const { physics, sys, played } = world();
    const inventory = new InventorySystem();
    const item = new PujaItem(spot(quantity, y), inventory, physics);
    const seen: number[] = [];
    const visual: PujaItemVisual = { setHighlight: () => {}, setRemaining: (left) => seen.push(left), update: () => {} };
    item.visual = visual;
    sys.register(item);
    return { sys, item, inventory, played, seen };
  }

  it('has the brief’s properties and a collider', () => {
    const { item } = setup(4);
    expect(item.itemId).toBe('bananas');
    expect(item.itemName).toBe('Bananas');
    expect(item.requiredQuantity).toBe(4);
    expect(item.currentQuantity).toBe(4);
    expect(item.worldPosition.toArray()).toEqual([0, 0, 1.1]);
    expect(item.icon).toBe('🍌');
    expect(item.ownColliders).toHaveLength(1);
    expect(item.pickupPoint.y).toBeGreaterThan(item.worldPosition.y);
  });

  it('collecting puts it in the bag, with its chime and its own sound', () => {
    const { sys, item, inventory, played, seen } = setup(4);
    const p = actor();
    sys.update(1 / 60, p, null);
    expect(sys.target).toBe(item);
    expect(sys.tryBegin(p)).toBe(true);
    expect(p.actions).toEqual([PlayerAction.Pickup]);
    expect(inventory.count('bananas')).toBe(4);
    expect(item.currentQuantity).toBe(0);
    expect(seen).toEqual([0]);
    expect(played).toEqual(['collect', 'rustle']);
    sys.update(1 / 60, p, null);
    expect(sys.target, 'a collected item has no prompt').toBeNull();
  });

  it('reaches out for a stall rather than bending down', () => {
    const { sys } = setup(2, 0.9);
    const p = actor();
    sys.update(1 / 60, p, null);
    sys.tryBegin(p);
    expect(p.actions).toEqual([PlayerAction.Interact]);
  });

  it('a nearly full bag takes what fits and leaves the rest', () => {
    const { sys, item, inventory } = setup(4);
    inventory.add('diya', 5);
    inventory.add('modak', 5);
    inventory.add('flowers', 3);
    const p = actor();
    sys.update(1 / 60, p, null);
    const prompt = item.prompt();
    expect(prompt.enabled).toBe(true);
    expect(prompt.detail).toContain('room for 2');
    sys.tryBegin(p);
    expect(inventory.count('bananas')).toBe(2);
    expect(item.currentQuantity).toBe(2);
    expect(inventory.used).toBe(15);
  });

  it('a full bag greys the prompt out and explains', () => {
    const { item, inventory } = setup(4);
    inventory.add('diya', 5);
    inventory.add('modak', 5);
    inventory.add('flowers', 5);
    const prompt = item.prompt();
    expect(prompt.enabled).toBe(false);
    expect(prompt.note).toMatch(/bag is full/);
  });
});

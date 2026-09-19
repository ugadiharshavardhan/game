/**
 * The run's rules, in one place: the bag, the moon, purity, interaction and shelter — and the
 * events that tell React about them. Owned by the Engine for the whole run; the world and the
 * player come and go around it (a house interior never rebuilds the bag).
 *
 * Frame order: moon → interaction (+ the action button) → shelter walk → purity.
 */
import type { Camera } from 'three';
import { EventBus } from '../shared/EventBus';
import { describeStacks } from '../shared/items';
import type { MoonPhase } from '../shared/types';
import type { SoundFx, SoundKey } from './audio/SoundFx';
import type { Physics } from './core/Physics';
import type { IInteractable, InteractionActor } from './interaction/IInteractable';
import { InteractionSystem } from './interaction/InteractionSystem';
import { InventorySystem } from './inventory/InventorySystem';
import { DEFAULT_MOON_CONFIG, MoonCycle, type MoonCycleConfig } from './moon/MoonCycle';
import { PuritySystem } from './moon/PuritySystem';
import type { ShelterActor, ShelterCamera } from './shelter/ShelterManager';
import type { World, WorldServices } from './world/World';

const PHASE_TOAST: Partial<Record<MoonPhase, { text: string; tone: 'info' | 'warn' | 'good' }>> = {
  dusk: { text: 'The clouds are thinning…', tone: 'info' },
  moonrise: { text: 'The moon is rising — get indoors!', tone: 'warn' },
  moonset: { text: 'Clouds cover the moon again', tone: 'good' },
};

const PHASE_SOUND: Partial<Record<MoonPhase, SoundKey>> = { moonrise: 'moonrise', moonset: 'moonset' };

/** The player, as the run's rules see it. */
export type GameplayActor = InteractionActor & ShelterActor;

export class Gameplay {
  readonly inventory = new InventorySystem();
  readonly moon: MoonCycle;
  readonly purity = new PuritySystem();
  readonly interaction: InteractionSystem;
  /** The bag is open: movement and the action button wait. */
  inventoryOpen = false;

  private world: World | null = null;
  private player: GameplayActor | null = null;
  private camera: Camera | null = null;
  private uiTimer = 0;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly sounds: Pick<SoundFx, 'play'> | null;

  constructor(physics: Physics, sounds: Pick<SoundFx, 'play'> | null, seed = Date.now() % 100000, moon: MoonCycleConfig = DEFAULT_MOON_CONFIG) {
    this.sounds = sounds;
    this.moon = new MoonCycle(moon, seed);
    this.interaction = new InteractionSystem(physics, sounds);
    this.unsubscribers.push(
      this.inventory.onChange((snap) => EventBus.emit('ui:inventory', snap)),
      this.moon.onPhase((phase) => {
        const toast = PHASE_TOAST[phase];
        if (toast) EventBus.emit('ui:toast', toast);
        const s = PHASE_SOUND[phase];
        if (s) this.sounds?.play(s);
        this.emitMoon();
      }),
      EventBus.on('game:inventory-open', ({ open }) => {
        this.inventoryOpen = open;
        this.sounds?.play(open ? 'bag-open' : 'bag-close');
      }),
    );
  }

  /** What the world's interactables need from the run. */
  get services(): WorldServices {
    return {
      inventory: this.inventory,
      onPray: () => {
        this.purity.value = 100;
        this.emitPurity();
      },
    };
  }

  start(world: World, player: GameplayActor, rig: ShelterCamera, camera: Camera | null): void {
    this.world = world;
    this.player = player;
    this.camera = camera;
    for (const i of world.interactables) this.interaction.register(i);
    world.shelter?.attach(player, rig, () => this.moon.dangerous || this.moon.phase === 'moonrise', (k) => this.sounds?.play(k));
    EventBus.emit('ui:inventory', this.inventory.snapshot());
    this.emitMoon();
    this.emitPurity();
  }

  update(dt: number, interactPressed: boolean): void {
    const player = this.player;
    const world = this.world;
    if (!player || !world) return;
    this.moon.update(dt);
    this.interaction.update(dt, player, this.camera);
    if (interactPressed && !this.inventoryOpen && !world.shelter?.busy) this.interaction.tryBegin(player);
    world.shelter?.update(dt);

    const failed = this.purity.update(dt, {
      dangerous: this.moon.dangerous,
      sheltered: world.shelter?.isSafe ?? false,
      openGround: world.isOpenGround?.() ?? false,
    });
    if (failed) this.overwhelmed();

    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.2;
      this.emitMoon();
      this.emitPurity();
    }
  }

  /** How much moonlight is falling, 0..1, for the sky and the lights. */
  get moonlight(): number {
    return this.moon.moonlight;
  }

  dispose(): void {
    for (const u of this.unsubscribers) u();
    this.interaction.dispose();
  }

  /**
   * Purity ran out under the moon: half the bag (rounded down) falls where the player stands, as a
   * bundle they can pick up again. Never the whole bag, never anything already offered.
   */
  private overwhelmed(): void {
    const player = this.player;
    const world = this.world;
    if (!player || !world) return;
    const stacks = this.inventory.dropForFailure();
    if (!stacks.length || !world.dropOfferings) {
      EventBus.emit('ui:toast', { text: 'The moonlight overwhelms you — get indoors!', tone: 'warn' });
      return;
    }
    const drop: IInteractable = world.dropOfferings(player.feet.clone(), stacks, (d) => this.interaction.unregister(d));
    this.interaction.register(drop);
    this.sounds?.play('drop');
    EventBus.emit('ui:toast', { text: `The moonlight overwhelms you — ${describeStacks(stacks)} fell where you stood`, tone: 'warn' });
  }

  private emitMoon(): void {
    EventBus.emit('ui:moon', { phase: this.moon.phase, progress: this.moon.progress, dangerous: this.moon.dangerous });
  }

  private emitPurity(): void {
    EventBus.emit('ui:purity', { value: Math.round(this.purity.value), exposed: this.purity.exposed });
  }
}

/**
 * The run's rules, in one place: the bag, the moon, exposure, interaction, shelter and the score —
 * and the events that tell React about them. Owned by the Engine for the whole run; the world and
 * the player come and go around it (a house interior never rebuilds the bag).
 *
 * Frame order: moon → interaction (+ the action button) → shelter walk → exposure → the world's
 * own life (lighting, villagers, dogs, ambience).
 */
import { type Camera, Vector3 } from 'three';
import { EventBus } from '../shared/EventBus';
import { describeStacks, ITEM_IDS, ITEMS } from '../shared/items';
import type { MoonStateName, NightPhase } from '../shared/types';
import type { Ambience } from './audio/Ambience';
import type { SoundFx } from './audio/SoundFx';
import type { Physics } from './core/Physics';
import type { InteractionActor } from './interaction/IInteractable';
import { InteractionSystem } from './interaction/InteractionSystem';
import { InventorySystem } from './inventory/InventorySystem';
import { HealthSystem } from './health/HealthSystem';
import { MapSystem } from './map/MapSystem';
import { DEFAULT_EXPOSURE_CONFIG, ExposureSystem, type ExposureInput, type Gait, moonPressure } from './moon/ExposureSystem';
import { MoonAudioController } from './moon/MoonAudioController';
import { MoonManager } from './moon/MoonManager';
import { DEFAULT_MOON_CONFIG, type MoonCycleConfig } from './moon/MoonState';
import { DEFAULT_NIGHT_CONFIG, NightClock, type NightConfig } from './night/NightClock';
import { RunTracker } from './run/RunTracker';
import { PlayerAction } from './player/PlayerAnimation';
import type { ScriptedCamera, ShelterActor, ShelterCamera } from './shelter/ShelterManager';
import type { World, WorldServices } from './world/World';

/** What the player says to himself as the signs come — the last, plainest warning. */
const PLAYER_LINE: Partial<Record<MoonStateName, string>> = {
  warning: 'The lamps are going up early… the moon is coming.',
  rising: 'There it is. I should get under a roof.',
};

/** What the turning of the night is worth saying out loud. Each is said once. */
const PHASE_LINE: Record<NightPhase, { text: string; tone: 'info' | 'warn' | 'good' } | null> = {
  evening: null,
  night: { text: 'Night has settled over the village. Gather while the clouds hold.', tone: 'info' },
  dawn: { text: 'The sky is lightening — no moon will rise again. Get to the temple before five.', tone: 'warn' },
};

/** How far each gait carries: sneaking is nearly nothing, running wakes the lane. */
const NOISE: Record<Gait, number> = { still: 0, sneak: 0.15, walk: 0.55, run: 1 };

const EAR = new Vector3();
const FORWARD = new Vector3();
const UP = new Vector3();

export type GameplayActor = InteractionActor & ShelterActor & { readonly gait: 'normal' | 'run' | 'sneak' };

export class Gameplay {
  readonly inventory = new InventorySystem();
  readonly night: NightClock;
  readonly moon: MoonManager;
  readonly exposure = new ExposureSystem();
  readonly health = new HealthSystem();
  readonly interaction: InteractionSystem;
  readonly run = new RunTracker();
  /** The bag is open: movement and the action button wait. */
  inventoryOpen = false;
  /** The map is open: movement and the action button wait, as with the bag. */
  mapOpen = false;
  /** The puja's closing sequence is playing: everything else stands back. */
  cinematic = false;

  private readonly audio: MoonAudioController | null;
  private world: World | null = null;
  private map: MapSystem | null = null;
  private player: GameplayActor | null = null;
  private camera: Camera | null = null;
  private uiTimer = 0;
  private lastLevel = '';
  private sheltered = false;
  private atTemple = 0;
  private rig: ScriptedCamera | null = null;
  /** Cuts the closing puja short, while one is playing. */
  private skipCinematic: (() => void) | null = null;
  private readonly lastPos = { x: 0, z: 0, set: false };
  private lastPhase: NightPhase = 'evening';
  /** 05:00 came and went: the run is finishing, and nothing may finish it twice. */
  private over = false;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly sounds: Pick<SoundFx, 'play'> | null;

  constructor(
    physics: Physics,
    sounds: Pick<SoundFx, 'play'> | null,
    ambience: Ambience | null = null,
    seed = Date.now() % 100000,
    moon: MoonCycleConfig = DEFAULT_MOON_CONFIG,
    night: NightConfig = DEFAULT_NIGHT_CONFIG,
  ) {
    this.sounds = sounds;
    this.audio = ambience ? new MoonAudioController(ambience, sounds) : null;
    this.night = new NightClock(night);
    this.moon = new MoonManager(moon, seed);
    this.interaction = new InteractionSystem(physics, sounds);
    this.unsubscribers.push(
      EventBus.on('ui:at-temple', ({ inside }) => {
        this.atTemple = inside ? 1 : 0;
      }),
      this.inventory.onChange((snap) => EventBus.emit('ui:inventory', snap)),
      this.moon.onState((state) => this.onMoonState(state)),
      EventBus.on('game:inventory-open', ({ open }) => {
        this.inventoryOpen = open;
        this.sounds?.play(open ? 'bag-open' : 'bag-close');
      }),
      EventBus.on('game:map-open', ({ open }) => {
        this.mapOpen = open;
      }),
      // A villager's word is a hint on the map.
      EventBus.on('ui:speech', ({ speaker }) => this.map?.hear(speaker)),
      EventBus.on('ui:pickup', ({ quantity }) => this.run.collected(quantity)),
      EventBus.on('game:skip-cinematic', () => this.skipCinematic?.()),
    );
  }

  /** What the world's interactables need from the run. */
  get services(): WorldServices {
    return {
      inventory: this.inventory,
      onPray: () => {
        this.exposure.reset();
        this.emitExposure();
      },
      onPujaComplete: () => this.completePuja(),
      playSound: (key, volume) => this.sounds?.play(key, volume),
    };
  }

  start(world: World, player: GameplayActor, rig: ShelterCamera, camera: Camera | null): void {
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.rig = rig;
    for (const i of world.interactables) this.interaction.register(i);
    if (world.mapData) {
      this.map = new MapSystem(world.mapData.sources, world.mapData.layout, (item) => this.inventory.snapshot().offered[item] < ITEMS[item].required);
      EventBus.emit('ui:map-spots', { spots: [] });
    }
    this.audio?.place(world.soundSpots?.festival ?? null, world.soundSpots?.temple ?? null);
    world.shelter?.attach(player, rig, () => this.moon.dangerous || this.moon.state === 'warning', (k) => this.sounds?.play(k));
    EventBus.emit('ui:inventory', this.inventory.snapshot());
    this.emitMoon();
    this.emitNight();
    this.emitExposure();
    this.emitHealth();
  }

  update(dt: number, interactPressed: boolean): void {
    const player = this.player;
    const world = this.world;
    if (!player || !world) return;
    // The closing puja: the world still lives (the engine ticks it), but nothing else runs.
    if (this.cinematic) {
      this.hear(dt, world);
      return;
    }
    this.night.update(dt);
    this.moon.update(dt, { ticking: this.night.moonTicking, mayRise: this.night.moonMayRise });
    if (this.night.phase !== this.lastPhase) {
      this.lastPhase = this.night.phase;
      const line = PHASE_LINE[this.lastPhase];
      if (line) EventBus.emit('ui:toast', line);
      this.emitMoon();
    }
    this.interaction.update(dt, player, this.camera);
    if (interactPressed && !this.inventoryOpen && !this.mapOpen && !world.shelter?.busy) this.interaction.tryBegin(player);
    world.shelter?.update(dt);

    // Ground covered, for the score's efficiency and for the walk's own sake.
    const f = player.feet;
    if (this.lastPos.set) this.run.travelled(Math.hypot(f.x - this.lastPos.x, f.z - this.lastPos.z));
    this.lastPos.x = f.x;
    this.lastPos.z = f.z;
    this.lastPos.set = true;

    // What the player can see of the offerings, for the map.
    if (this.map) {
      this.map.see(f.x, f.z);
      const spots = this.map.changed();
      if (spots) EventBus.emit('ui:map-spots', { spots });
    }

    const safe = world.shelter?.isSafe ?? false;
    if (safe && !this.sheltered && this.moon.dangerous) this.run.shelteredUnderMoon();
    this.sheltered = safe;

    const moonOnYou: ExposureInput = {
      moonRate: this.moon.exposureRate,
      sheltered: safe,
      openGround: world.isOpenGround?.() ?? false,
      covered: world.isCovered?.() ?? false,
      gait: this.gait(player),
      shelterDistance: world.shelterDistance?.(f) ?? 0,
    };
    this.exposure.update(dt, moonOnYou);
    this.run.exposed(this.exposure.exposedSeconds);
    // Exposure is the pressure and drives what the frame looks like; health is what the pressure
    // costs, and it is health running out that ends the moment — one failure condition, not two.
    const collapsed = this.health.update(dt, { pressure: moonPressure(DEFAULT_EXPOSURE_CONFIG, moonOnYou), sheltered: safe });
    if (collapsed) this.overwhelmed();

    this.hear(dt, world);

    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.2;
      this.emitMoon();
      this.emitNight();
      this.emitExposure();
      this.emitHealth();
    }

    // Five o'clock. Whatever is in the bag stays in the bag.
    if (this.night.done) this.dawnBreaks();
  }

  /** How much the player's own feet give them away, for the dogs. */
  noise(): number {
    const player = this.player;
    if (!player) return 0;
    return NOISE[this.gait(player)];
  }

  /** What the world needs to know about the sky this frame. */
  moonFrame() {
    return {
      state: this.moon.state,
      progress: this.moon.progress,
      moonlight: this.moon.moonlight,
      goingHome: this.moon.goingHome,
      dangerous: this.moon.dangerous,
      untilMoonlight: this.moon.untilMoonlight,
      phase: this.night.phase,
      nightBase: this.night.nightBase,
      dawn: this.night.dawnBlend,
      retired: this.night.phase === 'dawn' && this.moon.retired,
    };
  }

  dispose(): void {
    for (const u of this.unsubscribers) u();
    this.interaction.dispose();
  }

  // ---- the moon's turns -------------------------------------------------------------------------

  private onMoonState(state: MoonStateName): void {
    this.audio?.onState(state);
    if (state === 'rising') this.run.moonRose();
    const line = PLAYER_LINE[state];
    // The village says it first; the player only puts it in words.
    if (line) EventBus.emit('ui:speech', { speaker: 'You', text: line });
    this.emitMoon();
  }

  /** The village's own sound, mixed against the sky and where the player is standing. */
  private hear(dt: number, world: World): void {
    if (!this.audio) return;
    const camera = this.camera;
    if (camera) {
      camera.updateWorldMatrix(true, false);
      camera.getWorldPosition(EAR);
      camera.getWorldDirection(FORWARD);
      UP.set(0, 1, 0).applyQuaternion(camera.quaternion);
      this.audio.listen(EAR, FORWARD, UP);
    }
    this.audio.update(dt, {
      moonlight: this.moon.moonlight,
      // The village sounds like the hour the sky is, not only like whether the moon is out.
      night: Math.max(this.night.nightBase, this.moon.moonlight),
      indoors: world.shelter?.isSafe ?? false,
      atTemple: this.atTemple,
    });
  }

  private gait(player: GameplayActor): Gait {
    if (player.gait === 'run') return 'run';
    if (player.gait === 'sneak') return 'sneak';
    return 'walk';
  }

  /**
   * The moonlight overwhelmed the player. Their strength is gone, and so is what they carried:
   * the bag is emptied, and the offerings it held are put back where they were found, to be
   * gathered again. What is already before Bappa stays there. The nearest household pulls them
   * inside, and the run goes on.
   */
  private overwhelmed(): void {
    const player = this.player;
    const world = this.world;
    if (!player || !world) return;
    const stacks = this.inventory.emptyBag();
    const lost = stacks.reduce((n, s) => n + s.quantity, 0);
    this.run.dropped(lost);
    this.exposure.reset();
    this.health.revive();
    this.sounds?.play('drop');
    world.restockOfferings?.();
    const taken = world.shelter?.takeIndoors?.(player.feet);
    const said = lost ? `; you lost ${describeStacks(stacks)} — gather ${lost === 1 ? 'it' : 'them'} again` : '';
    EventBus.emit('ui:toast', {
      text: taken ? `The moonlight overwhelms you — ${taken} takes you in${said}` : `The moonlight overwhelms you${said}`,
      tone: 'warn',
    });
    this.emitExposure();
    this.emitHealth();
  }

  /**
   * 05:00. The moon has been gone for some minutes and the sky is up; whatever was not offered
   * tonight was not offered. The run ends where it stands — scored for what it gathered, with
   * none of what finishing the puja is worth.
   */
  private dawnBreaks(): void {
    if (this.over || this.cinematic) return;
    this.over = true;
    EventBus.emit('ui:toast', { text: 'Five o’clock. The night is over.', tone: 'warn' });
    EventBus.emit('run:completed', this.run.finish(this.inventory.snapshot().pujaComplete));
  }

  /** Every offering is before Bappa: the closing sequence, then the results. */
  private completePuja(): void {
    if (this.cinematic || this.over) return;
    this.cinematic = true;
    EventBus.emit('ui:cinematic', { active: true });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.skipCinematic = null;
      this.cinematic = false;
      this.over = true;
      EventBus.emit('ui:cinematic', { active: false });
      EventBus.emit('run:completed', this.run.finish(true));
    };
    const world = this.world;
    const player = this.player;
    if (!world?.pujaSequence || !this.rig || !player) {
      finish();
      return;
    }
    const cut = world.pujaSequence(
      {
        camera: this.rig,
        celebrate: () => player.playAction(PlayerAction.Pranam, () => {}, () => {}),
        sound: (key, volume) => this.sounds?.play(key, volume),
      },
      finish,
    );
    this.skipCinematic = cut ?? finish;
  }

  private emitMoon(): void {
    const i = this.moon.info;
    const phase = this.night.phase;
    // At dawn the sky itself is the news, not the state machine sitting on `safe`.
    const retired = phase === 'dawn' && !this.moon.dangerous;
    EventBus.emit('ui:moon', {
      state: this.moon.state,
      label: retired ? 'The sky is lightening' : phase === 'evening' ? 'The sun is going down' : i.label,
      note: retired ? 'No moon will rise again' : phase === 'evening' ? undefined : i.note,
      progress: this.moon.progress,
      dangerous: this.moon.dangerous,
      phase,
      retired,
    });
  }

  private emitNight(): void {
    const n = this.night;
    EventBus.emit('ui:night', { label: n.label, t: n.t, phase: n.phase, minutesLeft: n.minutesLeft });
  }

  private emitHealth(): void {
    const h = this.health;
    EventBus.emit('ui:health', { value: Math.round(h.value), level: h.level, draining: h.draining });
  }

  private emitExposure(): void {
    const level = this.exposure.level;
    EventBus.emit('ui:exposure', { value: Math.round(this.exposure.value), level, rising: this.exposure.rising });
    // "Find shelter!" — said once, when it starts to matter.
    if (level !== this.lastLevel) {
      if (level === 'warn' && this.exposure.value > DEFAULT_EXPOSURE_CONFIG.warnAt) {
        EventBus.emit('ui:toast', { text: 'Find shelter!', tone: 'warn' });
      }
      this.lastLevel = level;
    }
  }

  /** What the puja still wants, for the temple's panel. */
  missingOfferings(): { id: (typeof ITEM_IDS)[number]; count: number }[] {
    const offered = this.inventory.snapshot().offered;
    return ITEM_IDS.map((id) => ({ id, count: Math.max(ITEMS[id].required - offered[id], 0) })).filter((m) => m.count > 0);
  }
}

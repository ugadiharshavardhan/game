import RAPIER from '@dimforge/rapier3d-compat';
import {
  ACESFilmicToneMapping,
  type DirectionalLight,
  HalfFloatType,
  WebGLRenderTarget,
  PCFShadowMap,
  Timer,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EventBus } from '../../shared/EventBus';
import { Ambience } from '../audio/Ambience';
import { SoundFx } from '../audio/SoundFx';
import { DEFAULT_CAMERA_CONFIG, validateCameraConfig } from '../camera/CameraConfig';
import { type CameraUserSettings, ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { DEFAULT_PLAYER_CONFIG, validatePlayerConfig } from '../config/playerConfig';
import { Gameplay } from '../Gameplay';
import { Player } from '../player/Player';
import { applySkinDetail, loadSkinDetail } from '../player/skinDetail';
import { buildTestbed } from '../world/Testbed';
import type { World } from '../world/World';
import { AudioBank } from './AudioBank';
import type { RemotePeer } from '../../shared/multiplayer';
import type { QualityLevel } from '../../shared/types';
import { DEFAULT_MOON_CONFIG } from '../moon/MoonState';
import { GhostPlayers } from '../multiplayer/GhostPlayers';
import type { LocalPeerState, PeerLink } from '../multiplayer/PeerLink';
import { buildProceduralClips } from '../player/proceduralClips';
import { DEFAULT_NIGHT_CONFIG } from '../night/NightClock';
import { Tutorial, TUTORIAL_MOON, TUTORIAL_NIGHT } from '../tutorial/Tutorial';
import { Input } from './Input';
import { Physics } from './Physics';
import { PerformanceManager } from './PerformanceManager';
import { type DeviceInfo, detectDevice, pixelCaps, profileFor, type QualityProfile } from './quality';

const BASE = import.meta.env.BASE_URL;

/** Frames closer together than this are skipped (a little under 1/60 s, so a 60 Hz screen keeps every one). */
const MIN_FRAME_MS = 14;
/** Bloom strength: restrained by day, a touch more once the only light is fire and moon. */
const DAY_BLOOM = 0.2;
const NIGHT_BLOOM = 0.32;

/** What the app tells the engine about the run it is starting. */
export interface GameOptions {
  /** How hard this device may be worked ('auto' asks the device). */
  quality?: QualityLevel;
  /** A team's shared village: everyone's moon has this seed and is this far into its cycle. */
  session?: { seed: number; elapsed: number } | null;
  /** Teammates to draw, and somewhere to put this player's position. Absent when playing alone. */
  link?: PeerLink | null;
  /** The short guided walk instead of a full run. */
  tutorial?: boolean;
  /** Which character model to use (devotee, woman, or pujari). */
  character?: import('../../shared/multiplayer').CharacterModel;
}

/**
 * Owns the renderer, the loop and every system. Created on Play, disposed on quit.
 * Frame order: input → gameplay (moon, interaction, shelter, purity) → player (movement,
 * animation, audio) → physics → camera → world (triggers, sky, visuals) → render.
 */
export class Engine {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(55, 1, 0.1, 500);
  private readonly timer = new Timer();
  private readonly resizeObserver: ResizeObserver;
  private readonly input: Input;
  private readonly bank = new AudioBank();
  /** Null on a phone: with no bloom and no multisampling there is nothing for it to do. */
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private ambience: Ambience | null = null;
  private physics: Physics | null = null;
  private world: World | null = null;
  private player: Player | null = null;
  private cameraRig: ThirdPersonCamera | null = null;
  private gameplay: Gameplay | null = null;
  private ghosts: GhostPlayers | null = null;
  private tutorial: Tutorial | null = null;
  /** Dev-only stand-ins for teammates (devtools.ts); empty in a real run. */
  private readonly fakePeers: RemotePeer[] = [];
  private readonly options: GameOptions;
  readonly quality: QualityProfile;
  /** ?perf=1 — the only thing in the shipped build that reports on itself, and only when asked. */
  private readonly reportPerf = typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf');
  private perfTime = 0;
  private readonly device: DeviceInfo;
  /** Trades detail for frame rate when this device is not keeping up, and back when it can. */
  readonly perf: PerformanceManager;
  private frameNo = 0;
  /** The sun, whose shadow map the PerformanceManager resizes and paces. */
  private sun: DirectionalLight | null = null;
  /** What this player sends teammates each frame: one object, refilled, never reallocated. */
  private readonly outgoing: LocalPeerState = { x: 0, y: 0, z: 0, yaw: 0, state: 'idle', indoors: false, given: 0 };
  private lastFrameAt = 0;
  private mapTimer = 0;
  private paused = false;
  private pendingCameraSettings: CameraUserSettings | null = null;
  private disposed = false;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly parent: HTMLElement;

  constructor(parent: HTMLElement, options: GameOptions = {}) {
    this.parent = parent;
    this.options = options;
    this.device = detectDevice();
    this.quality = profileFor(options.quality, this.device);
    this.perf = new PerformanceManager({
      requested: options.quality ?? 'auto',
      device: this.device,
      profile: this.quality,
      caps: pixelCaps(this.device),
    });
    this.renderer = new WebGLRenderer({ antialias: this.quality.msaa === 0, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.perf.live.pixelRatio);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.74;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    // The composer renders several passes a frame; count the whole frame, not the last pass.
    this.renderer.info.autoReset = false;
    parent.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.unsubscribers.push(
      EventBus.on('game:camera-settings', (settings) => {
        this.pendingCameraSettings = settings;
        this.cameraRig?.setUserSettings(settings);
      }),
    );
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(parent);
    this.resize();
  }

  async start(): Promise<void> {
    const problems = [...validatePlayerConfig(DEFAULT_PLAYER_CONFIG), ...validateCameraConfig(DEFAULT_CAMERA_CONFIG)];
    if (problems.length && import.meta.env.DEV) console.warn('[config]', problems);

    await RAPIER.init();
    if (this.disposed) return;
    EventBus.emit('preload:progress', { progress: 0.2 });
    this.physics = new Physics(RAPIER);

    // ?scene=testbed → the character test ground; ?view=greybox → the village as it collides.
    const params = new URLSearchParams(location.search);
    const physics = this.physics;
    const sounds = new SoundFx(this.bank);
    this.ambience = new Ambience(this.bank, this.quality.audioRate);
    // A team shares one moon: the session's seed, wound forward to wherever the night has got to.
    const session = this.options.session ?? null;
    const seed = session?.seed ?? (Number(params.get('seed')) || Date.now() % 100000);
    // The guided walk runs a night in miniature, so a whole moonrise fits inside two minutes.
    const moonConfig = this.options.tutorial ? TUTORIAL_MOON : DEFAULT_MOON_CONFIG;
    const nightConfig = this.options.tutorial ? TUTORIAL_NIGHT : DEFAULT_NIGHT_CONFIG;
    const gameplay = (this.gameplay = new Gameplay(physics, sounds, this.ambience, seed, moonConfig, nightConfig));
    if (session?.elapsed) {
      // The night first, then the moon through the gate that night leaves open.
      // Cap at safe night duration so stale timestamps never spawn into morning.
      const safeElapsed = Math.min(Math.max(session.elapsed, 0), nightConfig.seconds * Math.max(nightConfig.dawn - 0.08, 0.5));
      gameplay.night.windForward(safeElapsed);
      gameplay.moon.windForward(safeElapsed, {
        ticking: gameplay.night.moonTicking,
        mayRise: gameplay.night.moonMayRise,
      });
    }
    const buildWorld = async (): Promise<World> => {
      if (params.get('scene') === 'testbed') return buildTestbed(this.scene, this.renderer, physics);
      const { buildVillage } = await import('../world/village/Village');
      return buildVillage(this.scene, this.renderer, physics, params.get('view') === 'greybox' ? 'greybox' : 'art', gameplay.services, this.quality, this.perf.live);
    };
    const charFile = this.options.character === 'woman' ? 'sareelady.glb' : this.options.character === 'pujari' ? 'pujari.glb' : 'character.glb';
    const [world, gltf, pores] = await Promise.all([
      buildWorld(),
      new GLTFLoader().loadAsync(`${BASE}assets/models/${charFile}`),
      loadSkinDetail().catch(() => null),
      this.loadAudio(),
    ]);
    if (this.disposed) {
      world.dispose();
      return;
    }
    this.world = world;
    this.sun = world.sun ?? null;
    if (charFile === 'character.glb') {
      gltf.scene.scale.setScalar(0.82);
    } else if (charFile === 'sareelady.glb') {
      gltf.scene.position.y += 1.0;
    }
    if (pores) applySkinDetail(gltf.scene, pores);
    // The devotee carries no animation of his own: his clips are made here, once, and the
    // teammates' ghosts play the very same ones.
    const clips = gltf.animations.length
      ? gltf.animations
      : buildProceduralClips(gltf.scene, {
          slow: DEFAULT_PLAYER_CONFIG.slowWalkSpeed,
          walk: DEFAULT_PLAYER_CONFIG.walkSpeed,
          fastWalk: DEFAULT_PLAYER_CONFIG.fastWalkSpeed,
          run: DEFAULT_PLAYER_CONFIG.runSpeed,
          crouch: DEFAULT_PLAYER_CONFIG.crouchSpeed,
        });
    this.player = new Player(
      gltf.scene,
      clips,
      this.scene,
      this.physics,
      this.input,
      DEFAULT_PLAYER_CONFIG,
      this.bank,
      world.spawn,
      world.spawnYaw,
    );
    this.player.sheltered = () => world.shelter?.isSafe ?? false;
    this.cameraRig = new ThirdPersonCamera(this.camera, this.player, this.input, this.physics, {
      ...DEFAULT_CAMERA_CONFIG,
      recenterMode: 'always',
      recenterDelay: 0.12,
      recenterTime: 0.55,
    });
    if (this.pendingCameraSettings) this.cameraRig.setUserSettings(this.pendingCameraSettings);
    // Footsteps: the synthesised surfaces, and somewhere to ask what is underfoot.
    this.player.audio.useSounds(sounds);
    const feet = this.player.feet;
    this.player.audio.surface = () => world.surfaceAt?.(feet) ?? 'dirt';
    gameplay.start(world, this.player, this.cameraRig, this.camera);
    void world.itemIcons?.then((icons) => {
      if (!this.disposed) EventBus.emit('ui:item-icons', { icons });
    });

    // Ghosts are always ready, even alone: an empty list costs nothing, and the developer tools
    // can put a stand-in teammate in the lane to look at without a second player.
    const link: PeerLink = {
      peers: () => (this.options.link ? [...this.options.link.peers(), ...this.fakePeers] : this.fakePeers),
      send: (state) => this.options.link?.send(state),
      onLeave: (listener) => this.options.link?.onLeave(listener) ?? (() => {}),
    };
    this.ghosts = new GhostPlayers(this.scene, gltf.scene, clips, DEFAULT_PLAYER_CONFIG, this.camera, link, this.quality.ghosts);
    if (this.options.tutorial) {
      this.tutorial = new Tutorial(gameplay, world);
      this.unsubscribers.push(EventBus.on('game:skip-tutorial', () => this.tutorial?.skip()));
    }

    // Post-processing exists for bloom and for multisampling the scene. A phone has neither, and
    // going through a half-float target and a full-screen output pass just to tone-map costs
    // it two extra trips over every pixel — so it draws straight to the screen instead.
    if (this.quality.bloom || this.quality.msaa > 0) {
      const size = this.renderer.getSize(new Vector2());
      // Render into a multisampled target: without it, post-processing silently drops the
      // renderer's antialiasing — and alpha-to-coverage foliage needs MSAA to smooth its edges.
      this.composer = new EffectComposer(
        this.renderer,
        new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: this.renderer.capabilities.isWebGL2 ? this.quality.msaa : 0 }),
      );
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      // High threshold: lamps, flames and the sun's disc bloom; lit walls and sky do not.
      if (this.quality.bloom) {
        this.bloom = new UnrealBloomPass(size, DAY_BLOOM, 0.55, 1.45);
        this.composer.addPass(this.bloom);
      }
      this.composer.addPass(new OutputPass());
    }
    this.applyQuality();

    this.unsubscribers.push(
      EventBus.on('game:pause', () => this.setPaused(true)),
      EventBus.on('game:resume', () => this.setPaused(false)),
      // Volume can change mid-run; the rest of the settings are read when the engine starts.
      EventBus.on('game:settings', ({ volume }) => this.bank.setVolume(volume)),
    );
    // Audio may only start inside a user gesture.
    const unlock = () => this.bank.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.unsubscribers.push(() => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    });
    this.bank.unlock();

    EventBus.emit('preload:progress', { progress: 1 });
    this.timer.connect(document);
    this.renderer.setAnimationLoop(() => this.tick());
    if (import.meta.env.DEV) void import('./devtools').then((m) => m.installDevtools(this.devHandle()));
    EventBus.emit('scene:ready', { scene: params.get('scene') ?? 'village' });
    EventBus.emit('ui:player-state', { state: this.player.state.value });
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    for (const u of this.unsubscribers) u();
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.gameplay?.dispose();
    this.player?.dispose();
    this.world?.dispose();
    this.physics?.dispose();
    this.tutorial?.dispose();
    this.ghosts?.dispose();
    this.composer?.dispose();
    this.ambience?.dispose();
    this.bank.dispose();
    this.timer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private tick(): void {
    // A 120 Hz phone would otherwise draw twice as many frames as anyone can use, and get hot
    // and slow for it. Sixty is the ceiling; a 60 Hz screen never gets near this gate.
    const now = performance.now();
    if (now - this.lastFrameAt < MIN_FRAME_MS) return;
    this.lastFrameAt = now;
    this.renderer.info.reset();
    this.timer.update();
    const elapsed = this.timer.getDelta();
    const dt = Math.min(elapsed, 1 / 20);
    if (!this.player || !this.cameraRig || !this.physics || !this.gameplay) return;
    if (!this.paused) {
      if (this.perf.frame(elapsed)) this.applyQuality();
      this.input.update();
      // While the bag is open, the stick and arrows browse it instead of walking.
      if (this.gameplay.inventoryOpen || this.gameplay.mapOpen) {
        this.input.move.set(0, 0);
        this.input.crouchPressed = false;
      }
      // Sitting or asleep, E / the action button means nothing: stand up first.
      this.gameplay.update(dt, this.input.interactPressed && this.player.canInteract);
      // Movement is relative to what the player sees — the follow rig, or an interior's camera.
      this.player.update(dt, this.cameraRig.viewYaw);
      this.physics.step(dt);
      this.cameraRig.update(dt);
      this.world?.follow(this.player.feet);
      const moon = this.gameplay.moonFrame();
      this.world?.update?.(dt, this.player.feet, { camera: this.camera, moon, noise: this.gameplay.noise() });
      // A little more glow off the diyas once the sky is dark — a little, not a haze. It follows
      // the sky the night actually has, not just the moon: a cloudy 1 a.m. is dark too.
      if (this.bloom) this.bloom.strength = DAY_BLOOM + (NIGHT_BLOOM - DAY_BLOOM) * Math.max(moon.nightBase, moon.moonlight);
      this.input.endFrame();
      // Where we are, for the map — ten times a second is plenty for a moving arrow.
      this.mapTimer -= dt;
      if (this.mapTimer <= 0) {
        this.mapTimer = 0.1;
        EventBus.emit('ui:map-player', { x: this.player.feet.x, z: this.player.feet.z, yaw: this.player.yaw });
      }
      // Teammates: tell them where we are, then draw where they are.
      if (this.options.link) {
        const out = this.outgoing;
        out.x = this.player.feet.x;
        out.y = this.player.feet.y;
        out.z = this.player.feet.z;
        out.yaw = this.player.yaw;
        out.state = this.player.state.value;
        out.indoors = this.world?.shelter?.isSafe ?? false;
        out.given = this.gameplay.inventory.snapshot().stacks.length;
        this.options.link.send(out);
      }
      this.ghosts?.update(dt);
      this.tutorial?.update(dt);
    }
    this.paceShadows();
    const live = this.perf.live;
    // With bloom given up and no multisampling, the composer would only copy pixels around.
    if (this.composer && (live.bloom || this.quality.msaa > 0)) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    if (this.reportPerf) this.reportPerformance(dt);
  }

  /** The shadow map is redrawn every `shadowEvery` frames; in between, last frame's is reused. */
  private paceShadows(): void {
    if (!this.quality.shadows) return;
    const every = this.perf.live.shadowEvery;
    const shadows = this.renderer.shadowMap;
    this.frameNo++;
    shadows.autoUpdate = every <= 1;
    if (every > 1 && this.frameNo % every === 0) shadows.needsUpdate = true;
  }

  /** Puts the PerformanceManager's live settings into the renderer, the sun, bloom and the ghosts. */
  private applyQuality(): void {
    const live = this.perf.live;
    if (this.renderer.getPixelRatio() !== live.pixelRatio) {
      this.renderer.setPixelRatio(live.pixelRatio);
      this.composer?.setPixelRatio(live.pixelRatio);
    }
    const sun = this.sun;
    if (sun && sun.shadow.mapSize.x !== live.shadowMapSize) {
      sun.shadow.mapSize.set(live.shadowMapSize, live.shadowMapSize);
      // The map is reallocated at the new size on the next shadow pass.
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (this.bloom) this.bloom.enabled = live.bloom;
    if (this.ghosts) this.ghosts.farHz = live.npcHz;
    this.resize();
  }

  /**
   * Twice a second, what this device is actually managing and what the PerformanceManager has
   * done about it. Off unless the page asked for it (?perf=1), so it
   * costs nothing in a normal run — and it works in the production build, which is the whole
   * point: it is how the game gets tested on a real phone.
   */
  private reportPerformance(dt: number): void {
    this.perfTime += dt;
    if (this.perfTime < 0.5) return;
    this.perfTime = 0;
    const info = this.renderer.info;
    const live = this.perf.live;
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    EventBus.emit('ui:perf', {
      fps: Math.round(this.perf.fps),
      worstMs: Math.round(this.perf.worstMs),
      calls: info.render.calls,
      triangles: info.render.triangles,
      quality: live.tier,
      requested: this.options.quality ?? 'auto',
      step: this.perf.rung,
      steps: this.perf.rungs,
      pixelRatio: live.pixelRatio,
      shadowMapSize: live.shadowMapSize,
      shadowEvery: live.shadowEvery,
      bloom: live.bloom && !!this.bloom,
      particles: live.particles,
      lodScale: live.lodScale,
      npcHz: live.npcHz,
      lights: this.quality.lamps,
      device: this.device.label,
      memoryMb: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
    });
  }

  /** Dev-only access for automated browser verification (see devtools.ts). */
  private devHandle() {
    return {
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      input: this.input,
      fakePeers: this.fakePeers,
      physics: this.physics as Physics,
      player: this.player as Player,
      cameraRig: this.cameraRig as ThirdPersonCamera,
      world: this.world as World,
      gameplay: this.gameplay as Gameplay,
    };
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.bank.setPaused(paused);
    if (paused) this.input.releasePointer();
    this.timer.reset(); // don't let the paused time land in the next frame
  }

  private resize(): void {
    const w = Math.max(this.parent.clientWidth, 1);
    const h = Math.max(this.parent.clientHeight, 1);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  private async loadAudio(): Promise<void> {
    const a = (name: string) => `${BASE}assets/audio/${name}.mp3`;
    const range = (prefix: string) => [0, 1, 2, 3, 4].map((i) => a(`${prefix}_00${i}`));
    await Promise.all([
      this.bank.load('step', range('footstep_grass')),
      this.bank.load('stepSoft', range('footstep_carpet')),
      this.bank.load('walkAudio', [a('walking_audio')]).catch(() => null),
      this.bank.load('cloth', [1, 2, 3, 4].map((i) => a(`cloth${i}`))),
    ]);
  }
}

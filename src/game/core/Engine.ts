import RAPIER from '@dimforge/rapier3d-compat';
import {
  ACESFilmicToneMapping,
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
import { SoundFx } from '../audio/SoundFx';
import { DEFAULT_CAMERA_CONFIG, validateCameraConfig } from '../camera/CameraConfig';
import { type CameraUserSettings, ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { DEFAULT_PLAYER_CONFIG, validatePlayerConfig } from '../config/playerConfig';
import { Gameplay } from '../Gameplay';
import { Player } from '../player/Player';
import { buildTestbed } from '../world/Testbed';
import type { World } from '../world/World';
import { AudioBank } from './AudioBank';
import { Input } from './Input';
import { Physics } from './Physics';

const BASE = import.meta.env.BASE_URL;

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
  private composer: EffectComposer | null = null;
  private physics: Physics | null = null;
  private world: World | null = null;
  private player: Player | null = null;
  private cameraRig: ThirdPersonCamera | null = null;
  private gameplay: Gameplay | null = null;
  private paused = false;
  private pendingCameraSettings: CameraUserSettings | null = null;
  private disposed = false;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly parent: HTMLElement;

  constructor(
    parent: HTMLElement,
  ) {
    this.parent = parent;
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.74;
    this.renderer.shadowMap.enabled = true;
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
    if (problems.length) console.warn('[config]', problems);

    await RAPIER.init();
    if (this.disposed) return;
    EventBus.emit('preload:progress', { progress: 0.2 });
    this.physics = new Physics(RAPIER);

    // ?scene=testbed → the character test ground; ?view=greybox → the village as it collides.
    const params = new URLSearchParams(location.search);
    const physics = this.physics;
    const sounds = new SoundFx(this.bank);
    const seed = Number(params.get('seed')) || Date.now() % 100000;
    const gameplay = (this.gameplay = new Gameplay(physics, sounds, seed));
    const buildWorld = async (): Promise<World> => {
      if (params.get('scene') === 'testbed') return buildTestbed(this.scene, this.renderer, physics);
      const { buildVillage } = await import('../world/village/Village');
      return buildVillage(this.scene, this.renderer, physics, params.get('view') === 'greybox' ? 'greybox' : 'art', gameplay.services);
    };
    const [world, gltf] = await Promise.all([
      buildWorld(),
      new GLTFLoader().loadAsync(`${BASE}assets/models/devotee.glb`),
      this.loadAudio(),
    ]);
    if (this.disposed) {
      world.dispose();
      return;
    }
    this.world = world;
    this.player = new Player(
      gltf.scene,
      gltf.animations,
      this.scene,
      this.physics,
      this.input,
      DEFAULT_PLAYER_CONFIG,
      this.bank,
      world.spawn,
      world.spawnYaw,
    );
    this.cameraRig = new ThirdPersonCamera(this.camera, this.player, this.input, this.physics, DEFAULT_CAMERA_CONFIG);
    if (this.pendingCameraSettings) this.cameraRig.setUserSettings(this.pendingCameraSettings);
    gameplay.start(world, this.player, this.cameraRig, this.camera);
    void world.itemIcons?.then((icons) => {
      if (!this.disposed) EventBus.emit('ui:item-icons', { icons });
    });

    const size = this.renderer.getSize(new Vector2());
    // Render into a multisampled target: without it, post-processing silently drops the
    // renderer's antialiasing — and alpha-to-coverage foliage needs MSAA to smooth its edges.
    this.composer = new EffectComposer(
      this.renderer,
      new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: this.renderer.capabilities.isWebGL2 ? 4 : 0 }),
    );
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // High threshold: lamps, flames and the sun's disc bloom; lit walls and sky do not.
    this.composer.addPass(new UnrealBloomPass(size, 0.2, 0.55, 1.45));
    this.composer.addPass(new OutputPass());
    this.resize();

    this.unsubscribers.push(
      EventBus.on('game:pause', () => this.setPaused(true)),
      EventBus.on('game:resume', () => this.setPaused(false)),
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
    this.composer?.dispose();
    this.bank.dispose();
    this.timer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private tick(): void {
    this.renderer.info.reset();
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    if (!this.player || !this.cameraRig || !this.physics || !this.composer || !this.gameplay) return;
    if (!this.paused) {
      this.input.update();
      // While the bag is open, the stick and arrows browse it instead of walking.
      if (this.gameplay.inventoryOpen) {
        this.input.move.set(0, 0);
        this.input.crouchPressed = false;
      }
      this.gameplay.update(dt, this.input.interactPressed);
      // Movement is relative to what the player sees — the follow rig, or an interior's camera.
      this.player.update(dt, this.cameraRig.viewYaw);
      this.physics.step(dt);
      this.cameraRig.update(dt);
      this.world?.follow(this.player.feet);
      this.world?.update?.(dt, this.player.feet, { camera: this.camera, moonlight: this.gameplay.moonlight });
      this.input.endFrame();
    }
    this.composer.render();
  }

  /** Dev-only access for automated browser verification (see devtools.ts). */
  private devHandle() {
    return {
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      input: this.input,
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
      this.bank.load('cloth', [1, 2, 3, 4].map((i) => a(`cloth${i}`))),
    ]);
  }
}

import RAPIER from '@dimforge/rapier3d-compat';
import {
  ACESFilmicToneMapping,
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
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { DEFAULT_PLAYER_CONFIG, validatePlayerConfig } from '../config/playerConfig';
import { Player } from '../player/Player';
import { buildTestbed, type World } from '../world/Testbed';
import { AudioBank } from './AudioBank';
import { Input } from './Input';
import { Physics } from './Physics';

const BASE = import.meta.env.BASE_URL;

/**
 * Owns the renderer, the loop and every system. Created on Play, disposed on quit.
 * Frame order: input → player (interaction, movement, animation, audio) → physics → camera → render.
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
  private paused = false;
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
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    parent.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(parent);
    this.resize();
  }

  async start(): Promise<void> {
    const problems = validatePlayerConfig(DEFAULT_PLAYER_CONFIG);
    if (problems.length) console.warn('[config]', problems);

    await RAPIER.init();
    if (this.disposed) return;
    EventBus.emit('preload:progress', { progress: 0.2 });
    this.physics = new Physics(RAPIER);

    const [world, gltf] = await Promise.all([
      buildTestbed(this.scene, this.renderer, this.physics),
      new GLTFLoader().loadAsync(`${BASE}assets/models/devotee.glb`, (e) => {
        if (e.total) EventBus.emit('preload:progress', { progress: 0.2 + 0.7 * (e.loaded / e.total) });
      }),
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
      world.interactables,
      world.spawn,
      world.spawnYaw,
    );
    this.cameraRig = new ThirdPersonCamera(this.camera, this.player, this.input, this.physics, DEFAULT_PLAYER_CONFIG);

    const size = this.renderer.getSize(new Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(size, 0.22, 0.5, 1.15));
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
    EventBus.emit('scene:ready', { scene: 'testbed' });
    EventBus.emit('ui:player-state', { state: this.player.state.value });
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    for (const u of this.unsubscribers) u();
    this.resizeObserver.disconnect();
    this.input.dispose();
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
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    if (!this.player || !this.cameraRig || !this.physics || !this.composer) return;
    if (!this.paused) {
      this.input.update();
      this.player.update(dt, this.cameraRig.yaw);
      this.physics.step(dt);
      this.cameraRig.update(dt);
      this.world?.follow(this.player.feet);
      this.input.endFrame();
    }
    this.composer.render();
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

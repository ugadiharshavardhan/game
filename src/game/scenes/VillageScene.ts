/**
 * The village — and, by design, the *only* gameplay scene.
 *
 * The temple and the house interiors are zones inside this scene rather than
 * scenes of their own. A scene transition would mean serialising run state
 * across the boundary and rebuilding it on the far side: pure cost, no benefit,
 * and an entire category of transition bugs. See GAME_DESIGN.md §5.
 *
 * Phase 0 scope: a world you can walk, framed correctly on any screen. The
 * moon, shelter, offerings and scoring arrive as systems in later phases.
 */

import Phaser from 'phaser';
import { EventBus } from '../../shared/EventBus';
import { computeCameraZoom } from '../../utils/viewport';
import { COLORS, DEPTH, SceneKey, WORLD } from '../config/constants';
import { Player } from '../entities/Player';
import { TextureKey } from '../graphics/placeholderTextures';
import { InputSystem } from '../systems/InputSystem';

/**
 * Hand-placed landmarks so the world has scale and the camera has something to
 * move past. Phase 6 replaces this with a seeded `SpawnSystem` that enforces
 * the reachability invariant (GAME_DESIGN.md §8, risk 8).
 */
const PLACEHOLDER_STRUCTURES: { x: number; y: number; texture: TextureKey }[] = [
  { x: 1024, y: 300, texture: TextureKey.Temple },
  { x: 380, y: 520, texture: TextureKey.House },
  { x: 1660, y: 470, texture: TextureKey.House },
  { x: 700, y: 1080, texture: TextureKey.House },
  { x: 1420, y: 1160, texture: TextureKey.House },
  { x: 300, y: 1320, texture: TextureKey.House },
  { x: 1850, y: 1250, texture: TextureKey.House },
];

export class VillageScene extends Phaser.Scene {
  private player!: Player;
  private inputSystem!: InputSystem;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private debugText: Phaser.GameObjects.Text | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    super(SceneKey.Village);
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);

    const ground = this.add
      .tileSprite(0, 0, WORLD.width, WORLD.height, TextureKey.Ground)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ground);

    const structures = this.physics.add.staticGroup();
    for (const spot of PLACEHOLDER_STRUCTURES) {
      const sprite: Phaser.Physics.Arcade.Sprite = structures.create(spot.x, spot.y, spot.texture);
      sprite.setDepth(DEPTH.structure);
      sprite.refreshBody();
    }

    // Spawn on the temple approach so the destination is visible from the
    // first frame on both a wide desktop canvas and a narrow phone one.
    this.player = new Player(this, 1024, 500);
    this.physics.add.collider(this.player, structures);

    this.inputSystem = new InputSystem(this);
    if (import.meta.env.DEV) this.createDebugReadout();

    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD.width, WORLD.height);
    camera.setBackgroundColor(COLORS.nightSky);
    camera.startFollow(this.player, true, 0.12, 0.12);
    this.applyZoom();
    this.setupUiCamera(ground, structures);
    // The readout is built before the cameras exist (setupUiCamera needs it in
    // hand to assign it), so its first values are pre-zoom. Refresh once here
    // or it reports zoom 1.00 until the first resize.
    this.updateDebugReadout();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.unsubscribers.push(
      EventBus.on('game:pause', this.handlePause),
      EventBus.on('game:resume', this.handleResume),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup);

    EventBus.emit('scene:ready', { scene: SceneKey.Village });
    // The seed is a placeholder until SpawnSystem owns run generation (phase 1).
    EventBus.emit('run:started', { seed: 0 });
  }

  update(): void {
    this.inputSystem.update();
    this.player.move(this.inputSystem.getMoveVector());
  }

  // ---- framing ----------------------------------------------------------

  /**
   * Zoom is derived from the canvas size so that a guaranteed minimum world
   * area is visible on every aspect ratio — no letterboxing, no keyhole view on
   * a tall phone. See `utils/viewport.ts` for the reasoning.
   */
  private applyZoom(): void {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setZoom(computeCameraZoom(width, height));
  }

  /**
   * Screen-space canvas UI gets its own camera, left at zoom 1.
   *
   * `setScrollFactor(0)` pins an object to the camera, but the camera's *zoom*
   * still scales it about the camera's centre — so at zoom 1.5 the virtual
   * joystick would render offset from the finger that drew it, and the offset
   * grows the further from centre you touch. A second unzoomed camera is the
   * standard fix: the world camera ignores the UI, the UI camera ignores the
   * world. `CameraManager.resize` keeps both in step on rotate.
   */
  private setupUiCamera(
    ground: Phaser.GameObjects.TileSprite,
    structures: Phaser.Physics.Arcade.StaticGroup,
  ): void {
    const { width, height } = this.scale.gameSize;
    this.uiCamera = this.cameras.add(0, 0, width, height);
    this.uiCamera.setName('ui');

    const uiObjects = this.inputSystem.getDisplayObjects();
    if (this.debugText) uiObjects.push(this.debugText);

    this.cameras.main.ignore(uiObjects);
    this.uiCamera.ignore([ground, this.player]);
    this.uiCamera.ignore(structures);
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.cameras.resize(gameSize.width, gameSize.height);
    this.applyZoom();
    this.updateDebugReadout();
  };

  // ---- pause (driven by React; see shared/events.ts) ---------------------

  private readonly handlePause = (): void => {
    this.player.stop();
    this.scene.pause();
  };

  private readonly handleResume = (): void => {
    this.scene.resume();
  };

  // ---- teardown ---------------------------------------------------------

  private readonly cleanup = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.inputSystem.destroy();
  };

  // ---- dev-only framing readout -----------------------------------------

  private createDebugReadout(): void {
    this.debugText = this.add
      .text(8, 8, '', { fontFamily: 'monospace', fontSize: '12px', color: '#f6c453' })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui)
      .setAlpha(0.7);
    this.updateDebugReadout();
  }

  private updateDebugReadout(): void {
    if (!this.debugText) return;
    const { width, height } = this.scale.gameSize;
    const zoom = this.cameras.main.zoom;
    const visibleW = Math.round(width / zoom);
    const visibleH = Math.round(height / zoom);
    this.debugText.setText(
      `canvas ${Math.round(width)}x${Math.round(height)}  zoom ${zoom.toFixed(2)}  world view ${visibleW}x${visibleH}`,
    );
  }
}

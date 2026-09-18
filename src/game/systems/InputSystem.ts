/**
 * One movement abstraction over keyboard and touch.
 *
 * Scenes ask `getMoveVector()` and never learn which device produced it. That
 * is the whole point: when the interaction verb and shelter prompts arrive in
 * later phases, they are written once rather than once per input method.
 *
 * The virtual joystick is drawn here rather than in a separate renderer because
 * a joystick's visual *is* its affordance — splitting them would mean keeping
 * two files in sync for no gain.
 */

import Phaser from 'phaser';
import type { Vec2 } from '../../shared/types';
import { COLORS, DEPTH, JOYSTICK } from '../config/constants';
import { isTouchPrimary } from '../../utils/viewport';

type Direction = 'up' | 'down' | 'left' | 'right';

export class InputSystem {
  private scene: Phaser.Scene;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: Record<Direction, Phaser.Input.Keyboard.Key> | null = null;

  private readonly touchEnabled: boolean;
  private joystick: Phaser.GameObjects.Graphics | null = null;
  private activePointerId: number | null = null;
  private origin: Vec2 = { x: 0, y: 0 };
  private currentPoint: Vec2 = { x: 0, y: 0 };

  /** Reused each frame so `update` allocates nothing. */
  private readonly moveVector: Vec2 = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const keyboard = scene.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.wasd = {
        up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }

    this.touchEnabled = isTouchPrimary();
    if (this.touchEnabled) {
      this.joystick = scene.add
        .graphics()
        .setScrollFactor(0)
        .setDepth(DEPTH.ui)
        .setVisible(false);

      scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    }
  }

  /** Call once per frame, before anything reads `getMoveVector()`. */
  update(): void {
    let x = 0;
    let y = 0;

    if (this.activePointerId !== null) {
      ({ x, y } = this.readJoystick());
    } else {
      if (this.isDown('left')) x -= 1;
      if (this.isDown('right')) x += 1;
      if (this.isDown('up')) y -= 1;
      if (this.isDown('down')) y += 1;
    }

    // Normalise so diagonals aren't faster than cardinals.
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }

    this.moveVector.x = x;
    this.moveVector.y = y;

    this.drawJoystick();
  }

  getMoveVector(): Readonly<Vec2> {
    return this.moveVector;
  }

  /**
   * Objects this system draws in screen space. The scene assigns them to the
   * unzoomed UI camera — see `VillageScene.setupUiCamera`.
   */
  getDisplayObjects(): Phaser.GameObjects.GameObject[] {
    return this.joystick ? [this.joystick] : [];
  }

  destroy(): void {
    const input = this.scene.input;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);

    this.joystick?.destroy();
    this.joystick = null;
    this.cursors = null;
    this.wasd = null;
  }

  // ---- internals --------------------------------------------------------

  private isDown(direction: Direction): boolean {
    return Boolean(this.cursors?.[direction].isDown) || Boolean(this.wasd?.[direction].isDown);
  }

  /** Deflection from the stick origin, as a vector of magnitude 0..1. */
  private readJoystick(): Vec2 {
    const dx = this.currentPoint.x - this.origin.x;
    const dy = this.currentPoint.y - this.origin.y;
    const distance = Math.hypot(dx, dy);

    if (distance < JOYSTICK.deadZone) return { x: 0, y: 0 };

    const scale = Math.min(distance, JOYSTICK.maxDeflection) / distance;
    return {
      x: (dx * scale) / JOYSTICK.maxDeflection,
      y: (dy * scale) / JOYSTICK.maxDeflection,
    };
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.activePointerId !== null) return;
    this.activePointerId = pointer.id;
    this.origin = { x: pointer.x, y: pointer.y };
    this.currentPoint = { x: pointer.x, y: pointer.y };
    this.joystick?.setVisible(true);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.activePointerId) return;
    this.currentPoint = { x: pointer.x, y: pointer.y };
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.activePointerId) return;
    this.activePointerId = null;
    this.joystick?.setVisible(false).clear();
  }

  private drawJoystick(): void {
    if (!this.joystick || this.activePointerId === null) return;

    const deflection = this.readJoystick();
    const thumbX = this.origin.x + deflection.x * JOYSTICK.maxDeflection;
    const thumbY = this.origin.y + deflection.y * JOYSTICK.maxDeflection;

    this.joystick
      .clear()
      .lineStyle(2, COLORS.joystick, 0.45)
      .strokeCircle(this.origin.x, this.origin.y, JOYSTICK.baseRadius)
      .fillStyle(COLORS.joystick, 0.18)
      .fillCircle(this.origin.x, this.origin.y, JOYSTICK.baseRadius)
      .fillStyle(COLORS.joystick, 0.7)
      .fillCircle(thumbX, thumbY, JOYSTICK.thumbRadius);
  }
}

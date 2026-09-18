/**
 * The devotee.
 *
 * Phase 0: a body that moves and collides. Purity, inventory and shelter state
 * are owned by their systems (GAME_DESIGN.md §4), not by this class — the
 * entity stays a body, the systems stay the rules.
 */

import Phaser from 'phaser';
import type { Vec2 } from '../../shared/types';
import { DEPTH, PLAYER } from '../config/constants';
import { TextureKey } from '../graphics/placeholderTextures';

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TextureKey.Player);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(DEPTH.player);
    this.setCollideWorldBounds(true);

    // A circular body reads better than a box when squeezing between houses.
    const inset = PLAYER.size / 2 - PLAYER.bodyRadius;
    this.setCircle(PLAYER.bodyRadius, inset, inset);
  }

  /** `direction` is expected normalised; magnitude is ignored. */
  move(direction: Vec2): void {
    this.setVelocity(direction.x * PLAYER.speed, direction.y * PLAYER.speed);
  }

  stop(): this {
    this.setVelocity(0, 0);
    return this;
  }
}

/**
 * Boot: configure the engine, then get out of the way.
 *
 * Nothing that can fail and nothing that takes time belongs here — Boot runs
 * before any loading UI exists, so an error here is a blank screen with no
 * explanation. Asset loading is PreloadScene's job.
 */

import Phaser from 'phaser';
import { SceneKey } from '../config/constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    // Two pointers: one to drive the joystick, one spare so a second touch
    // (the action verb, later) doesn't steal the first one's identity.
    this.input.addPointer(2);

    // Keyboard input should not scroll the page on desktop.
    this.input.keyboard?.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);

    this.scene.start(SceneKey.Preload);
  }
}

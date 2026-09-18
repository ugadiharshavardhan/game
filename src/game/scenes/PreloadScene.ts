/**
 * Preload: build every texture the game needs, reporting progress to React.
 *
 * The load queue is empty today — phase 0 generates its art at runtime (see
 * `graphics/placeholderTextures.ts`). The progress wiring exists anyway because
 * it is the seam real assets drop into, and wiring it now means the loading UI
 * is proven before there is 4MB of atlas to hide behind it.
 */

import Phaser from 'phaser';
import { EventBus } from '../../shared/EventBus';
import { SceneKey } from '../config/constants';
import { generatePlaceholderTextures } from '../graphics/placeholderTextures';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Preload);
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      EventBus.emit('preload:progress', { progress });
    });

    // Real asset loads go here (phase 9):
    //   this.load.atlas('village', 'assets/images/village.png', 'assets/images/village.json');
    //   this.load.audio('ambience-day', 'assets/audio/ambience-day.ogg');
  }

  create(): void {
    generatePlaceholderTextures(this);
    EventBus.emit('preload:progress', { progress: 1 });
    this.scene.start(SceneKey.Village);
  }
}

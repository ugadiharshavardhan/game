import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { VillageScene } from '../scenes/VillageScene';
import { COLORS } from './constants';

/**
 * `Scale.RESIZE` rather than `Scale.FIT` is the key responsiveness decision.
 *
 * FIT picks a design resolution and letterboxes everything else, which turns a
 * 16:9 layout into a keyhole on a 9:19.5 phone. RESIZE makes the canvas exactly
 * the size of its container and lets the scene decide how much world to show —
 * so the camera zoom (see VillageScene.applyZoom) guarantees a minimum visible
 * area instead, and every aspect ratio gets a full-bleed view.
 *
 * Note on DPR: the canvas renders at CSS-pixel resolution. That is a deliberate
 * phase-0 trade — it is materially faster on mid-range Android, and a stylised
 * game reads fine without it. Hi-DPI is a phase-9 polish item.
 */
export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: COLORS.nightSky,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: parent.clientWidth || window.innerWidth,
      height: parent.clientHeight || window.innerHeight,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    render: {
      antialias: true,
      powerPreference: 'high-performance',
    },
    scene: [BootScene, PreloadScene, VillageScene],
  };
}

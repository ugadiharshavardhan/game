/**
 * Runtime-generated placeholder art.
 *
 * Phase 0 deliberately ships no image files. Generating shapes here means the
 * project has zero binary assets to review, no art pipeline to maintain before
 * the art exists, and no risk of committing borrowed sprites into a contest
 * entry. `PreloadScene` swaps these for real atlases in phase 9; the texture
 * keys below are the contract that makes that swap a one-file change.
 */

import Phaser from 'phaser';
import { COLORS, PLAYER, WORLD } from '../config/constants';

export const TextureKey = {
  Player: 'player',
  Ground: 'ground',
  House: 'house',
  Temple: 'temple',
} as const;

export type TextureKey = (typeof TextureKey)[keyof typeof TextureKey];

export function generatePlaceholderTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // --- Ground: a two-tone tile, drawn once and repeated by a TileSprite. ---
  const tile = WORLD.tileSize;
  g.fillStyle(COLORS.ground, 1).fillRect(0, 0, tile * 2, tile * 2);
  g.fillStyle(COLORS.groundAlt, 1);
  g.fillRect(0, 0, tile, tile);
  g.fillRect(tile, tile, tile, tile);
  g.lineStyle(1, COLORS.gridLine, 0.5).strokeRect(0.5, 0.5, tile * 2 - 1, tile * 2 - 1);
  g.generateTexture(TextureKey.Ground, tile * 2, tile * 2);
  g.clear();

  // --- Player: a lamp-lit circle. Faces nothing yet; phase 1 adds direction. ---
  const s = PLAYER.size;
  g.fillStyle(COLORS.playerAccent, 1).fillCircle(s / 2, s / 2, s / 2);
  g.fillStyle(COLORS.player, 1).fillCircle(s / 2, s / 2, s / 2 - 3);
  g.fillStyle(0xffffff, 0.55).fillCircle(s / 2 - 4, s / 2 - 5, 3);
  g.generateTexture(TextureKey.Player, s, s);
  g.clear();

  // --- House: body plus roof. Becomes a shelter in phase 4. ---
  drawBuilding(g, 128, 112, COLORS.structure, COLORS.structureRoof);
  g.generateTexture(TextureKey.House, 128, 112);
  g.clear();

  // --- Temple: larger, warmer, with a dome. The run's destination. ---
  drawBuilding(g, 192, 160, COLORS.temple, COLORS.structureRoof);
  g.fillStyle(COLORS.temple, 1).fillCircle(96, 34, 26);
  g.fillStyle(COLORS.player, 1).fillCircle(96, 8, 6);
  g.generateTexture(TextureKey.Temple, 192, 160);

  g.destroy();
}

function drawBuilding(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  body: number,
  roof: number,
): void {
  const roofHeight = Math.round(height * 0.38);
  g.fillStyle(body, 1).fillRect(0, roofHeight, width, height - roofHeight);
  g.fillStyle(roof, 1);
  g.fillTriangle(0, roofHeight, width, roofHeight, width / 2, 0);
  // Doorway — where the shelter interaction will live.
  g.fillStyle(0x1a1208, 1).fillRect(width / 2 - 14, height - 34, 28, 34);
}

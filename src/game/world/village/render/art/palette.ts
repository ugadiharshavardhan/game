/**
 * The village's colours. Mineral and lime-wash paints, sun-faded — never saturated "game" colours.
 *
 * Reference: Maharashtrian and Konkan villages at festival time. Lime-washed walls in white,
 * ochre, indigo-blue and faded turquoise; a geru (red-oxide) dado band at the base; teak and
 * painted doors; clay tiles weathered to brick-brown. Festival colour comes from marigolds,
 * mango leaves, saffron cloth and lamp flame — small, bright accents on a quiet, earthy base.
 */
import { Color } from 'three';
import type { PaintId } from '../../types';

/** Wall paint (linear-ish sRGB hex; multiplied with the plaster texture). */
export const WALL_PAINT: Record<PaintId, string> = {
  limewhite: '#e9e1d0',
  ochre: '#d8b377',
  indigo: '#8ea4c2',
  turquoise: '#8fbcb2',
  rose: '#d6a597',
  saffron: '#e0a766',
  sage: '#b3b99a',
};

/** The painted dado band along the base of a wall — geru red is the classic. */
export const DADO_PAINT: Record<PaintId, string> = {
  limewhite: '#9a4a35',
  ochre: '#8a3f2c',
  indigo: '#4b5f86',
  turquoise: '#3f6f69',
  rose: '#8c4a3b',
  saffron: '#8a3f2c',
  sage: '#5b6247',
};

/** Painted woodwork (doors, shutters, fascia). */
export const WOOD_PAINT = ['#3f6b62', '#2f4f73', '#6b2f2a', '#5a4630', '#4d6a3a', '#7a5a2e'] as const;

export const TONE = {
  teak: '#8a5a36',
  darkTeak: '#4f321f',
  weatheredWood: '#9a8166',
  terracotta: '#b0643f',
  ridge: '#8f4a2e',
  stone: '#c9b089',
  stoneDark: '#9c8566',
  cement: '#b9b2a4',
  soot: '#2a1d16',
  brass: '#c79a3d',
  iron: '#2e2a26',
  thatch: '#b89a5a',
  sindoor: '#d8471f',
  turmeric: '#e0a52a',
  marigold: '#f09a1c',
  marigoldYellow: '#f5c233',
  mangoLeaf: '#3d6b2a',
  saffronCloth: '#e8872b',
  vermilion: '#c8321e',
  flame: '#ffb45a',
  lampGlow: '#ff9a3c',
  interior: '#1a1009',
  water: '#2f5a5e',
} as const;

export const col = (hex: string) => new Color(hex);

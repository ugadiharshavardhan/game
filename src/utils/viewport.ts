/** Pure viewport/layout maths. No Phaser, no React — trivially testable. */

import { VIEW } from '../game/config/constants';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Camera zoom for a given canvas size.
 *
 * The problem this solves: a fixed design resolution letterboxes badly. A 16:9
 * layout on a 9:19.5 phone becomes a keyhole, and "is there a house near me?" —
 * the core decision of the game — stops being answerable.
 *
 * So instead of fitting a fixed canvas, we guarantee a minimum *world area* is
 * always visible and let the aspect ratio show more than that on whichever axis
 * happens to be long. Desktop sees a wide strip, portrait phones see a tall one,
 * and both see at least as much as the design assumes.
 *
 * Zoom is clamped so very narrow viewports don't render the player as a speck;
 * below roughly 480px wide the minimum-area guarantee yields to legibility.
 */
export function computeCameraZoom(viewportWidth: number, viewportHeight: number): number {
  if (viewportWidth <= 0 || viewportHeight <= 0) return 1;

  const fit = Math.min(
    viewportWidth / VIEW.minVisibleWidth,
    viewportHeight / VIEW.minVisibleHeight,
  );

  // Round to 2dp so resize doesn't churn the camera matrix on every pixel.
  return clamp(Math.round(fit * 100) / 100, VIEW.minZoom, VIEW.maxZoom);
}

/** True when touch is the primary input — decides whether to draw the joystick. */
export function isTouchPrimary(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

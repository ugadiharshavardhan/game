/**
 * Everything the player can change, kept in this browser and sent to the engine when it starts.
 *
 * Quality is the one that matters on a phone: it decides the shadow map, the pixel ratio and how
 * far the village draws. 'auto' looks at the device once and picks.
 */
import { EventBus } from '../shared/EventBus';
import type { GameSettings, QualityLevel } from '../shared/types';

const KEY = 'moonlight-seva.settings';

export const DEFAULT_SETTINGS: GameSettings = {
  sensitivity: 1,
  invertY: false,
  volume: 0.9,
  quality: 'auto',
  showTouchControls: 'auto',
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<GameSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private browsing: the settings hold for this session.
  }
  EventBus.emit('game:settings', settings);
}

/**
 * What this device can be asked for. Deliberately blunt: a phone gets the cheap version, a
 * desktop with a real GPU gets everything, and anything in between gets the middle.
 */
export function detectQuality(): Exclude<QualityLevel, 'auto'> {
  if (typeof navigator === 'undefined') return 'medium';
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (coarse || cores <= 4 || memory <= 4) return 'low';
  if (cores <= 8 || memory <= 8) return 'medium';
  return 'high';
}

export function resolveQuality(setting: QualityLevel): Exclude<QualityLevel, 'auto'> {
  return setting === 'auto' ? detectQuality() : setting;
}

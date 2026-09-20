/**
 * The moon's five states, and everything the rest of the game reads off them.
 *
 *   SAFE         the village goes about its evening; nothing costs you anything
 *   WARNING      the sky darkens, stars come out, the village quiets, people start home,
 *                the temple bell rings — the signs that say "find a door"
 *   MOON_RISING  the moon clears the hills; its light spreads; exposure begins, gently
 *   MOON_ACTIVE  full moonlight: outside costs you, indoors costs you nothing
 *   MOON_FADING  clouds take the moon back; the light warms and the village comes out again
 *
 * This is a game clock, not astronomy: plain durations, all configurable.
 */
export const MOON_STATES = ['safe', 'warning', 'rising', 'active', 'fading'] as const;
export type MoonStateName = (typeof MOON_STATES)[number];

export interface MoonCycleConfig {
  /** Seconds in each state. */
  durations: Record<MoonStateName, number>;
  /** The first safe stretch, so a new player has time to learn the village. */
  firstSafe: number;
  /** ± fraction of jitter on each duration, seeded — so the sky is read, not counted. */
  jitter: number;
}

/**
 * One turn of the sky is about four minutes: two of cloud to work under, then the signs, then a
 * minute and a half with the moon out. Against the night's playable stretch (NightClock: roughly
 * eleven and a half minutes between the evening and dawn) that is three moonrises in a run —
 * enough for the rhythm of collect, hide, collect to be learned inside one night.
 */
export const DEFAULT_MOON_CONFIG: MoonCycleConfig = {
  durations: { safe: 120, warning: 25, rising: 18, active: 55, fading: 18 },
  firstSafe: 45,
  jitter: 0.08,
};

export interface MoonStateInfo {
  /** For the HUD and for anyone switching on the state. */
  name: MoonStateName;
  /** Shown in the moon indicator — the sky in words, never a countdown. */
  label: string;
  /** The accessibility line under it, when there is one to say. */
  note?: string;
  /** Standing outside costs exposure. */
  dangerous: boolean;
  /** Villagers head home; dogs settle. */
  goingHome: boolean;
}

export const MOON_STATE_INFO: Record<MoonStateName, MoonStateInfo> = {
  safe: { name: 'safe', label: 'Clouds over the moon', dangerous: false, goingHome: false },
  warning: { name: 'warning', label: 'The clouds are thinning', note: 'Moonrise approaching', dangerous: false, goingHome: true },
  rising: { name: 'rising', label: 'The moon is rising', note: 'Find shelter', dangerous: true, goingHome: true },
  active: { name: 'active', label: 'Moonlight', note: 'Stay indoors', dangerous: true, goingHome: true },
  fading: { name: 'fading', label: 'The clouds gather again', dangerous: false, goingHome: false },
};

/**
 * How much moonlight is in the world, 0..1 — the single number the sky, the lights, the fog and
 * the exposure rate all follow. It starts before the moon is up (the sky cools through WARNING)
 * and eases rather than steps, so the change always reads as a sky, not a switch.
 */
export function moonlightFor(state: MoonStateName, progress: number): number {
  const t = smooth(progress);
  switch (state) {
    case 'safe':
      return 0;
    case 'warning':
      return 0.22 * t;
    case 'rising':
      return 0.22 + 0.63 * t;
    case 'active':
      return 0.85 + 0.15 * Math.min(t * 3, 1);
    case 'fading':
      return 1 - t;
  }
}

/** How fast exposure builds outdoors in this state, as a fraction of the full rate. */
export function exposureRateFor(state: MoonStateName, progress: number): number {
  switch (state) {
    case 'rising':
      return 0.15 + 0.55 * smooth(progress);
    case 'active':
      return 1;
    case 'fading':
      return 0.7 * (1 - smooth(progress));
    default:
      return 0;
  }
}

const smooth = (t: number) => {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
};

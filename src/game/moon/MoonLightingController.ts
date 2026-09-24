/**
 * The look of the evening, from the last of the sun to a moon high over the village.
 *
 * Four moments are written down — SUNSET, DUSK, MOONRISE, MOONLIGHT — and everything between them
 * is interpolated, so the sky never steps. The single shadow-casting light is the sun until it
 * goes down and the moon after; the hand-over happens at the darkest minute of dusk, when the
 * light is nearly out and nobody can see it move.
 *
 * Two rules from the brief shape the palette. *Not everything blue*: the night is indigo-violet,
 * the earth keeps a warm bounce, and the village's own fire — diyas, lamps, lit windows — is
 * pushed up as the sky comes down, so the frame is always warm against cool. *No excessive
 * bloom*: brightness comes from exposure and from the lamps themselves, never from a haze pass.
 *
 * Cost: one light, one hemisphere, a sky dome, ~1500 star points. Nothing
 * here scales with the village, which is what makes it safe on a phone.
 */
import { Color, MathUtils } from 'three';
import type { Environment, SkyLook } from '../world/environment';
import type { MoonFrame } from '../world/World';

/** A moment of the evening, keyed to how much moonlight is falling (0 = sunset, 1 = full moon). */
interface Keyframe extends SkyLook {
  at: number;
}

type ColourKey = 'lightColour' | 'hemiSky' | 'hemiGround' | 'fogColour';
type Written = Omit<SkyLook, ColourKey | 'skyTint'> & Record<ColourKey, string> & { skyTint: [number, number, number] };

const look = (at: number, o: Written): Keyframe => ({
  ...o,
  at,
  lightColour: new Color(o.lightColour),
  hemiSky: new Color(o.hemiSky),
  hemiGround: new Color(o.hemiGround),
  fogColour: new Color(o.fogColour),
  skyTint: new Color(...o.skyTint),
});

/** Where the sun sets, the arc the moon climbs from the opposite horizon, and where 5 a.m. comes up. */
const SUN_AZIMUTH = 250;
const MOON_AZIMUTH = 100;
const DAWN_AZIMUTH = 75;
/** The moonlight value at which the moon takes the sun's place as the one real light. */
const HANDOVER = 0.34;

export const LOOKS: Keyframe[] = [
  // SUNSET / EARLY EVENING — warm golden festival horizon, crisp deep indigo sky, moon visible with clouds.
  look(0, {
    lightElevation: 7,
    lightAzimuth: SUN_AZIMUTH,
    lightColour: '#ffb06a',
    lightIntensity: 2.0,
    shadowSoftness: 2.6,
    hemiSky: '#4a6096',
    hemiGround: '#423326',
    hemiIntensity: 0.62,
    fogColour: '#161d33',
    fogDensity: 0.0055,
    envIntensity: 0.45,
    turbidity: 8,
    rayleigh: 2.4,
    mieCoefficient: 0.0035,
    mieDirectionalG: 0.8,
    skyTint: [0.95, 0.95, 1.0],
    skyBodyIsMoon: false,
    starOpacity: 0,
    moonOpacity: 0,
    exposure: 0.92,
  }),
  // The sun touching the roofs: warm amber rays, crisp night atmosphere.
  look(0.12, {
    lightElevation: 2.4,
    lightAzimuth: SUN_AZIMUTH + 4,
    lightColour: '#ff8848',
    lightIntensity: 1.35,
    shadowSoftness: 3,
    hemiSky: '#42568c',
    hemiGround: '#3a2b20',
    hemiIntensity: 0.58,
    fogColour: '#141a2e',
    fogDensity: 0.0058,
    envIntensity: 0.38,
    turbidity: 7.5,
    rayleigh: 2.8,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.82,
    skyTint: [0.85, 0.88, 0.98],
    skyBodyIsMoon: false,
    starOpacity: 0.2,
    moonOpacity: 0.3,
    exposure: 0.94,
  }),
  // DUSK — the sun dips behind the hills, the sky goes deep sapphire blue, stars twinkle.
  look(0.22, {
    lightElevation: 0.8,
    lightAzimuth: SUN_AZIMUTH + 8,
    lightColour: '#e86a42',
    lightIntensity: 0.65,
    shadowSoftness: 3.4,
    hemiSky: '#3b4e82',
    hemiGround: '#2e241c',
    hemiIntensity: 0.55,
    fogColour: '#11172a',
    fogDensity: 0.006,
    envIntensity: 0.3,
    turbidity: 5.5,
    rayleigh: 3.0,
    mieCoefficient: 0.0045,
    mieDirectionalG: 0.8,
    skyTint: [0.65, 0.72, 0.92],
    skyBodyIsMoon: false,
    starOpacity: 0.55,
    moonOpacity: 0.7,
    exposure: 0.96,
  }),
  // The last of the sun. The village is lit by its warm lamps and diyas.
  look(HANDOVER, {
    lightElevation: 0.5,
    lightAzimuth: SUN_AZIMUTH + 12,
    lightColour: '#a07870',
    lightIntensity: 0.22,
    shadowSoftness: 3.6,
    hemiSky: '#324272',
    hemiGround: '#241e1a',
    hemiIntensity: 0.52,
    fogColour: '#0e1424',
    fogDensity: 0.0062,
    envIntensity: 0.24,
    turbidity: 4,
    rayleigh: 2.6,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.78,
    skyTint: [0.35, 0.42, 0.62],
    skyBodyIsMoon: false,
    starOpacity: 0.75,
    moonOpacity: 0.85,
    exposure: 0.98,
  }),
  // The same instant, from the other horizon: the moon is now the light.
  look(HANDOVER + 0.0001, {
    lightElevation: 4,
    lightAzimuth: MOON_AZIMUTH,
    lightColour: '#9eb8eb',
    lightIntensity: 0.24,
    shadowSoftness: 3.6,
    hemiSky: '#324272',
    hemiGround: '#241e1a',
    hemiIntensity: 0.52,
    fogColour: '#0e1424',
    fogDensity: 0.0062,
    envIntensity: 0.24,
    turbidity: 4,
    rayleigh: 2.6,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.78,
    skyTint: [0.35, 0.42, 0.62],
    skyBodyIsMoon: true,
    starOpacity: 0.75,
    moonOpacity: 0.85,
    exposure: 0.98,
  }),
  // MOONRISE — the disc clears the palms, its light spreads across the fields.
  look(0.62, {
    lightElevation: 16,
    lightAzimuth: MOON_AZIMUTH - 4,
    lightColour: '#b2c8f0',
    lightIntensity: 0.75,
    shadowSoftness: 3.2,
    hemiSky: '#2c3c6a',
    hemiGround: '#1c1816',
    hemiIntensity: 0.52,
    fogColour: '#0d1322',
    fogDensity: 0.0065,
    envIntensity: 0.2,
    turbidity: 3,
    rayleigh: 1.6,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.76,
    skyTint: [0.15, 0.2, 0.35],
    skyBodyIsMoon: true,
    starOpacity: 0.9,
    moonOpacity: 0.95,
    exposure: 1.0,
  }),
  // MOONLIGHT — strong but soft, crisp shadows, warm glowing windows and diyas.
  look(1, {
    lightElevation: 38,
    lightAzimuth: MOON_AZIMUTH - 8,
    lightColour: '#bed2fa',
    lightIntensity: 1.15,
    shadowSoftness: 2.8,
    hemiSky: '#26345e',
    hemiGround: '#16141a',
    hemiIntensity: 0.54,
    fogColour: '#0a101e',
    fogDensity: 0.0068,
    envIntensity: 0.16,
    turbidity: 2,
    rayleigh: 1,
    mieCoefficient: 0.0035,
    mieDirectionalG: 0.74,
    skyTint: [0.08, 0.12, 0.22],
    skyBodyIsMoon: true,
    starOpacity: 1,
    moonOpacity: 1,
    exposure: 1.02,
  }),
];

/**
 * DAWN — 05:00, the far end of the night. Not on the moonlight curve at all: the sky is blended
 * toward this by its own 0..1, so the last minutes lighten from wherever the moon left them.
 *
 * It is the sunset palette read backwards — a low sun from the *other* horizon, the stars going
 * out, the first cool light in the lanes — which is what makes it legible as morning rather than as
 * the evening the player started in.
 */
export const DAWN: SkyLook = look(0, {
  lightElevation: 3.5,
  lightAzimuth: DAWN_AZIMUTH,
  lightColour: '#ffb98a',
  lightIntensity: 0.9,
  shadowSoftness: 3.2,
  hemiSky: '#93a3cf',
  hemiGround: '#5b4734',
  hemiIntensity: 0.6,
  fogColour: '#8b8095',
  fogDensity: 0.013,
  envIntensity: 0.38,
  turbidity: 7,
  rayleigh: 3,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8,
  skyTint: [0.8, 0.76, 0.85],
  skyBodyIsMoon: false,
  starOpacity: 0.04,
  moonOpacity: 0.03,
  exposure: 0.78,
});

/** Fastest the sky may travel, in moonlight per second — only a skipped state ever hits it. */
const MAX_RATE = 0.5;

export class MoonLightingController {
  /**
   * 0..1: how far into the night the sky is. The art reads this to push the village's own fire.
   *
   * It follows whichever is higher — the floor the night clock sets once the lamps are lit, or
   * the moonlight actually falling. That is what keeps a cloudy stretch at one in the morning
   * dark: without the floor, every safe window would render as the sunset the curve starts on.
   */
  night = 0;
  /** 0..1 of morning blended over the top of the curve. */
  dawn = 0;
  private readonly env: Environment;
  private readonly current: SkyLook;
  private readonly sampled: SkyLook;

  constructor(env: Environment) {
    this.env = env;
    this.current = blank();
    this.sampled = blank();
    this.apply(0);
  }

  update(dt: number, moon: MoonFrame): void {
    const target = Math.max(moon.nightBase, moon.moonlight);
    const step = MathUtils.clamp(target - this.night, -MAX_RATE * dt, MAX_RATE * dt);
    const dawnStep = MathUtils.clamp(moon.dawn - this.dawn, -MAX_RATE * dt, MAX_RATE * dt);
    this.apply(this.night + step, this.dawn + dawnStep);
  }

  /** Sets the sky outright (start of a run, or a skipped state in dev). */
  apply(k: number, dawn = this.dawn): void {
    this.night = MathUtils.clamp(k, 0, 1);
    this.dawn = MathUtils.clamp(dawn, 0, 1);
    sample(this.night, this.sampled);
    blend(this.sampled, DAWN, this.dawn, this.current);
    this.env.setLook(this.current);
  }
}

/** Mixes two looks into `out` by `t`, allocating nothing. The sky body is never a blend of two. */
function blend(a: SkyLook, b: SkyLook, t: number, out: SkyLook): SkyLook {
  const n = (x: number, y: number) => MathUtils.lerp(x, y, t);
  out.lightElevation = n(a.lightElevation, b.lightElevation);
  out.lightAzimuth = n(a.lightAzimuth, b.lightAzimuth);
  out.lightColour.copy(a.lightColour).lerp(b.lightColour, t);
  out.lightIntensity = n(a.lightIntensity, b.lightIntensity);
  out.shadowSoftness = n(a.shadowSoftness, b.shadowSoftness);
  out.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
  out.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, t);
  out.hemiIntensity = n(a.hemiIntensity, b.hemiIntensity);
  out.fogColour.copy(a.fogColour).lerp(b.fogColour, t);
  out.fogDensity = n(a.fogDensity, b.fogDensity);
  out.envIntensity = n(a.envIntensity, b.envIntensity);
  out.turbidity = n(a.turbidity, b.turbidity);
  out.rayleigh = n(a.rayleigh, b.rayleigh);
  out.mieCoefficient = n(a.mieCoefficient, b.mieCoefficient);
  out.mieDirectionalG = n(a.mieDirectionalG, b.mieDirectionalG);
  out.skyTint.copy(a.skyTint).lerp(b.skyTint, t);
  out.starOpacity = n(a.starOpacity, b.starOpacity);
  out.moonOpacity = n(a.moonOpacity, b.moonOpacity);
  out.exposure = n(a.exposure, b.exposure);
  out.skyBodyIsMoon = t < 0.5 ? a.skyBodyIsMoon : b.skyBodyIsMoon;
  return out;
}

/** Interpolates the keyframes into `out`, allocating nothing. */
function sample(k: number, out: SkyLook): SkyLook {
  let i = 1;
  while (i < LOOKS.length - 1 && LOOKS[i].at < k) i++;
  const a = LOOKS[i - 1];
  const b = LOOKS[i];
  // Smoothstep between keyframes: no corner where one segment meets the next.
  const t = MathUtils.smoothstep(k, a.at, b.at);
  const n = (x: number, y: number) => MathUtils.lerp(x, y, t);

  out.lightElevation = n(a.lightElevation, b.lightElevation);
  out.lightAzimuth = n(a.lightAzimuth, b.lightAzimuth);
  out.lightColour.copy(a.lightColour).lerp(b.lightColour, t);
  out.lightIntensity = n(a.lightIntensity, b.lightIntensity);
  out.shadowSoftness = n(a.shadowSoftness, b.shadowSoftness);
  out.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
  out.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, t);
  out.hemiIntensity = n(a.hemiIntensity, b.hemiIntensity);
  out.fogColour.copy(a.fogColour).lerp(b.fogColour, t);
  out.fogDensity = n(a.fogDensity, b.fogDensity);
  out.envIntensity = n(a.envIntensity, b.envIntensity);
  out.turbidity = n(a.turbidity, b.turbidity);
  out.rayleigh = n(a.rayleigh, b.rayleigh);
  out.mieCoefficient = n(a.mieCoefficient, b.mieCoefficient);
  out.mieDirectionalG = n(a.mieDirectionalG, b.mieDirectionalG);
  out.skyTint.copy(a.skyTint).lerp(b.skyTint, t);
  out.starOpacity = n(a.starOpacity, b.starOpacity);
  out.moonOpacity = n(a.moonOpacity, b.moonOpacity);
  out.exposure = n(a.exposure, b.exposure);
  // The body the sky glows around is whichever light is up — never a blend of the two.
  out.skyBodyIsMoon = t < 0.5 ? a.skyBodyIsMoon : b.skyBodyIsMoon;
  return out;
}

function blank(): SkyLook {
  return {
    lightElevation: 0,
    lightAzimuth: 0,
    lightColour: new Color(),
    lightIntensity: 0,
    shadowSoftness: 3,
    hemiSky: new Color(),
    hemiGround: new Color(),
    hemiIntensity: 0,
    fogColour: new Color(),
    fogDensity: 0,
    envIntensity: 0,
    turbidity: 6,
    rayleigh: 3,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
    skyTint: new Color(1, 1, 1),
    skyBodyIsMoon: false,
    starOpacity: 0,
    moonOpacity: 0,
    exposure: 0.74,
  };
}

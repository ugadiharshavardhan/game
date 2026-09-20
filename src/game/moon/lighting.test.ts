import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Environment, SkyLook } from '../world/environment';
import { MoonLightingController } from './MoonLightingController';

/** An Environment that only remembers the last sky it was given. */
function rig() {
  let look: SkyLook | null = null;
  const env: Environment = {
    sun: null as never,
    sunDir: new Vector3(),
    moonDir: new Vector3(),
    hemi: null as never,
    follow: () => {},
    setLook: (l) => {
      // The controller reuses one object, so keep a copy of each moment.
      look = { ...l, lightColour: l.lightColour.clone(), hemiSky: l.hemiSky.clone(), hemiGround: l.hemiGround.clone(), fogColour: l.fogColour.clone(), skyTint: l.skyTint.clone() };
    },
    update: () => {},
    dispose: () => {},
  };
  const lighting = new MoonLightingController(env);
  return {
    at(k: number): SkyLook {
      lighting.apply(k);
      return look as SkyLook;
    },
    lighting,
  };
}

const warmth = (c: Color) => c.r - c.b;

describe('MoonLightingController', () => {
  it('starts on a warm low sun and ends on a cool high moon', () => {
    const r = rig();
    const sunset = r.at(0);
    const moonlight = r.at(1);
    expect(warmth(sunset.lightColour), 'the sunset is warm').toBeGreaterThan(0.2);
    expect(warmth(moonlight.lightColour), 'moonlight is cool').toBeLessThan(0);
    expect(sunset.lightElevation).toBeLessThan(10);
    expect(moonlight.lightElevation).toBeGreaterThan(30);
    expect(sunset.skyBodyIsMoon).toBe(false);
    expect(moonlight.skyBodyIsMoon).toBe(true);
  });

  it('brings the stars, the moon and the mist out only after dusk', () => {
    const r = rig();
    expect(r.at(0).starOpacity).toBe(0);
    expect(r.at(0).moonOpacity).toBe(0);
    expect(r.at(0).mistOpacity).toBe(0);
    let last = -1;
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const look = r.at(k);
      expect(look.starOpacity, `stars at ${k.toFixed(2)}`).toBeGreaterThanOrEqual(last - 1e-6);
      last = look.starOpacity;
    }
    expect(r.at(1).starOpacity).toBe(1);
    expect(r.at(1).moonOpacity).toBe(1);
  });

  it('the sky only ever gets darker, and the night is never black', () => {
    const r = rig();
    let last = Infinity;
    for (let k = 0; k <= 1.0001; k += 0.02) {
      const tint = r.at(k).skyTint;
      const lum = tint.r + tint.g + tint.b;
      expect(lum, `sky at ${k.toFixed(2)}`).toBeLessThanOrEqual(last + 1e-6);
      last = lum;
    }
    expect(last, 'a moonlit sky still has a colour').toBeGreaterThan(0.1);
  });

  it('never goes all blue: the ground keeps its warmth against the sky', () => {
    const r = rig();
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const look = r.at(k);
      expect(warmth(look.hemiGround), `bounce at ${k.toFixed(2)}`).toBeGreaterThan(warmth(look.hemiSky));
    }
  });

  it('has no step in it anywhere — except the one hand-over, which is in the dark', () => {
    const r = rig();
    let previous = r.at(0);
    for (let k = 0.005; k <= 1.0001; k += 0.005) {
      const look = r.at(k);
      const moved = Math.abs(look.lightAzimuth - previous.lightAzimuth) > 20;
      if (moved) {
        // The sun goes out before the moon takes over: nothing is lit when the direction jumps.
        expect(look.lightIntensity, 'the hand-over happens in the dark').toBeLessThan(0.25);
      } else {
        // A 0.005 step of the curve: at the steepest moment (the sun going out) this is the
        // whole drop spread over twenty frames, which is still a fade rather than a cut.
        expect(Math.abs(look.lightIntensity - previous.lightIntensity), `intensity at ${k.toFixed(3)}`).toBeLessThan(0.08);
        expect(Math.abs(look.exposure - previous.exposure)).toBeLessThan(0.01);
      }
      previous = look;
    }
  });

  it('follows the moon, but never faster than the eye can take', () => {
    const r = rig();
    r.lighting.apply(0);
    // A state skipped in dev jumps the target: the sky still travels at its own pace.
    r.lighting.update(0.1, { state: 'active', progress: 1, moonlight: 1, goingHome: true, dangerous: true, untilMoonlight: 0 });
    expect(r.lighting.night).toBeLessThan(0.1);
    for (let i = 0; i < 200; i++) r.lighting.update(0.05, { state: 'active', progress: 1, moonlight: 1, goingHome: true, dangerous: true, untilMoonlight: 0 });
    expect(r.lighting.night).toBe(1);
  });
});

/**
 * Two numbers the art is given, and why they must stay two.
 *
 * `night` is how dark the sky is, moon or no moon. The village's own fire follows it, so the
 * lamps stay lit through a cloudy hour at one in the morning.
 *
 * `moonlight` is how much moonlight is actually falling. It is zero whenever the clouds have the
 * moon, and only things the moon itself casts may read it — chiefly the shafts through a
 * shelter's windows, which are large additive quads inside a small room. Feed those the night's
 * darkness instead and every room is washed white all night long, which is exactly what happened
 * when the night clock's floor was first added to the sky.
 */
import { describe, expect, it } from 'vitest';
import { Gameplay } from '../Gameplay';
import { DEFAULT_NIGHT_CONFIG } from '../night/NightClock';
import { NIGHT_BASE } from '../night/NightClock';

/** A Gameplay with no physics or world attached: only its clocks are being asked about here. */
const clocks = (night = DEFAULT_NIGHT_CONFIG) =>
  new Gameplay(null as never, null, null, 1, undefined, night);

describe('the sky key and the moonlight are different numbers', () => {
  it('a cloudy hour of the night is dark, but has no moonlight in it', () => {
    const g = clocks();
    g.night.windForward(DEFAULT_NIGHT_CONFIG.seconds * 0.5);
    expect(g.moon.state, 'the clouds have the moon').toBe('safe');

    const f = g.moonFrame();
    expect(f.nightBase, 'the sky sits on the night floor').toBeCloseTo(NIGHT_BASE, 2);
    expect(f.moonlight, 'and not one lumen of it is moonlight').toBe(0);
  });

  it('the evening has neither', () => {
    const f = clocks().moonFrame();
    expect(f.nightBase).toBe(0);
    expect(f.moonlight).toBe(0);
  });

  it('a risen moon has both', () => {
    const g = clocks();
    g.night.windForward(DEFAULT_NIGHT_CONFIG.seconds * 0.5);
    g.moon.skipTo('active');
    const f = g.moonFrame();
    expect(f.moonlight).toBeGreaterThan(0.8);
    expect(f.nightBase).toBeCloseTo(NIGHT_BASE, 2);
  });

  it('the moonlight goes away again when the clouds come back', () => {
    const g = clocks();
    g.night.windForward(DEFAULT_NIGHT_CONFIG.seconds * 0.5);
    g.moon.skipTo('active');
    expect(g.moonFrame().moonlight).toBeGreaterThan(0.8);
    g.moon.skipTo('safe');
    expect(g.moonFrame().moonlight, 'nothing for the window shafts to be made of').toBe(0);
    expect(g.moonFrame().nightBase, 'but the lamps still have a dark sky to burn against').toBeCloseTo(NIGHT_BASE, 2);
  });
});

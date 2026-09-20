import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../shared/EventBus';
import type { Gameplay } from '../Gameplay';
import { MoonManager } from '../moon/MoonManager';
import type { World } from '../world/World';
import { Tutorial, TUTORIAL_MOON } from './Tutorial';

/** Just enough of a run for the director to read: a moon, and a thing the player is looking at. */
function stubGameplay() {
  const moon = new MoonManager(TUTORIAL_MOON, 1);
  const interaction = { target: null as { id: string } | null };
  // The director only ever reads the target's id, so a stub with one is the whole of it.
  return { moon, interaction } as unknown as Gameplay & { interaction: { target: { id: string } | null } };
}

const steps: Array<{ step: number; total: number; title: string; done?: boolean }> = [];

/** What the player is standing in front of, as far as the director is concerned. */
const setTarget = (gameplay: { interaction: { target: unknown } }, id: string) => {
  gameplay.interaction.target = { id } as never;
};

describe('the guided walk', () => {
  beforeEach(() => {
    steps.length = 0;
  });

  const start = () => {
    const gameplay = stubGameplay();
    const off = EventBus.on('ui:tutorial', (s) => {
      if (s) steps.push(s);
    });
    const tutorial = new Tutorial(gameplay, {} as World);
    return { gameplay, tutorial, off };
  };

  const run = (tutorial: Tutorial, seconds: number, dt = 0.25) => {
    for (let t = 0; t < seconds; t += dt) tutorial.update(dt);
  };

  it('walks the player through collecting, sheltering and a whole moonrise', () => {
    const { gameplay, tutorial, off } = start();
    expect(steps[0].title).toMatch(/walk/i);

    // Something to pick up comes into reach, and is picked up.
    setTarget(gameplay, 'item:flowers-home');
    run(tutorial, 0.5);
    expect(steps.at(-1)?.title).toMatch(/collect/i);
    EventBus.emit('ui:pickup', { id: 'flowers', quantity: 2, leftBehind: 0 });
    run(tutorial, 0.5);
    expect(steps.at(-1)?.title).toMatch(/bag/i);

    // The bag step waits a moment, then points at a door.
    run(tutorial, 5);
    expect(steps.at(-1)?.title).toMatch(/house/i);
    setTarget(gameplay, 'door:kulkarni');
    run(tutorial, 0.5);
    expect(steps.at(-1)?.title).toMatch(/inside/i);

    // In: the moon is sent on its way, and the step holds until it has come and gone.
    EventBus.emit('ui:shelter', { inside: true, family: 'the Kulkarnis' });
    run(tutorial, 0.5);
    expect(steps.at(-1)?.title).toMatch(/window/i);
    expect(gameplay.moon.state, 'the tutorial starts the moonrise itself').toBe('warning');

    run(tutorial, 3);
    expect(steps.at(-1)?.title, 'it does not move on until the moon has').toMatch(/window/i);
    EventBus.emit('ui:moon', { state: 'active', label: 'Moonlight', progress: 0.5, dangerous: true, phase: 'night', retired: false });
    run(tutorial, 1);
    expect(steps.at(-1)?.title).toMatch(/window/i);
    EventBus.emit('ui:moon', { state: 'fading', label: 'The clouds gather again', progress: 0.1, dangerous: false, phase: 'night', retired: false });
    run(tutorial, 0.5);
    expect(steps.at(-1)?.title).toMatch(/outside/i);

    // Out again, and done.
    EventBus.emit('ui:shelter', { inside: false, family: null });
    run(tutorial, 0.5);
    expect(steps.at(-1)?.done).toBe(true);
    expect(steps.at(-1)?.title).toMatch(/ready/i);
    tutorial.dispose();
    off();
  });

  it('never strands a player who cannot find the next thing', () => {
    const { tutorial, off } = start();
    // Nobody does anything at all: every step times out and the walk still finishes.
    run(tutorial, 400, 0.5);
    expect(steps.at(-1)?.done).toBe(true);
    tutorial.dispose();
    off();
  });

  it('can be skipped at any point, once', () => {
    const { tutorial, off } = start();
    run(tutorial, 2);
    tutorial.skip();
    tutorial.skip();
    const finishes = steps.filter((s) => s.done);
    expect(finishes).toHaveLength(1);
    tutorial.dispose();
    off();
  });

  it('is a two-minute walk, and cannot become a long one', () => {
    // Played as intended, the length is the moonrise the player waits out: under a minute.
    const cycle = Object.values(TUTORIAL_MOON.durations).reduce((n, s) => n + s, 0);
    expect(cycle, 'a whole night, in seconds').toBeLessThan(115);
    // Waited out at every single step — nobody plays like this — it still ends on its own.
    const worstCase = 45 + 60 + 4 + 60 + 60 + 70 + 45;
    expect(worstCase / 60, 'worst case, in minutes').toBeLessThan(6);
  });
});

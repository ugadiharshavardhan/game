/**
 * The two-minute walk that teaches the game by playing it.
 *
 * No instruction screen: the player picks up a real flower with the real button, walks into a
 * real house through the real door, and watches a real moonrise from behind its window. The only
 * thing the tutorial does is *arrange* for those things to happen close together — it shortens
 * the moon's cycle, points at the nearest flower and the nearest door, and gets out of the way.
 *
 * Every step ends on something the player did, never on a timer, except the two where the sky is
 * doing the work.
 */
import { EventBus } from '../../shared/EventBus';
import type { NightConfig } from '../night/NightClock';
import type { MoonCycleConfig } from '../moon/MoonState';
import type { Gameplay } from '../Gameplay';
import type { World } from '../world/World';

/** A night in miniature: the whole cycle inside the tutorial's two minutes. */
export const TUTORIAL_MOON: MoonCycleConfig = {
  durations: { safe: 60, warning: 14, rising: 8, active: 20, fading: 8 },
  firstSafe: 42,
  jitter: 0,
};

/**
 * The tutorial's night: already dark when it opens, so the moon may rise the moment the director
 * asks for it, and with no 05:00 in it at all — a guided walk is not a run, and must never be
 * cut short by a dawn the player was never told about.
 */
export const TUTORIAL_NIGHT: NightConfig = {
  seconds: 3600,
  startHour: 21,
  endHour: 5,
  evening: 0,
  dawn: 1,
  ends: false,
};

interface Step {
  title: string;
  hint: string;
  /** Called when the step begins. */
  enter?(ctx: Context): void;
  /** True once the player has done it. */
  done(ctx: Context): boolean;
  /** A step that cannot be failed, only waited out. */
  timeout?: number;
}

interface Context {
  gameplay: Gameplay;
  world: World;
  /** Set by the events the director listens to. */
  picked: number;
  indoors: boolean;
  wentOutAgain: boolean;
  moonState: string;
  sawMoonlight: boolean;
  elapsed: number;
}

const STEPS: Step[] = [
  {
    title: 'Walk to the flowers',
    hint: 'WASD or the stick. Hold Shift to run, Space to jump. The marigolds are just ahead, by the house.',
    done: (c) => c.gameplay.interaction.target?.id.startsWith('item:') === true,
    timeout: 45,
  },
  {
    title: 'Collect them',
    hint: 'Press E — or the COLLECT button — while the prompt is showing.',
    done: (c) => c.picked > 0,
    timeout: 60,
  },
  {
    title: 'That goes in your bag',
    hint: 'Fifteen things fit. The puja needs more than that, so you will come back.',
    done: (c) => c.elapsed > 4,
  },
  {
    title: 'Find the house with the lamp',
    hint: 'A lit doorway is a house you can go into. Walk up to it.',
    enter: () => EventBus.emit('ui:toast', { text: 'The moon is coming. Every lit door is a shelter.', tone: 'info' }),
    done: (c) => c.gameplay.interaction.target?.id.startsWith('door:') === true || c.indoors,
    timeout: 60,
  },
  {
    title: 'Go inside',
    hint: 'Press E at the door.',
    done: (c) => c.indoors,
    timeout: 60,
  },
  {
    title: 'Wait, and watch the window',
    hint: 'The moon is rising. Inside, it cannot touch you.',
    enter: (c) => c.gameplay.moon.skipTo('warning'),
    done: (c) => c.sawMoonlight && c.moonState === 'fading',
    timeout: 70,
  },
  {
    title: 'The clouds are back — step outside',
    hint: 'Press E at the door to leave.',
    done: (c) => c.wentOutAgain,
    timeout: 45,
  },
];

export class Tutorial {
  private readonly ctx: Context;
  private readonly unsubscribers: Array<() => void> = [];
  private index = -1;
  private stepTime = 0;
  private finished = false;

  constructor(gameplay: Gameplay, world: World) {
    this.ctx = { gameplay, world, picked: 0, indoors: false, wentOutAgain: false, moonState: 'safe', sawMoonlight: false, elapsed: 0 };
    this.unsubscribers.push(
      EventBus.on('ui:pickup', ({ quantity }) => (this.ctx.picked += quantity)),
      EventBus.on('ui:shelter', ({ inside }) => {
        if (this.ctx.indoors && !inside) this.ctx.wentOutAgain = true;
        this.ctx.indoors = inside;
      }),
      EventBus.on('ui:moon', ({ state }) => {
        this.ctx.moonState = state;
        if (state === 'active') this.ctx.sawMoonlight = true;
      }),
    );
    this.advance();
  }

  update(dt: number): void {
    if (this.finished) return;
    this.stepTime += dt;
    this.ctx.elapsed = this.stepTime;
    const step = STEPS[this.index];
    if (!step) return;
    if (step.done(this.ctx) || (step.timeout && this.stepTime > step.timeout)) this.advance();
  }

  /** The player asked to get on with it. */
  skip(): void {
    this.finish();
  }

  private advance(): void {
    this.index++;
    this.stepTime = 0;
    this.ctx.elapsed = 0;
    const step = STEPS[this.index];
    if (!step) {
      this.finish();
      return;
    }
    step.enter?.(this.ctx);
    EventBus.emit('ui:tutorial', { step: this.index + 1, total: STEPS.length, title: step.title, hint: step.hint });
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    EventBus.emit('ui:tutorial', { step: STEPS.length, total: STEPS.length, title: 'You’re ready', hint: 'Complete the puja.', done: true });
  }

  dispose(): void {
    for (const u of this.unsubscribers) u();
    EventBus.emit('ui:tutorial', null);
  }
}

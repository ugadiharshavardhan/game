import type { Object3D } from 'three';
import type { PlayerConfig } from '../config/playerConfig';
import type { AudioBank } from '../core/AudioBank';
import type { SoundFx } from '../audio/SoundFx';
import type { FootSurface } from '../world/World';
import type { PlayerController } from './PlayerController';

/**
 * Footsteps timed from real foot contact — the foot bone's own height above the ground, not a
 * timer — so they land with the animation whatever speed it is playing at.
 *
 * What the step sounds like comes from what is under it: grass by the tank, dry earth in the
 * lanes, stone on the temple's platform, a swept floor indoors. How loud it is comes from the
 * gait: a run lands hard, a sneak barely at all.
 *
 * A jump has two sounds of its own — the push off and the landing — heard as the two edges of
 * `airborne`. A landing is louder the further the player fell, so hopping off a step and dropping
 * from the temple plinth are not the same thud.
 */
export class PlayerAudio {
  stepsPlayed = 0;
  jumpsHeard = 0;
  landingsHeard = 0;
  /** Asked once per step: what the player is standing on. */
  surface: (() => FootSurface) | null = null;
  private sounds: Pick<SoundFx, 'play'> | null = null;
  private wasAirborne = false;
  private airTime = 0;
  private leftDown = true;
  private rightDown = true;
  private lastIndex = -1;

  private readonly bank: AudioBank;
  private readonly config: PlayerConfig;

  private readonly leftFoot: Object3D | undefined;
  private readonly rightFoot: Object3D | undefined;

  constructor(
    bank: AudioBank,
    config: PlayerConfig,
    leftFoot: Object3D | undefined,
    rightFoot: Object3D | undefined,
  ) {
    this.bank = bank;
    this.config = config;
    this.leftFoot = leftFoot;
    this.rightFoot = rightFoot;
  }

  update(controller: PlayerController, hidden: boolean, dt = 0): void {
    this.jumpAndLand(controller, dt);
    if (!this.leftFoot || !this.rightFoot || hidden) return;
    const moving = controller.planarSpeed > this.config.idleThreshold && controller.grounded;
    this.leftDown = this.detect(this.leftFoot, this.leftDown, moving, controller);
    this.rightDown = this.detect(this.rightFoot, this.rightDown, moving, controller);
  }

  private jumpAndLand(controller: PlayerController, dt: number): void {
    const air = controller.airborne;
    if (air && !this.wasAirborne) {
      this.airTime = 0;
      this.jumpsHeard++;
      this.bank.play('fx:jump', 0, 0.3);
    } else if (air) {
      this.airTime += dt;
    } else if (this.wasAirborne) {
      this.landingsHeard++;
      // A hop is a soft touch-down; a long drop is a proper thud. Half a second of air is the top.
      const weight = 0.45 + 0.55 * Math.min(this.airTime / 0.5, 1);
      this.bank.play('fx:land', 0, 0.5 * weight, 1 - 0.12 * Math.min(this.airTime / 0.5, 1));
    }
    this.wasAirborne = air;
  }

  private detect(foot: Object3D, wasDown: boolean, moving: boolean, controller: PlayerController): boolean {
    foot.updateWorldMatrix(true, false);
    const h = foot.matrixWorld.elements[13] - controller.feet.y;
    const threshold = this.config.footContactHeight;
    if (!wasDown && h < threshold) {
      if (moving) this.step(controller);
      return true;
    }
    return wasDown && h > threshold * 1.6 ? false : wasDown;
  }

  /** Where the footsteps get their sounds: the recorded sets, and the synthesised ones. */
  useSounds(sounds: Pick<SoundFx, 'play'> | null): void {
    this.sounds = sounds;
  }

  private step(controller: PlayerController): void {
    const c = this.config;
    this.stepsPlayed++;
    const crouched = controller.crouched;
    const run = controller.planarSpeed > c.fastWalkSpeed;
    // How hard the foot lands: a sneak is a whisper, a run is the whole weight of a person.
    const loudness = crouched ? 0.3 : controller.planarSpeed <= c.slowWalkSpeed + 0.1 ? 0.55 : run ? 1.15 : 0.85;
    const pitch = 1 + (Math.random() * 2 - 1) * c.footstepPitchVariation;
    const surface = this.surface?.() ?? 'dirt';

    // If custom walking audio is loaded, play it for authentic movement footsteps
    if (this.bank.count('walkAudio') > 0) {
      this.bank.play('walkAudio', 0, c.footstepVolume * loudness, pitch);
    } else if (surface === 'stone' || surface === 'dirt') {
      // Stone and dry earth are synthesised; grass and a swept floor are the recorded sets.
      this.sounds?.play(surface === 'stone' ? 'step-stone' : 'step-dirt', c.footstepVolume * loudness, pitch);
    } else {
      const set = surface === 'wood' ? 'stepSoft' : 'step';
      const count = this.bank.count(set);
      if (count > 0) {
        let i = Math.floor(Math.random() * count);
        if (i === this.lastIndex) i = (i + 1) % count;
        this.lastIndex = i;
        this.bank.play(set, i, c.footstepVolume * loudness, pitch);
      }
    }

    const rustle = Math.min(controller.planarSpeed / c.runSpeed, 1);
    if (rustle > 0.2 && !crouched) this.bank.playRandom('cloth', c.clothVolume * rustle, 1);
  }
}

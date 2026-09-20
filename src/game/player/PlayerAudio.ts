import type { Object3D } from 'three';
import type { PlayerConfig } from '../config/playerConfig';
import type { AudioBank } from '../core/AudioBank';
import type { PlayerController } from './PlayerController';

/**
 * Footsteps timed from real foot contact (foot bone height), soft/normal sets by gait,
 * cloth rustle layered on each step. No clip carries animation events, so contact is measured.
 *
 * A jump has two sounds of its own — the push off and the landing — heard as the two edges of
 * `airborne`. A landing is louder the further the player fell, so hopping off a step and dropping
 * from the temple plinth are not the same thud.
 */
export class PlayerAudio {
  stepsPlayed = 0;
  jumpsHeard = 0;
  landingsHeard = 0;
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

  private step(controller: PlayerController): void {
    const c = this.config;
    const soft = controller.crouched || controller.planarSpeed <= c.slowWalkSpeed + 0.1;
    const run = controller.planarSpeed > c.walkSpeed * 1.1;
    const set = soft ? 'stepSoft' : 'step';
    const count = this.bank.count(set);
    this.stepsPlayed++;
    if (count === 0) return;
    let i = Math.floor(Math.random() * count);
    if (i === this.lastIndex) i = (i + 1) % count;
    this.lastIndex = i;
    const pitch = 1 + (Math.random() * 2 - 1) * c.footstepPitchVariation;
    this.bank.play(set, i, c.footstepVolume * (soft ? 0.55 : run ? 1.15 : 1), pitch);
    const rustle = Math.min(controller.planarSpeed / c.runSpeed, 1);
    if (rustle > 0.2) this.bank.playRandom('cloth', c.clothVolume * rustle, 1);
  }
}

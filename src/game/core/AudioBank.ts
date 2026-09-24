import { COURTYARD, impulseResponse } from '../audio/reverb';

/**
 * Named sets of decoded sound buffers on one AudioContext.
 * Browsers start the context suspended; `unlock()` must run inside a user gesture.
 *
 * Everything the game makes goes through one chain:
 *
 *   sound → (send) → reverb ─┐
 *   sound ───────────────────┴→ master volume → limiter → speakers
 *
 * The limiter is what keeps a busy moment — five ambience beds, a gong and a handful of pickups
 * at once — from summing past full scale and clipping, which is the harshest thing a game can do to
 * a speaker. The reverb is what lets a bell ring in a space instead of beeping in a void.
 */
export class AudioBank {
  readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  private readonly limiter = this.context.createDynamicsCompressor();
  private readonly wetBus = this.context.createGain();
  private readonly sets = new Map<string, AudioBuffer[]>();

  constructor() {
    this.master.gain.value = 0.9;
    // A gentle, fast-acting ceiling: it does nothing to a quiet mix and only catches the peaks.
    this.limiter.threshold.value = -9;
    this.limiter.knee.value = 10;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.22;
    this.master.connect(this.limiter).connect(this.context.destination);

    const room = this.context.createConvolver();
    const rate = this.context.sampleRate;
    const [left, right] = impulseResponse(rate, COURTYARD);
    const ir = this.context.createBuffer(2, left.length, rate);
    ir.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
    ir.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
    room.buffer = ir;
    this.wetBus.gain.value = 1;
    this.wetBus.connect(room).connect(this.master);
  }

  async load(set: string, urls: string[]): Promise<void> {
    const buffers = await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url);
          return await this.context.decodeAudioData(await res.arrayBuffer());
        } catch (error) {
          console.warn(`[audio] could not load ${url}`, error);
          return null;
        }
      }),
    );
    this.sets.set(set, buffers.filter((b): b is AudioBuffer => b !== null));
  }

  /** The node everything plays through: the ambience beds hang off it too. */
  get bus(): GainNode {
    return this.master;
  }

  /** Registers a buffer made in code (see SoundFx) under a set name. */
  addBuffer(set: string, buffer: AudioBuffer): void {
    const list = this.sets.get(set) ?? [];
    list.push(buffer);
    this.sets.set(set, list);
  }

  /** Replaces any existing buffers for a sound effect key with a single buffer. */
  setBuffer(set: string, buffer: AudioBuffer): void {
    this.sets.set(set, [buffer]);
  }

  /** Master volume, 0–1 (the settings panel). */
  setVolume(volume: number): void {
    this.master.gain.value = Math.min(Math.max(volume, 0), 1);
  }

  unlock(): void {
    if (this.context.state === 'suspended') void this.context.resume();
  }

  setPaused(paused: boolean): void {
    if (paused) void this.context.suspend();
    else void this.context.resume();
  }

  count(set: string): number {
    return this.sets.get(set)?.length ?? 0;
  }

  /**
   * @param wet 0..1, how much of this sound is also sent into the reverb. 0 is dry, and the
   *   default: footsteps and cloth are underfoot and close, and should not sound like they are
   *   in a hall.
   */
  play(set: string, index: number, volume: number, rate = 1, wet = 0): void {
    const buffer = this.sets.get(set)?.[index];
    if (!buffer || this.context.state !== 'running') return;
    const src = this.context.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const gain = this.context.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.master);
    if (wet > 0) {
      const send = this.context.createGain();
      send.gain.value = wet;
      gain.connect(send).connect(this.wetBus);
    }
    src.start();
  }

  playRandom(set: string, volume: number, rate = 1): void {
    const n = this.count(set);
    if (n > 0) this.play(set, Math.floor(Math.random() * n), volume, rate);
  }

  dispose(): void {
    void this.context.close();
  }
}

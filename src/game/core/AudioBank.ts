/**
 * Named sets of decoded sound buffers on one AudioContext.
 * Browsers start the context suspended; `unlock()` must run inside a user gesture.
 */
export class AudioBank {
  readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  private readonly sets = new Map<string, AudioBuffer[]>();

  constructor() {
    this.master.gain.value = 0.9;
    this.master.connect(this.context.destination);
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

  play(set: string, index: number, volume: number, rate = 1): void {
    const buffer = this.sets.get(set)?.[index];
    if (!buffer || this.context.state !== 'running') return;
    const src = this.context.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const gain = this.context.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.master);
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

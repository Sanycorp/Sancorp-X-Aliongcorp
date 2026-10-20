import type { Stereo } from '../dsp/buffer';

/**
 * Web Audio transport for auditioning a rendered preview.
 * The preview is a real render of the chain, so the audition is truthful.
 */
export class PreviewPlayer {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private buffer: AudioBuffer | null = null;
  private raf = 0;

  onTick?: (seconds: number) => void;
  onEnd?: () => void;

  private context(): AudioContext {
    if (!this.ctx) {
      const Ctx: typeof AudioContext =
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
        window.AudioContext;
      this.ctx = new Ctx();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  get playing(): boolean {
    return this.source !== null;
  }

  get duration(): number {
    return this.buffer ? this.buffer.duration : 0;
  }

  get position(): number {
    if (!this.ctx || !this.buffer) return 0;
    if (!this.source) return this.offset;
    return Math.min(
      this.buffer.duration,
      this.offset + (this.ctx.currentTime - this.startedAt),
    );
  }

  /** Drops the current buffer (used when the source changes). */
  reset(): void {
    this.stop(true);
    this.buffer = null;
    this.offset = 0;
  }

  load(audio: Stereo): void {
    const ctx = this.context();
    const buffer = ctx.createBuffer(2, audio.left.length, audio.sampleRate);
    buffer.getChannelData(0).set(audio.left);
    buffer.getChannelData(1).set(audio.right);
    this.buffer = buffer;
    this.offset = 0;
  }

  async play(from = 0): Promise<void> {
    const ctx = this.context();
    if (ctx.state === 'suspended') await ctx.resume();
    if (!this.buffer || !this.gain) return;
    this.stop(true);
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    this.offset = Math.max(0, Math.min(from, this.buffer.duration - 0.01));
    this.startedAt = ctx.currentTime;
    src.start(0, this.offset);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.offset = 0;
      cancelAnimationFrame(this.raf);
      this.onEnd?.();
    };
    this.source = src;
    this.loop();
  }

  pause(): void {
    if (!this.source) return;
    const at = this.position;
    this.stop(true);
    this.offset = at;
  }

  seek(seconds: number): void {
    const wasPlaying = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(seconds, this.duration));
    if (wasPlaying) void this.play(this.offset);
    else this.onTick?.(this.offset);
  }

  setVolume(v: number): void {
    if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, v));
  }

  private loop(): void {
    this.raf = requestAnimationFrame(() => {
      if (!this.source) return;
      this.onTick?.(this.position);
      this.loop();
    });
  }

  stop(silent = false): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
    cancelAnimationFrame(this.raf);
    if (!silent) {
      this.offset = 0;
      this.onEnd?.();
    }
  }

  dispose(): void {
    this.stop(true);
    void this.ctx?.close();
    this.ctx = null;
    this.buffer = null;
  }
}

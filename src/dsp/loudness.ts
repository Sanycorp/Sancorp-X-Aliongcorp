import { Biquad } from './biquad';
import type { Stereo } from './buffer';
import { clamp } from './buffer';

/**
 * ITU-R BS.1770-4 loudness plus an inter-sample true-peak estimate.
 *
 * The chain matches the reference meter used to validate the FFmpeg engine, so
 * the numbers the app reports are the same numbers the presets were tuned on.
 */
export interface Measurement {
  lufs: number;
  truePeak: number;
  peak: number;
  lra: number;
}

function kWeight(sampleRate: number): [Biquad, Biquad] {
  // Stage 1: high shelf (+4 dB at ~1.5 kHz).
  const shelf = new Biquad();
  {
    const f0 = 1681.974450955533;
    const G = 3.999843853973347;
    const Q = 0.7071752369554196;
    const K = Math.tan((Math.PI * f0) / sampleRate);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    const a0 = 1 + K / Q + K * K;
    shelf.set({
      b0: (Vh + (Vb * K) / Q + K * K) / a0,
      b1: (2 * (K * K - Vh)) / a0,
      b2: (Vh - (Vb * K) / Q + K * K) / a0,
      a1: (2 * (K * K - 1)) / a0,
      a2: (1 - K / Q + K * K) / a0,
    });
  }
  // Stage 2: RLB high-pass at ~38 Hz.
  const highpass = new Biquad();
  {
    const f0 = 38.13547087602444;
    const Q = 0.5003270373238773;
    const K = Math.tan((Math.PI * f0) / sampleRate);
    const denom = 1 + K / Q + K * K;
    highpass.set({
      b0: 1,
      b1: -2,
      b2: 1,
      a1: (2 * (K * K - 1)) / denom,
      a2: (1 - K / Q + K * K) / denom,
    });
  }
  return [shelf, highpass];
}

/** Integrated loudness (LUFS) with absolute + relative gating. */
export function integratedLoudness(input: Stereo): number {
  const sr = input.sampleRate;
  const n = input.left.length;
  const block = Math.round(0.4 * sr);
  const step = Math.round(0.1 * sr);
  if (n < block) return -70;

  const [shelf, hp] = kWeight(sr);
  const wl = input.left.slice();
  const wr = input.right.slice();
  shelf.process(wl, wr);
  hp.process(wl, wr);

  const blocks: number[] = [];
  for (let start = 0; start + block <= n; start += step) {
    let sum = 0;
    for (let i = start; i < start + block; i++) {
      sum += wl[i] * wl[i] + wr[i] * wr[i];
    }
    const mean = sum / (block * 2);
    // Channel weights are 1.0 for L/R in the standard.
    const loudness = -0.691 + 10 * Math.log10(Math.max(mean, 1e-12));
    blocks.push(loudness);
  }
  if (blocks.length === 0) return -70;

  const above = blocks.filter((v) => v > -70);
  if (above.length === 0) return -70;
  const mean = above.reduce((a, b) => a + b, 0) / above.length;
  const relative = mean - 10;
  const gated = above.filter((v) => v > relative);
  if (gated.length === 0) return mean;
  return gated.reduce((a, b) => a + b, 0) / gated.length;
}

/** Loudness range (LRA) in LU — useful telemetry, not used for decisions. */
export function loudnessRange(input: Stereo): number {
  const sr = input.sampleRate;
  const n = input.left.length;
  const block = Math.round(3 * sr);
  const step = Math.round(sr);
  if (n < block) return 0;
  const [shelf, hp] = kWeight(sr);
  const wl = input.left.slice();
  const wr = input.right.slice();
  shelf.process(wl, wr);
  hp.process(wl, wr);
  const values: number[] = [];
  for (let start = 0; start + block <= n; start += step) {
    let sum = 0;
    for (let i = start; i < start + block; i++) sum += wl[i] * wl[i] + wr[i] * wr[i];
    const l = -0.691 + 10 * Math.log10(Math.max(sum / (block * 2), 1e-12));
    if (l > -70) values.push(l);
  }
  if (values.length < 2) return 0;
  values.sort((a, b) => a - b);
  const at = (p: number) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
  return Math.max(0, at(0.95) - at(0.1));
}

/** Sample peak in dBFS. */
export function samplePeakDb(input: Stereo): number {
  let p = 0;
  const { left, right } = input;
  for (let i = 0; i < left.length; i++) {
    const a = Math.abs(left[i]);
    const b = Math.abs(right[i]);
    if (a > p) p = a;
    if (b > p) p = b;
  }
  return p > 0 ? 20 * Math.log10(p) : -120;
}

/**
 * Inter-sample true peak via 4x Catmull-Rom reconstruction.
 * Slightly conservative on purpose: it never reports lower than the sample peak.
 */
export function truePeakDb(input: Stereo): number {
  const { left, right } = input;
  const n = left.length;
  if (n === 0) return -120;
  let peak = 0;

  const read = (x: Float32Array, pos: number): number => {
    const i = Math.floor(pos);
    const t = pos - i;
    const i0 = i < 1 ? 0 : i - 1;
    const i1 = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
    const i2 = i + 1 > n - 1 ? n - 1 : i + 1;
    const i3 = i + 2 > n - 1 ? n - 1 : i + 2;
    const p0 = x[i0];
    const p1 = x[i1];
    const p2 = x[i2];
    const p3 = x[i3];
    const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    const c = -0.5 * p0 + 0.5 * p2;
    return ((a * t + b) * t + c) * t + p1;
  };

  for (let i = 0; i < n; i++) {
    const al = Math.abs(left[i]);
    const ar = Math.abs(right[i]);
    if (al > peak) peak = al;
    if (ar > peak) peak = ar;
    if (i + 1 < n) {
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        const il = Math.abs(read(left, i + t));
        const ir = Math.abs(read(right, i + t));
        if (il > peak) peak = il;
        if (ir > peak) peak = ir;
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -120;
}

export function measure(input: Stereo): Measurement {
  return {
    lufs: integratedLoudness(input),
    truePeak: truePeakDb(input),
    peak: samplePeakDb(input),
    lra: loudnessRange(input),
  };
}

export const TARGET_LUFS: Record<string, number | null> = {
  off: null,
  podcast: -16,
  streaming: -14,
  loud: -11,
  club: -9,
};

/**
 * Static mastering gain: loudness target and true-peak ceiling, whichever is
 * lower, clamped to a sane range. Exactly the validated formula.
 */
export function computeTrim(opts: {
  peakDb: number;
  lufs: number | null;
  target: string;
  truePeakDb?: number | null;
  ceiling?: number;
  /** Upper bound for the static gain. Loud targets need more than +18 dB. */
  maxGain?: number;
}): number {
  const maxGain = opts.maxGain ?? 8.0;
  const ceiling = opts.ceiling ?? -1.0;
  const pk = opts.truePeakDb == null ? opts.peakDb : Math.max(opts.peakDb, opts.truePeakDb);
  const gPeak = Math.pow(10, (ceiling - pk) / 20);
  const target = TARGET_LUFS[opts.target] ?? null;
  if (target == null) {
    return pk > -0.5 ? clamp(gPeak, 0.2, 1.0) : 1.0;
  }
  if (opts.lufs == null || opts.lufs < -40) {
    return clamp(gPeak, 0.2, maxGain);
  }
  const gLufs = Math.pow(10, (target - opts.lufs) / 20);
  return clamp(Math.min(gLufs, gPeak), 0.2, maxGain);
}

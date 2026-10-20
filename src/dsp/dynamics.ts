import { Biquad } from './biquad';
import type { Stereo } from './buffer';
import { dbToGain } from './buffer';

/**
 * Parallel tanh saturation. `amount` 0..1 blends the driven copy back in.
 * This is the JS port of the `asoftclip=type=tanh` warmth stage.
 */
export function saturate(input: Stereo, amount: number): Stereo {
  const mix = Math.max(0, Math.min(1, amount)) * 0.25;
  if (mix < 0.005) return input;
  const drive = 1 + mix * 6;
  const out: Stereo = {
    left: new Float32Array(input.left.length),
    right: new Float32Array(input.right.length),
    sampleRate: input.sampleRate,
  };
  for (let i = 0; i < input.left.length; i++) {
    const l = input.left[i];
    const r = input.right[i];
    const satL = Math.tanh(l * drive) / drive;
    const satR = Math.tanh(r * drive) / drive;
    out.left[i] = l + satL * mix;
    out.right[i] = r + satR * mix;
  }
  return out;
}

/** Mid/side width control, 0 = mono, 1 = wide. */
export function widen(input: Stereo, width: number): Stereo {
  const w = Math.max(0, Math.min(1, width));
  const gain = 0.2 + w * 1.6;
  const out: Stereo = {
    left: new Float32Array(input.left.length),
    right: new Float32Array(input.right.length),
    sampleRate: input.sampleRate,
  };
  for (let i = 0; i < input.left.length; i++) {
    const l = input.left[i];
    const r = input.right[i];
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5 * gain;
    out.left[i] = mid + side;
    out.right[i] = mid - side;
  }
  return out;
}

/** Folds everything below 120 Hz to mono, keeping the top end wide. */
export function monoBass(input: Stereo, crossover = 120): Stereo {
  const sr = input.sampleRate;
  const lowL = input.left.slice();
  const lowR = input.right.slice();
  const highL = input.left.slice();
  const highR = input.right.slice();

  const lp = Biquad.of('lowpass', crossover, 0.707, 0, sr);
  lp.process(lowL, lowR);
  const hp = Biquad.of('highpass', crossover, 0.707, 0, sr);
  hp.process(highL, highR);

  const out: Stereo = {
    left: new Float32Array(input.left.length),
    right: new Float32Array(input.right.length),
    sampleRate: sr,
  };
  for (let i = 0; i < input.left.length; i++) {
    const mono = (lowL[i] + lowR[i]) * 0.5;
    out.left[i] = mono + highL[i];
    out.right[i] = mono + highR[i];
  }
  return out;
}

/**
 * Split-band de-esser: compresses the >6 kHz band only, so sibilance is tamed
 * without dulling the whole mix. Attack 6 ms / release 180 ms / ratio 2:1.
 */
export function deEss(input: Stereo, strength = 1): Stereo {
  const sr = input.sampleRate;
  const lowL = input.left.slice();
  const lowR = input.right.slice();
  const hiL = input.left.slice();
  const hiR = input.right.slice();

  const lp = Biquad.of('lowpass', 5800, 0.7, 0, sr);
  lp.process(lowL, lowR);
  const hp = Biquad.of('highpass', 5800, 0.7, 0, sr);
  hp.process(hiL, hiR);

  const attack = Math.exp(-1 / (0.006 * sr));
  const release = Math.exp(-1 / (0.18 * sr));
  const threshold = dbToGain(-24);
  let env = 0;
  let gain = 1;

  for (let i = 0; i < hiL.length; i++) {
    const level = Math.max(Math.abs(hiL[i]), Math.abs(hiR[i]));
    const det = Math.max(level, env * release);
    env = det;
    let target = 1;
    if (det > threshold) {
      const over = det / threshold;
      target = Math.pow(over, 1 / 2 - 1); // 2:1 above threshold
    }
    const coeff = target < gain ? attack : release;
    gain = target + (gain - target) * coeff;
    const applied = 1 - (1 - gain) * 0.65 * strength;
    hiL[i] *= applied;
    hiR[i] *= applied;
  }

  const out: Stereo = {
    left: new Float32Array(input.left.length),
    right: new Float32Array(input.right.length),
    sampleRate: sr,
  };
  for (let i = 0; i < input.left.length; i++) {
    out.left[i] = lowL[i] + hiL[i];
    out.right[i] = lowR[i] + hiR[i];
  }
  return out;
}

/** Fade helpers. `timestamp` is in seconds inside the processed buffer. */
export function fade(input: Stereo, inSec: number, outSec: number): Stereo {
  const n = input.left.length;
  const sr = input.sampleRate;
  const inN = Math.min(n, Math.max(0, Math.round(inSec * sr)));
  const outN = Math.min(n, Math.max(0, Math.round(outSec * sr)));
  if (inN === 0 && outN === 0) return input;
  for (let i = 0; i < inN; i++) {
    const g = i / inN;
    input.left[i] *= g;
    input.right[i] *= g;
  }
  for (let i = 0; i < outN; i++) {
    const idx = n - outN + i;
    const g = 1 - i / outN;
    input.left[idx] *= g;
    input.right[idx] *= g;
  }
  return input;
}

/**
 * 8D orbit: a slow sine LFO rotates the stereo image and compensates level the
 * same way the validated `apulsator` stage did (level_out, not an extra gain).
 */
export function orbit8d(
  input: Stereo,
  rateHz: number,
  depth: number,
  width: number,
): Stereo {
  const sr = input.sampleRate;
  const n = input.left.length;
  const amt = Math.max(0.05, Math.min(1, depth));
  const hz = Math.max(0.02, Math.min(0.6, rateHz));
  const w = Math.max(0, Math.min(1, width));
  const makeup = Math.pow(10, (4.2 * amt) / 20);
  const out: Stereo = {
    left: new Float32Array(n),
    right: new Float32Array(n),
    sampleRate: sr,
  };
  const inc = (2 * Math.PI * hz) / sr;
  for (let i = 0; i < n; i++) {
    const pan = Math.sin(i * inc) * amt;
    const lg = Math.cos(((pan + 1) * Math.PI) / 4) * makeup;
    const rg = Math.sin(((pan + 1) * Math.PI) / 4) * makeup;
    const l = input.left[i];
    const r = input.right[i];
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5 * (0.6 + w * 0.8);
    out.left[i] = (mid + side) * lg;
    out.right[i] = (mid - side) * rg;
  }
  return out;
}

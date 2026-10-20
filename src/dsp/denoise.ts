import { Biquad } from './biquad';
import type { Stereo } from './buffer';
import { FFT } from './fft';

/**
 * Spectral noise reduction.
 *
 * A Wiener-style mask is estimated from the mid channel (so the stereo image
 * never smears) using a percentile noise floor per bin, then applied to both
 * channels with temporal smoothing. This is the JS equivalent of the validated
 * `afftdn` stage, with the same "amount = noise reduction strength" control.
 */
export function spectralDenoise(input: Stereo, amount: number): Stereo {
  const strength = Math.max(0, Math.min(1, amount));
  if (strength < 0.01) return input;

  const size = 1024;
  const hop = 256;
  const bins = size / 2 + 1;
  const fft = new FFT(size);
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }

  const n = input.left.length;
  const frames = Math.max(1, Math.ceil((n + size) / hop));
  const mid = new Float32Array(n);
  for (let i = 0; i < n; i++) mid[i] = (input.left[i] + input.right[i]) * 0.5;

  // 1. Magnitude spectrogram of the mid channel.
  const mags = new Float32Array(frames * bins);
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  for (let f = 0; f < frames; f++) {
    const start = f * hop - size / 2;
    for (let i = 0; i < size; i++) {
      const idx = start + i;
      re[i] = idx >= 0 && idx < n ? mid[idx] * window[i] : 0;
      im[i] = 0;
    }
    fft.forward(re, im);
    for (let b = 0; b < bins; b++) {
      mags[f * bins + b] = Math.hypot(re[b], im[b]);
    }
  }

  // 2. Noise floor: low percentile of each bin across time.
  const floor = new Float32Array(bins);
  const scratch = new Float32Array(frames);
  for (let b = 0; b < bins; b++) {
    for (let f = 0; f < frames; f++) scratch[f] = mags[f * bins + b];
    const sorted = scratch.slice().sort();
    floor[b] = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.18))];
  }

  // 3. Build the mask, smoothed over time and frequency.
  const mask = new Float32Array(frames * bins);
  const overSub = 1.6 + strength * 2.2;
  const floorMix = 0.25 + strength * 0.65;
  let prev = 1;
  for (let f = 0; f < frames; f++) {
    let smooth = prev;
    for (let b = 0; b < bins; b++) {
      const mag = mags[f * bins + b];
      const nf = floor[b] * overSub;
      const ratio = mag > 1e-9 ? Math.min(1, nf / mag) : 1;
      const wiener = Math.max(0, 1 - ratio * ratio);
      const target = 1 - floorMix * (1 - wiener);
      smooth = smooth * 0.55 + target * 0.45;
      mask[f * bins + b] = Math.max(0.02, smooth);
    }
    prev = smooth;
    // Light frequency smoothing.
    for (let b = 1; b < bins - 1; b++) {
      const i = f * bins + b;
      mask[i] = (mask[i - 1] + mask[i] * 2 + mask[i + 1]) * 0.25;
    }
  }

  // 4. Apply the same mask to both channels with overlap-add.
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  const norm = new Float32Array(n);
  const gain = new Float32Array(bins);
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < bins; b++) gain[b] = mask[f * bins + b];
    for (let ch = 0; ch < 2; ch++) {
      const src = ch === 0 ? input.left : input.right;
      const dst = ch === 0 ? outL : outR;
      const start = f * hop - size / 2;
      for (let i = 0; i < size; i++) {
        const idx = start + i;
        re[i] = idx >= 0 && idx < n ? src[idx] * window[i] : 0;
        im[i] = 0;
      }
      fft.forward(re, im);
      for (let b = 0; b < bins; b++) {
        re[b] *= gain[b];
        im[b] *= gain[b];
        if (b > 0 && b < size / 2) {
          re[size - b] = re[b];
          im[size - b] = -im[b];
        }
      }
      fft.inverse(re, im);
      for (let i = 0; i < size; i++) {
        const idx = start + i;
        if (idx >= 0 && idx < n) dst[idx] += re[i] * window[i];
      }
      if (ch === 1) {
        for (let i = 0; i < size; i++) {
          const idx = start + i;
          if (idx >= 0 && idx < n) norm[idx] += window[i] * window[i];
        }
      }
    }
  }

  const out: Stereo = {
    left: new Float32Array(n),
    right: new Float32Array(n),
    sampleRate: input.sampleRate,
  };
  for (let i = 0; i < n; i++) {
    const g = norm[i] > 1e-4 ? 1 / norm[i] : 0;
    out.left[i] = outL[i] * g;
    out.right[i] = outR[i] * g;
  }
  return out;
}

/**
 * Voice isolation: high-pass + presence lift + gentle band limiting, tuned for
 * speech. It is NOT applied to music (the UI guards it) but is useful for
 * podcast / vocal takes.
 */
export function voiceFocus(input: Stereo): Stereo {
  const sr = input.sampleRate;
  const out: Stereo = {
    left: input.left.slice(),
    right: input.right.slice(),
    sampleRate: sr,
  };
  Biquad.of('highpass', 90, 0.7, 0, sr).process(out.left, out.right);
  Biquad.of('peaking', 2600, 1.1, 2.5, sr).process(out.left, out.right);
  Biquad.of('highshelf', 7000, 0.8, -3, sr).process(out.left, out.right);
  Biquad.of('lowpass', 12000, 0.7, 0, sr).process(out.left, out.right);
  return out;
}

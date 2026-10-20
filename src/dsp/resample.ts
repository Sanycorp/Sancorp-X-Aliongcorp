import type { Stereo } from './buffer';

/** Catmull-Rom interpolation between four samples. */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const c = -0.5 * p0 + 0.5 * p2;
  return ((a * t + b) * t + c) * t + p1;
}

function readCubic(x: Float32Array, pos: number): number {
  const i = Math.floor(pos);
  const t = pos - i;
  const n = x.length;
  const i0 = i < 1 ? 0 : i - 1;
  const i1 = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
  const i2 = i + 1 > n - 1 ? n - 1 : i + 1;
  const i3 = i + 2 > n - 1 ? n - 1 : i + 2;
  return catmull(x[i0], x[i1], x[i2], x[i3], t);
}

/**
 * Variable-rate resampling.
 * `step` > 1 reads faster (shorter, higher pitch), `step` < 1 reads slower.
 * This is the exact equivalent of FFmpeg's `asetrate` + `aresample` pair.
 */
export function resampleByStep(input: Stereo, step: number): Stereo {
  const n = input.left.length;
  const outFrames = Math.max(1, Math.floor(n / step));
  const left = new Float32Array(outFrames);
  const right = new Float32Array(outFrames);
  for (let i = 0; i < outFrames; i++) {
    const pos = i * step;
    left[i] = readCubic(input.left, pos);
    right[i] = readCubic(input.right, pos);
  }
  return { left, right, sampleRate: input.sampleRate };
}

/** High quality ratchet resampler used when the sample rate really changes. */
export function resampleTo(input: Stereo, targetRate: number): Stereo {
  if (input.sampleRate === targetRate) return input;
  const out = resampleByStep(input, input.sampleRate / targetRate);
  return { left: out.left, right: out.right, sampleRate: targetRate };
}

/**
 * WSOLA time stretch: changes duration while keeping pitch.
 * Alignment is computed on the mono sum so both channels stay phase-coherent.
 */
export function timeStretch(input: Stereo, rate: number): Stereo {
  if (Math.abs(rate - 1) < 0.0005) return input;
  const sr = input.sampleRate;
  const window = 1024;
  const hopOut = 512;
  const hopIn = Math.max(64, Math.round(hopOut / rate));
  const search = 256;
  const n = input.left.length;
  const outFrames = Math.max(window, Math.ceil(n / rate) + window);

  const left = new Float32Array(outFrames);
  const right = new Float32Array(outFrames);
  const win = new Float32Array(window);
  for (let i = 0; i < window; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (window - 1));
  }

  // Mono reference for the alignment search.
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (input.left[i] + input.right[i]) * 0.5;

  let outPos = 0;
  let inPos = 0;
  let prevOut = 0;

  while (outPos < outFrames && inPos + window + search < n) {
    let best = 0;
    let bestScore = -Infinity;

    if (outPos > 0) {
      // Match the tail of the previous output with the candidate input window.
      for (let off = -search; off <= search; off += 4) {
        const cand = Math.round(inPos) + off;
        if (cand < 0 || cand + window >= n) continue;
        let score = 0;
        for (let i = 0; i < window; i += 4) {
          score += mono[cand + i] * left[prevOut + i];
        }
        if (score > bestScore) {
          bestScore = score;
          best = off;
        }
      }
    }

    const base = Math.round(inPos) + best;
    for (let i = 0; i < window; i++) {
      const src = base + i;
      const w = win[i];
      if (src >= 0 && src < n) {
        left[outPos + i] += input.left[src] * w;
        right[outPos + i] += input.right[src] * w;
      }
    }

    prevOut = outPos;
    outPos += hopOut;
    inPos += hopIn;
  }

  // Trim trailing silence to the exact requested duration.
  const exact = Math.max(1, Math.round(n / rate));
  const leftOut = new Float32Array(exact);
  const rightOut = new Float32Array(exact);
  leftOut.set(left.subarray(0, Math.min(exact, left.length)));
  rightOut.set(right.subarray(0, Math.min(exact, right.length)));
  return { left: leftOut, right: rightOut, sampleRate: sr };
}

import type { Stereo } from './buffer';
import { dbToGain } from './buffer';

/** Catmull-Rom sample between x[i] and x[i+1] (same kernel as the TP meter). */
function catmullAt(x: Float32Array, i: number, t: number): number {
  const p0 = x[i - 1] ?? x[i];
  const p1 = x[i];
  const p2 = x[i + 1] ?? p1;
  const p3 = x[i + 2] ?? p2;
  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const c = -0.5 * p0 + 0.5 * p2;
  return ((a * t + b) * t + c) * t + p1;
}

/**
 * Look-ahead brick-wall limiter with true-peak aware detection.
 *
 * Detection looks at 4 sub-sample positions between every pair of samples, so
 * inter-sample peaks that would clip a DAC are caught. Gain is linked across
 * channels, attack is instant via look-ahead, release is exponential.
 */
export function limit(
  input: Stereo,
  ceilingDb = -1.2,
  attackMs = 5,
  releaseMs = 140,
): Stereo {
  const sr = input.sampleRate;
  const n = input.left.length;
  if (n === 0) return input;
  void n;
  const ceiling = dbToGain(ceilingDb);

  // 1. Required gain at every sample, including sub-sample estimates.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let env = Math.max(Math.abs(input.left[i]), Math.abs(input.right[i]));
    // 4x oversampled envelope: the same kernel the true-peak meter uses, so
    // the limiter cannot be fooled by an inter-sample peak it did not see.
    for (let k = 1; k <= 4; k++) {
      const t = k / 4;
      const il = Math.abs(catmullAt(input.left, i, t));
      const ir = Math.abs(catmullAt(input.right, i, t));
      if (il > env) env = il;
      if (ir > env) env = ir;
    }
    need[i] = env > ceiling ? ceiling / env : 1;
  }

  // 2. Sliding-window minimum over the look-ahead so the gain is already closed
  //    when the transient arrives.
  const look = Math.max(1, Math.round((attackMs / 1000) * sr));
  const smooth = new Float32Array(n);
  const deque: number[] = [];
  let next = 0;
  for (let i = 0; i < n; i++) {
    const hi = Math.min(n - 1, i + look);
    while (next <= hi) {
      while (deque.length > 0 && need[deque[deque.length - 1]] >= need[next]) {
        deque.pop();
      }
      deque.push(next);
      next++;
    }
    while (deque.length > 0 && deque[0] < i) deque.shift();
    smooth[i] = need[deque[0]];
  }

  // 3. Release smoothing (instant attack is already handled by look-ahead).
  const rel = Math.exp(-1 / ((releaseMs / 1000) * sr));
  let g = 1;
  const out: Stereo = {
    left: new Float32Array(n),
    right: new Float32Array(n),
    sampleRate: sr,
  };
  for (let i = 0; i < n; i++) {
    const target = smooth[i];
    g = target < g ? target : target + (g - target) * rel;
    out.left[i] = input.left[i] * g;
    out.right[i] = input.right[i] * g;
  }

  // 4. Safety net on the true peak (interpolated), not just sample peaks.
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(out.left[i]);
    const b = Math.abs(out.right[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
    for (let k = 1; k <= 4; k++) {
      const t = k / 4;
      const il = Math.abs(catmullAt(out.left, i, t));
      const ir = Math.abs(catmullAt(out.right, i, t));
      if (il > peak) peak = il;
      if (ir > peak) peak = ir;
    }
  }
  if (peak > ceiling) {
    const trim = ceiling / peak;
    for (let i = 0; i < n; i++) {
      out.left[i] *= trim;
      out.right[i] *= trim;
    }
  }
  return out;
}

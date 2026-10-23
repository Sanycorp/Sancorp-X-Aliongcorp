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
 *
 * Memory is O(look-ahead), not O(length): an 8:56 track used to allocate four
 * more arrays the size of the song here, which is exactly what killed the app
 * at the write stage on a phone. The sliding minimum is now a monotonic deque
 * over a ring buffer of `look+1` entries, and the gain is applied in place.
 */
export function limit(
  input: Stereo,
  ceilingDb = -1.2,
  attackMs = 5,
  releaseMs = 140,
): Stereo {
  const sr = input.sampleRate;
  const n = input.left.length;
  const out: Stereo = {
    left: input.left.slice(),
    right: input.right.slice(),
    sampleRate: sr,
  };
  if (n === 0) return out;

  const ceiling = dbToGain(ceilingDb);
  const look = Math.max(1, Math.round((attackMs / 1000) * sr));
  const width = look + 1;

  // Ring buffer of required gains, plus a monotonic deque of indices whose
  // values are increasing — the head is always the minimum of the window.
  const ring = new Float32Array(width);
  const deque = new Int32Array(width);
  let head = 0;
  let count = 0;

  const required = (i: number): number => {
    let env = Math.max(Math.abs(input.left[i]), Math.abs(input.right[i]));
    for (let k = 1; k <= 4; k++) {
      const t = k / 4;
      const il = Math.abs(catmullAt(input.left, i, t));
      const ir = Math.abs(catmullAt(input.right, i, t));
      if (il > env) env = il;
      if (ir > env) env = ir;
    }
    return env > ceiling ? ceiling / env : 1;
  };

  const push = (index: number, value: number): void => {
    while (count > 0) {
      const lastIdx = deque[(head + count - 1) % width];
      if (ring[lastIdx % width] < value) break;
      count--;
    }
    const slot = (head + count) % width;
    deque[slot] = index;
    ring[index % width] = value;
    count++;
  };

  // Prime the window with the look-ahead.
  for (let i = 0; i <= look && i < n; i++) push(i, required(i));

  const rel = Math.exp(-1 / ((releaseMs / 1000) * sr));
  let g = 1;
  for (let i = 0; i < n; i++) {
    while (count > 0 && deque[head] < i) {
      head = (head + 1) % width;
      count--;
    }
    const target = count > 0 ? ring[deque[head] % width] : 1;
    g = target < g ? target : target + (g - target) * rel;
    out.left[i] = input.left[i] * g;
    out.right[i] = input.right[i] * g;

    const next = i + look + 1;
    if (next < n) push(next, required(next));
  }

  // Safety net on the true peak (interpolated), not just sample peaks.
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

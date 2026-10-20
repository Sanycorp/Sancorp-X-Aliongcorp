/**
 * Core PCM container used by the whole engine.
 * Everything is 32-bit float, de-interleaved, 48 kHz stereo by default.
 */
export interface Stereo {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly sampleRate: number;
}

export function makeStereo(frames: number, sampleRate: number): Stereo {
  return {
    left: new Float32Array(frames),
    right: new Float32Array(frames),
    sampleRate,
  };
}

export function cloneStereo(s: Stereo): Stereo {
  return {
    left: s.left.slice(),
    right: s.right.slice(),
    sampleRate: s.sampleRate,
  };
}

export function frames(s: Stereo): number {
  return s.left.length;
}

export function duration(s: Stereo): number {
  return s.left.length / s.sampleRate;
}

export function peak(s: Stereo): number {
  let m = 0;
  const { left, right } = s;
  for (let i = 0; i < left.length; i++) {
    const a = Math.abs(left[i]);
    const b = Math.abs(right[i]);
    if (a > m) m = a;
    if (b > m) m = b;
  }
  return m;
}

export function peakDb(s: Stereo): number {
  const p = peak(s);
  return p > 0 ? 20 * Math.log10(p) : -120;
}

export function rmsDb(s: Stereo): number {
  let sum = 0;
  const n = s.left.length;
  if (n === 0) return -120;
  for (let i = 0; i < n; i++) {
    sum += s.left[i] * s.left[i] + s.right[i] * s.right[i];
  }
  const r = Math.sqrt(sum / (n * 2));
  return r > 0 ? 20 * Math.log10(r) : -120;
}

/** Clip-safe slice by time, in seconds. */
export function sliceSeconds(s: Stereo, start: number, end: number): Stereo {
  const from = Math.max(0, Math.min(s.left.length, Math.floor(start * s.sampleRate)));
  const to = Math.max(from, Math.min(s.left.length, Math.ceil(end * s.sampleRate)));
  return {
    left: s.left.slice(from, to),
    right: s.right.slice(from, to),
    sampleRate: s.sampleRate,
  };
}

export function concat(parts: Stereo[]): Stereo {
  const total = parts.reduce((n, p) => n + p.left.length, 0);
  const sr = parts.length > 0 ? parts[0].sampleRate : 48000;
  const out = makeStereo(total, sr);
  let at = 0;
  for (const p of parts) {
    out.left.set(p.left, at);
    out.right.set(p.right, at);
    at += p.left.length;
  }
  return out;
}

export function silence(seconds: number, sampleRate: number): Stereo {
  return makeStereo(Math.max(0, Math.round(seconds * sampleRate)), sampleRate);
}

export function applyGain(s: Stereo, gain: number): Stereo {
  if (gain === 1) return s;
  const out = makeStereo(s.left.length, s.sampleRate);
  for (let i = 0; i < s.left.length; i++) {
    out.left[i] = s.left[i] * gain;
    out.right[i] = s.right[i] * gain;
  }
  return out;
}

/** Remove DC and protect against denormal / NaN input. */
export function sanitize(s: Stereo): Stereo {
  const out = makeStereo(s.left.length, s.sampleRate);
  let meanL = 0;
  let meanR = 0;
  const n = s.left.length || 1;
  for (let i = 0; i < s.left.length; i++) {
    meanL += s.left[i];
    meanR += s.right[i];
  }
  meanL /= n;
  meanR /= n;
  for (let i = 0; i < s.left.length; i++) {
    const l = s.left[i] - meanL;
    const r = s.right[i] - meanR;
    out.left[i] = Number.isFinite(l) ? l : 0;
    out.right[i] = Number.isFinite(r) ? r : 0;
  }
  return out;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return gain > 0 ? 20 * Math.log10(gain) : -120;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

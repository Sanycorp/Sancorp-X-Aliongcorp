import { Biquad } from './biquad';
import type { Stereo } from './buffer';

/**
 * Feedback Delay Network reverb (8 lines, Hadamard mixing, damping low-pass).
 *
 * Replaces the old 16-tap `aecho` trick with a real diffusion network: the
 * decay is physical (RT60 driven), the stereo field is decorrelated and the
 * tail rings out naturally, which is what the export duration accounts for.
 */
export interface SpaceSpec {
  /** Base delay length in samples at 48 kHz. */
  readonly baseDelay: number;
  /** Loss factor applied to delay lengths when the room is small. */
  readonly roomScale: number;
  /** Low-pass cutoff of the damping filter at damp = 0. */
  readonly damping: number;
  /** Pre-delay range in ms. */
  readonly pre: readonly [number, number];
}

export const SPACES: Record<string, SpaceSpec> = {
  hall: { baseDelay: 1181, roomScale: 1.0, damping: 7200, pre: [18, 90] },
  plate: { baseDelay: 733, roomScale: 0.62, damping: 11000, pre: [6, 34] },
  chamber: { baseDelay: 911, roomScale: 0.78, damping: 8600, pre: [12, 60] },
  cathedral: { baseDelay: 1663, roomScale: 1.34, damping: 5200, pre: [40, 150] },
};

const PRIMES = [1, 1.09, 1.19, 1.31, 1.43, 1.57, 1.69, 1.83];
const HADAMARD_SIGN = [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, -1, 1, -1, 1, -1, 1, -1],
  [1, 1, -1, -1, 1, 1, -1, -1],
  [1, -1, -1, 1, 1, -1, -1, 1],
  [1, 1, 1, 1, -1, -1, -1, -1],
  [1, -1, 1, -1, -1, 1, -1, 1],
  [1, 1, -1, -1, -1, -1, 1, 1],
  [1, -1, -1, 1, -1, 1, 1, -1],
];

export interface ReverbOptions {
  type: string;
  level: number;
  room: number;
  damp: number;
  decay: number;
  sampleRate: number;
}

/** Total extra seconds the tail adds (matches the validated engine formula). */
export function tailSeconds(type: string, room: number, _level = 0): number {
  const spec = SPACES[type] ?? SPACES.hall;
  const decay = decaySeconds(type, room);
  const preMs = spec.pre[0] + (spec.pre[1] - spec.pre[0]) * clamp01(room);
  // 1.6x the RT60 is where the tail is inaudible; add pre-delay and margin.
  return Math.round((decay * 1.6 + preMs / 1000 + 0.06) * 100) / 100;
}

export function decaySeconds(type: string, room: number): number {
  const r = clamp01(room);
  switch (type) {
    case 'plate':
      return 0.7 + 1.9 * r;
    case 'chamber':
      return 0.9 + 1.9 * r;
    case 'cathedral':
      return 2.4 + 3.6 * r;
    default:
      return 1.4 + 2.8 * r;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Renders the wet reverb for the given input and mixes it with the dry signal
 * using the constant-gain laws from the validated graph.
 */
export function applyReverb(input: Stereo, opts: ReverbOptions): Stereo {
  const { type, level, room, damp, decay, sampleRate } = opts;
  const spec = SPACES[type] ?? SPACES.hall;
  const n = input.left.length;
  if (n === 0) return input;

  const scale = sampleRate / 48000;
  const roomF = clamp01(room);
  const delayLen = new Float32Array(8);
  for (let i = 0; i < 8; i++) {
    const base = spec.baseDelay * PRIMES[i] * (0.55 + 0.55 * roomF) * scale;
    delayLen[i] = Math.max(64, Math.round(base));
  }

  const maxLen = Math.max(...Array.from(delayLen));
  const lines = Array.from({ length: 8 }, () => new Float32Array(maxLen));
  const write = new Int32Array(8);
  const dampState = new Float32Array(8);

  // Feedback gain from RT60: g = 10^(-3 * delay / (RT60 * fs))
  const fb = new Float32Array(8);
  for (let i = 0; i < 8; i++) {
    fb[i] = Math.min(0.995, Math.pow(10, (-3 * delayLen[i]) / (decay * sampleRate)));
  }

  const dampCoeff = (() => {
    const cutoff = spec.damping * (1 - 0.55 * clamp01(damp)) * scale;
    const f = Math.min(cutoff, sampleRate * 0.45);
    const x = Math.exp((-2 * Math.PI * f) / sampleRate);
    return 1 - x;
  })();

  const preMs = spec.pre[0] + (spec.pre[1] - spec.pre[0]) * roomF;
  const preSamples = Math.max(1, Math.round((preMs / 1000) * sampleRate));
  const preL = new Float32Array(preSamples);
  const preR = new Float32Array(preSamples);
  let preIdx = 0;

  // Render past the input so the decay can ring out; the dry signal stops at n.
  const tailN = Math.round(tailSeconds(type, room, level) * sampleRate);
  const total = n + Math.max(0, tailN);
  const wetL = new Float32Array(total);
  const wetR = new Float32Array(total);

  const spread = 0.55 + 0.45 * clamp01(level);
  const v = new Float32Array(8);

  for (let i = 0; i < total; i++) {
    const inL = i < n ? input.left[i] : 0;
    const inR = i < n ? input.right[i] : 0;
    const tapL = preL[preIdx];
    const tapR = preR[preIdx];
    preL[preIdx] = inL;
    preR[preIdx] = inR;
    preIdx = (preIdx + 1) % preSamples;

    // Read the network outputs.
    let outL = 0;
    let outR = 0;
    for (let l = 0; l < 8; l++) {
      const idx = (write[l] + maxLen - delayLen[l]) % maxLen;
      const y = lines[l][idx];
      // one-pole damping inside the loop
      dampState[l] += dampCoeff * (y - dampState[l]);
      v[l] = dampState[l];
      if (l % 2 === 0) outL += v[l];
      else outR += v[l];
    }

    // Hadamard feedback (orthogonal, energy preserving).
    const mixed = new Float32Array(8);
    for (let row = 0; row < 8; row++) {
      let acc = 0;
      for (let c = 0; c < 8; c++) acc += v[c] * HADAMARD_SIGN[row][c];
      mixed[row] = acc * 0.35355339059327373; // 1/sqrt(8)
    }

    // Inject the input (L into even lines, R into odd ones with a sign flip).
    for (let l = 0; l < 8; l++) {
      const inject = l % 2 === 0 ? tapL * 0.5 : -tapR * 0.5;
      lines[l][write[l]] = mixed[l] * fb[l] + inject;
      write[l] = (write[l] + 1) % maxLen;
    }

    wetL[i] = outL * 0.125;
    wetR[i] = outR * 0.125;
  }

  // Tame the extremes of the wet signal.
  const hp = Biquad.of('highpass', type === 'plate' ? 260 : 170, 0.7, 0, sampleRate);
  hp.process(wetL, wetR);
  const lpCut = (spec.damping * (1 - 0.55 * clamp01(damp))) as number;
  const lp = Biquad.of('lowpass', Math.max(1200, lpCut), 0.6, 0, sampleRate);
  lp.process(wetL, wetR);

  const wetGain = Math.min(1, 0.35 + level * 0.9) * spread;
  const dryGain = 0.86 - 0.16 * clamp01(level);
  const out: Stereo = {
    left: new Float32Array(total),
    right: new Float32Array(total),
    sampleRate,
  };
  for (let i = 0; i < total; i++) {
    const dryL = i < n ? input.left[i] * dryGain : 0;
    const dryR = i < n ? input.right[i] * dryGain : 0;
    out.left[i] = dryL + wetL[i] * wetGain;
    out.right[i] = dryR + wetR[i] * wetGain;
  }
  return out;
}

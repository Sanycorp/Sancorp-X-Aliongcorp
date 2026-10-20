import { describe, expect, it } from 'vitest';
import type { Stereo } from '../src/dsp/buffer';
import { concat, dbToGain, duration, makeStereo, peakDb, rmsDb, silence } from '../src/dsp/buffer';
import { Biquad } from '../src/dsp/biquad';
import { integratedLoudness, samplePeakDb, truePeakDb, computeTrim } from '../src/dsp/loudness';
import { limit } from '../src/dsp/limiter';
import { resampleByStep, timeStretch } from '../src/dsp/resample';
import { applyReverb, decaySeconds, tailSeconds } from '../src/dsp/reverb';
import { orbit8d, widen, monoBass, fade, saturate, deEss } from '../src/dsp/dynamics';
import { spectralDenoise } from '../src/dsp/denoise';

const SR = 48000;

function tone(freq: number, dbfs: number, seconds: number, sr = SR): Stereo {
  const n = Math.round(seconds * sr);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const a = dbToGain(dbfs);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / sr) * a;
    left[i] = v;
    right[i] = v;
  }
  return { left, right, sampleRate: sr };
}

function noise(seconds: number, amplitude = 0.3): Stereo {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  let seed = 0x12345678;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < n; i++) {
    left[i] = (rnd() * 2 - 1) * amplitude;
    right[i] = (rnd() * 2 - 1) * amplitude;
  }
  return { left, right, sampleRate: SR };
}

/** Layered sine "music": bass + chords + hats + a little noise. */
function musicBed(seconds = 8): Stereo {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const notes = [55, 82.4, 110, 164.8, 220, 329.6, 440, 659.3];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let l = 0;
    let r = 0;
    for (let k = 0; k < notes.length; k++) {
      const f = notes[k];
      const a = 0.16 / (1 + k * 0.35);
      const phase = 2 * Math.PI * f * t + k;
      l += Math.sin(phase) * a;
      r += Math.sin(phase + 0.08 * k) * a;
    }
    // percussive hats every 0.5 s
    const beat = t % 0.5;
    const hat = Math.exp(-beat * 40) * 0.12 * (Math.sin(2 * Math.PI * 7200 * t) > 0 ? 1 : -1);
    l += hat;
    r += hat * 0.8;
    // gentle stereo movement
    const wob = Math.sin(2 * Math.PI * 0.2 * t) * 0.1;
    left[i] = (l * (1 + wob) + (r - l) * 0.02) * 0.9;
    right[i] = (r * (1 - wob) + (l - r) * 0.02) * 0.9;
  }
  return { left, right, sampleRate: SR };
}

function assertFinite(audio: Stereo): void {
  for (let i = 0; i < audio.left.length; i += 97) {
    expect(Number.isFinite(audio.left[i])).toBe(true);
    expect(Number.isFinite(audio.right[i])).toBe(true);
  }
}

describe('buffer', () => {
  it('computes duration, peak and rms', () => {
    const t = tone(1000, -6, 2);
    expect(duration(t)).toBeCloseTo(2, 5);
    expect(peakDb(t)).toBeGreaterThan(-6.2);
    expect(peakDb(t)).toBeLessThan(-5.8);
    expect(rmsDb(t)).toBeCloseTo(-9.01, 1);
  });

  it('concatenates and pads', () => {
    const a = tone(440, -12, 1);
    const b = silence(0.5, SR);
    const out = concat([a, b]);
    expect(out.left.length).toBe(a.left.length + b.left.length);
    expect(duration(out)).toBeCloseTo(1.5, 5);
  });
});

describe('loudness (BS.1770-4)', () => {
  it('measures a 997 Hz sine at −20 dBFS as −23.0 LUFS', () => {
    // The reference calibration point: K-weighting is ~0 dB at 997 Hz.
    expect(integratedLoudness(tone(997, -20, 6))).toBeCloseTo(-23.0, 1);
  });

  it('scales linearly with level', () => {
    const quiet = integratedLoudness(tone(997, -30, 6));
    const loud = integratedLoudness(tone(997, -20, 6));
    expect(loud - quiet).toBeCloseTo(10, 1);
  });

  it('returns −Infinity for silence', () => {
    expect(integratedLoudness(silence(2, SR))).toBeLessThanOrEqual(-70);
  });

  it('true peak catches inter-sample overshoot', () => {
    // Nyquist-ish tone sampled at 1/4 rate: samples are low, true peak is high.
    const n = SR * 2;
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = Math.sin((2 * Math.PI * 12000 * i) / SR + Math.PI / 4) * 0.7;
      left[i] = v;
      right[i] = v;
    }
    const audio = { left, right, sampleRate: SR };
    expect(truePeakDb(audio)).toBeGreaterThan(samplePeakDb(audio));
  });

  it('computeTrim respects the true-peak ceiling', () => {
    const g = computeTrim({ peakDb: 0, lufs: -8, target: 'club', truePeakDb: 0 });
    expect(20 * Math.log10(g)).toBeLessThanOrEqual(-1.0 + 0.01);
  });

  it('computeTrim is a no-op for an off target that is already quiet', () => {
    expect(computeTrim({ peakDb: -12, lufs: -18, target: 'off' })).toBe(1);
  });
});

describe('limiter', () => {
  it('holds true peak at the ceiling', () => {
    const out = limit(noise(4, 0.9), -1.2, 5, 140);
    expect(truePeakDb(out)).toBeLessThanOrEqual(-1.1);
    expect(truePeakDb(out)).toBeGreaterThan(-2.4);
    assertFinite(out);
  });

  it('never clips and preserves length', () => {
    const input = tone(120, 0.4, 2);
    input.left[100] = 3;
    input.right[100] = -2.5;
    const out = limit(input, -1.2, 5, 140);
    expect(out.left.length).toBe(input.left.length);
    expect(truePeakDb(out)).toBeLessThanOrEqual(-1.1);
  });
});

describe('resampling', () => {
  it('slows down by lengthening the buffer', () => {
    const input = tone(1000, -12, 2);
    const out = resampleByStep(input, 0.8);
    expect(duration(out)).toBeCloseTo(2.5, 2);
    assertFinite(out);
  });

  it('lowers pitch when stepped slower (retro character)', () => {
    const input = tone(1000, -12, 2);
    const out = resampleByStep(input, 0.8);
    // 1000 Hz at 0.8× → 800 Hz. Count zero crossings in a stable window.
    const from = Math.round(SR * 0.5);
    const to = from + SR;
    let crossings = 0;
    for (let i = from + 1; i < to && i < out.left.length; i++) {
      if (out.left[i - 1] <= 0 && out.left[i] > 0) crossings++;
    }
    expect(crossings).toBeGreaterThan(760);
    expect(crossings).toBeLessThan(840);
  });

  it('WSOLA time-stretch keeps pitch and hits the target length', () => {
    const input = tone(1000, -12, 3);
    const out = timeStretch(input, 1.25);
    expect(duration(out)).toBeCloseTo(3 / 1.25, 1);
    const from = Math.round(SR * 0.6);
    const to = from + SR;
    let crossings = 0;
    for (let i = from + 1; i < to && i < out.left.length; i++) {
      if (out.left[i - 1] <= 0 && out.left[i] > 0) crossings++;
    }
    expect(crossings).toBeGreaterThan(960);
    expect(crossings).toBeLessThan(1040);
    assertFinite(out);
  });
});

describe('filters', () => {
  const response = (kind: 'lowpass' | 'highpass' | 'peaking', freq: number, f: number, q = 0.707): number => {
    const n = SR;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = Math.sin((2 * Math.PI * f * i) / SR);
      l[i] = v;
      r[i] = v;
    }
    Biquad.of(kind, freq, q, 6, SR).process(l, r);
    // skip the transient
    let peak = 0;
    for (let i = n / 2; i < n; i++) peak = Math.max(peak, Math.abs(l[i]));
    return 20 * Math.log10(peak);
  };

  it('low-pass cuts highs and passes lows', () => {
    const pass = response('lowpass', 2000, 200);
    const stop = response('lowpass', 2000, 8000);
    expect(pass).toBeGreaterThan(-1.5);
    expect(stop).toBeLessThan(pass - 18);
  });

  it('high-pass cuts rumble', () => {
    const pass = response('highpass', 200, 2000);
    const stop = response('highpass', 200, 40);
    expect(pass).toBeGreaterThan(-1.5);
    expect(stop).toBeLessThan(pass - 18);
  });

  it('peaking adds gain at its centre frequency', () => {
    const boosted = response('peaking', 2800, 2800, 1.3);
    const flat = response('peaking', 2800, 200, 1.3);
    expect(boosted - flat).toBeGreaterThan(4.5);
  });
});

describe('reverb', () => {
  it('maps room size to RT60 within the documented ranges', () => {
    expect(decaySeconds('hall', 0)).toBeCloseTo(1.4, 3);
    expect(decaySeconds('hall', 1)).toBeCloseTo(4.2, 3);
    expect(decaySeconds('cathedral', 1)).toBeCloseTo(6.0, 3);
    expect(decaySeconds('plate', 0.5)).toBeCloseTo(1.65, 3);
  });

  it('adds a tail and never blows up', () => {
    const input = tone(440, -18, 2);
    const out = applyReverb(input, {
      type: 'hall',
      level: 0.4,
      room: 0.6,
      damp: 0.3,
      decay: decaySeconds('hall', 0.6),
      sampleRate: SR,
    });
    expect(out.left.length).toBeGreaterThan(input.left.length);
    expect(tailSeconds('hall', 0.6, 0.4)).toBeGreaterThan(2);
    assertFinite(out);
    const tail = { left: out.left.slice(input.left.length), right: out.right.slice(input.left.length), sampleRate: SR };
    expect(peakDb(tail)).toBeLessThan(-20);
  });
});

describe('dynamics', () => {
  it('orbit 8D keeps level within ±1 dB', () => {
    const input = tone(440, -12, 4);
    const out = orbit8d(input, 0.125, 0.6, 0.6);
    const a = rmsDb(input);
    const b = rmsDb(out);
    expect(Math.abs(a - b)).toBeLessThan(1.2);
    assertFinite(out);
  });

  it('widen increases the side signal', () => {
    const n = SR;
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      left[i] = Math.sin((2 * Math.PI * 440 * i) / SR) * 0.4;
      right[i] = Math.sin((2 * Math.PI * 660 * i) / SR) * 0.4;
    }
    const input = { left, right, sampleRate: SR };
    const side = (s: Stereo): number => {
      let e = 0;
      for (let i = 0; i < s.left.length; i++) {
        const d = (s.left[i] - s.right[i]) / 2;
        e += d * d;
      }
      return Math.sqrt(e / s.left.length);
    };
    expect(side(widen(input, 0.85))).toBeGreaterThan(side(widen(input, 0.5)));
  });

  it('mono bass removes low-frequency side content', () => {
    const input = tone(60, -9, 2);
    const out = monoBass(input, 120);
    let side = 0;
    for (let i = 0; i < out.left.length; i += 7) side += Math.abs(out.left[i] - out.right[i]);
    expect(side).toBeLessThan(0.001);
  });

  it('fade is silent at both ends', () => {
    const out = fade(tone(440, -6, 3), 0.5, 0.5);
    expect(Math.abs(out.left[0])).toBeLessThan(1e-4);
    expect(Math.abs(out.left[out.left.length - 1])).toBeLessThan(1e-3);
  });

  it('saturate is soft-knee and bounded', () => {
    const out = saturate(tone(220, -3, 1), 0.8);
    expect(truePeakDb(out)).toBeLessThan(0.2);
    assertFinite(out);
  });

  it('de-esser leaves low content alone', () => {
    const input = tone(400, -12, 2);
    const out = deEss(input);
    expect(Math.abs(rmsDb(out) - rmsDb(input))).toBeLessThan(0.6);
  });
});

describe('denoise', () => {
  it('attenuates broadband noise while keeping the tone', () => {
    const clean = tone(440, -18, 2);
    const noisy = noise(2, 0.05);
    for (let i = 0; i < clean.left.length; i++) {
      noisy.left[i] += clean.left[i];
      noisy.right[i] += clean.right[i];
    }
    const out = spectralDenoise(noisy, 0.85);
    expect(rmsDb(out)).toBeLessThan(rmsDb(noisy) - 3);
    assertFinite(out);
  });

  it('bypasses at zero amount', () => {
    const input = noise(0.5, 0.2);
    const out = spectralDenoise(input, 0);
    expect(out.left[100]).toBe(input.left[100]);
  });
});

describe('tail length', () => {
  it('pads to the expected tail', () => {
    const pad = silence(2.5, SR);
    const out = concat([tone(440, -12, 3), pad]);
    expect(duration(out)).toBeCloseTo(5.5, 4);
    expect(makeStereo(10, SR).left.length).toBe(10);
  });
});

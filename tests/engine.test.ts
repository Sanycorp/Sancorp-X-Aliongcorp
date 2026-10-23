import { describe, expect, it } from 'vitest';
import type { Stereo } from '../src/dsp/buffer';
import { dbToGain, duration, peakDb, rmsDb } from '../src/dsp/buffer';
import { integratedLoudness, truePeakDb } from '../src/dsp/loudness';
import {
  expectedSeconds,
  render,
  renderWithTail,
  shortSignature,
} from '../src/dsp/engine';
import { NEUTRAL, processedDuration, TARGET_META } from '../src/model/settings';
import type { EditSettings, SourceInfo } from '../src/model/settings';
import { PRESETS } from '../src/model/presets';
import { fingerprint } from '../src/state/forge';
import { PLANS } from '../src/model/tiers';

const SR = 48000;

function musicBed(seconds = 10): Stereo {
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
      const a = 0.15 / (1 + k * 0.35);
      const phase = 2 * Math.PI * f * t + k;
      l += Math.sin(phase) * a;
      r += Math.sin(phase + 0.08 * k) * a;
    }
    const beat = t % 0.5;
    const hat = Math.exp(-beat * 40) * 0.1 * Math.sign(Math.sin(2 * Math.PI * 7200 * t));
    l += hat;
    r += hat * 0.85;
    left[i] = l * 0.9;
    right[i] = r * 0.9;
  }
  return { left, right, sampleRate: SR };
}

function source(seconds: number): SourceInfo {
  return { name: 'bed.wav', duration: seconds, sampleRate: SR, channels: 2, size: 1 << 20 };
}

function assertFinite(audio: Stereo): void {
  for (let i = 0; i < audio.left.length; i += 53) {
    expect(Number.isFinite(audio.left[i])).toBe(true);
    expect(Number.isFinite(audio.right[i])).toBe(true);
  }
}

describe('engine render', () => {
  const bed = musicBed(10);
  const info = source(10);

  it('hits the loudness target and the true-peak ceiling', () => {
    const out = render(bed, { ...NEUTRAL }, info);
    expect(out.lufs).toBeCloseTo(-14, 0);
    expect(Math.abs((out.lufs ?? 0) - -14)).toBeLessThan(0.5);
    expect(out.truePeak).toBeLessThanOrEqual(-1.0);
    assertFinite(out.audio);
  });

  it('applies only static gain (no loudnorm pumping)', () => {
    // 8 s loud then 8 s quiet, 12 dB apart: the gap must survive the render.
    const n = SR * 16;
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    const quiet = dbToGain(-12);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = i < n / 2 ? 1 : quiet;
      left[i] = Math.sin(2 * Math.PI * 220 * t) * 0.4 * env;
      right[i] = Math.sin(2 * Math.PI * 330 * t) * 0.4 * env;
    }
    const input: Stereo = { left, right, sampleRate: SR };
    const out = render(input, { ...NEUTRAL, target: 'streaming' }, source(16));
    const head = { left: out.audio.left.slice(0, SR * 3), right: out.audio.right.slice(0, SR * 3), sampleRate: SR };
    const tail = {
      left: out.audio.left.slice(n - SR * 4, n - SR),
      right: out.audio.right.slice(n - SR * 4, n - SR),
      sampleRate: SR,
    };
    const gap = rmsDb(head) - rmsDb(tail);
    expect(gap).toBeGreaterThan(11);
    expect(gap).toBeLessThan(13.5);
  });

  it('respects trim in source seconds', () => {
    const edit: EditSettings = { ...NEUTRAL, trimStart: 2, trimEnd: 6 };
    const out = render(bed, edit, info);
    // 4 s at 1.0×, plus no tail (reverb off).
    expect(duration(out.audio)).toBeCloseTo(4, 1);
    expect(processedDuration(edit, 10)).toBeCloseTo(4, 5);
  });

  it('slows down by the requested factor', () => {
    const out = render(bed, { ...NEUTRAL, speed: 0.8 }, info);
    expect(duration(out.audio)).toBeCloseTo(12.5, 0);
    expect(out.lufs).toBeCloseTo(-14, 0);
  });

  it('keeps pitch with the modern stretcher', () => {
    const out = render(bed, { ...NEUTRAL, speed: 1.25, speedMode: 'modern' }, info);
    expect(duration(out.audio)).toBeCloseTo(8, 0);
    assertFinite(out.audio);
  });

  it('adds a real reverb tail instead of silence', () => {
    const out = renderWithTail(
      bed,
      { ...NEUTRAL, reverbEnabled: true, reverbType: 'hall', reverbRoom: 0.5, reverbLevel: 0.5 },
      info,
    );
    expect(duration(out.audio)).toBeGreaterThan(10.3);
    const tailStart = Math.round(10.05 * SR);
    const tail = out.audio.left.slice(tailStart, out.audio.left.length);
    let energy = 0;
    for (let i = 0; i < tail.length; i++) energy += tail[i] * tail[i];
    expect(energy).toBeGreaterThan(1e-6);
    expect(truePeakDb(out.audio)).toBeLessThanOrEqual(-1.0);
  });

  it('measure mode skips the limiter', () => {
    const out = render(bed, { ...NEUTRAL, target: 'off' }, info, { measure: true });
    expect(out.trimDb).toBe(0);
    expect(out.lufs).not.toBeNull();
  });

  it('produces stable fingerprints', () => {
    const a = fingerprint({ ...NEUTRAL }, info);
    const b = fingerprint({ ...NEUTRAL }, info);
    const c = fingerprint({ ...NEUTRAL, speed: 0.9 }, info);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9A-F]{16}$/);
  });

  it('signature changes with the chain', () => {
    expect(shortSignature({ ...NEUTRAL }, info)).not.toBe(shortSignature({ ...NEUTRAL, bass: 0.4 }, info));
  });

  it('reports an expected duration covering the tail', () => {
    const edit: EditSettings = { ...NEUTRAL, reverbEnabled: true, reverbRoom: 0.8, speed: 0.9 };
    expect(expectedSeconds(edit, info)).toBeGreaterThan(10 / 0.9);
  });
});

describe('presets', () => {
  const bed = musicBed(8);
  const info = source(8);

  it('ships 44 unique presets: 30 owner-built, 10 measured on the Kino file', () => {
    expect(PRESETS).toHaveLength(44);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(44);
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(44);
    expect(PRESETS.filter((p) => p.owner)).toHaveLength(30);
    expect(PRESETS.filter((p) => p.family === 'kino')).toHaveLength(10);
    expect(PRESETS.every((p) => (p.why ?? '').length > 60)).toBe(true);
  });

  // Loud masters are judged on loud material: pushing a sparse test tone to
  // −9 LUFS would need clipping, and the engine refuses to fake that.
  const dense = musicBed(8);
  for (let i = 0; i < dense.left.length; i++) {
    dense.left[i] = Math.tanh(dense.left[i] * 12) * 0.98;
    dense.right[i] = Math.tanh(dense.right[i] * 12) * 0.98;
  }

  for (const preset of PRESETS) {
    it(`${preset.id} lands on target without clipping`, () => {
      const edit: EditSettings = { ...NEUTRAL };
      preset.apply(edit);
      const material = edit.target === 'club' || edit.target === 'loud' ? dense : bed;
      const out = render(material, edit, info);
      const target = TARGET_META[edit.target].lufs ?? -14;
      expect(out.lufs).not.toBeNull();
      expect(Math.abs((out.lufs ?? 0) - target)).toBeLessThan(1.2);
      expect(out.truePeak).toBeLessThanOrEqual(-1.0);
      expect(peakDb(out.audio)).toBeLessThan(0);
      assertFinite(out.audio);
    });
  }

  it('never leaves a preset in an out-of-range state', () => {
    for (const preset of PRESETS) {
      const s: EditSettings = { ...NEUTRAL };
      preset.apply(s);
      expect(s.speed).toBeGreaterThanOrEqual(0.5);
      expect(s.speed).toBeLessThanOrEqual(2);
      for (const key of ['width', 'depth', 'reverbLevel', 'reverbRoom', 'reverbDamp', 'bass', 'sub', 'clarity', 'presence', 'air', 'lowpass', 'warmth'] as const) {
        expect(s[key]).toBeGreaterThanOrEqual(0);
        expect(s[key]).toBeLessThanOrEqual(1);
      }
      expect(s.bitrate).toBeGreaterThan(0);
    }
  });
});

describe('loudness targets', () => {
  it('honours every target', () => {
    const bed = musicBed(6);
    for (const target of ['podcast', 'streaming', 'loud'] as const) {
      const out = render(bed, { ...NEUTRAL, target }, source(6));
      const want = TARGET_META[target].lufs as number;
      expect(Math.abs((out.lufs ?? 0) - want)).toBeLessThan(0.7);
      expect(out.truePeak).toBeLessThanOrEqual(-1.0);
    }
  });

  it('reaches a true −9 dB club master on low-crest material', () => {
    // −9 LUFS at a −1.2 dBTP ceiling needs a crest factor under ~8 dB, which is
    // exactly what a finished club master has. A raw concert recording cannot
    // get there without clipping, and the engine refuses to fake it.
    const dense = musicBed(6);
    for (let i = 0; i < dense.left.length; i++) {
      dense.left[i] = Math.tanh(dense.left[i] * 12) * 0.98;
      dense.right[i] = Math.tanh(dense.right[i] * 12) * 0.98;
    }
    const out = render(dense, { ...NEUTRAL, target: 'club' }, source(6));
    expect(Math.abs((out.lufs ?? 0) - -9)).toBeLessThan(1.0);
    expect(out.truePeak).toBeLessThanOrEqual(-1.0);
  });

  it('off leaves a quiet source untouched', () => {
    const quiet = musicBed(4);
    for (let i = 0; i < quiet.left.length; i++) {
      quiet.left[i] *= 0.05;
      quiet.right[i] *= 0.05;
    }
    const out = render(quiet, { ...NEUTRAL, target: 'off' }, source(4));
    expect(Math.abs(out.trimDb)).toBeLessThan(0.01);
    expect(integratedLoudness(out.audio)).toBeLessThan(-30);
  });
});

describe('owner edition presets', () => {
  const owners = PRESETS.filter((p) => p.owner);

  it('are 30 distinct builds, not renames of the classics', () => {
    expect(owners).toHaveLength(30);
    for (const preset of owners) {
      const s: EditSettings = { ...NEUTRAL };
      preset.apply(s);
      const changed = (Object.keys(s) as (keyof EditSettings)[]).filter((key) => s[key] !== NEUTRAL[key]);
      expect(changed.length, `${preset.id} barely changes anything`).toBeGreaterThanOrEqual(4);
    }
  });

  it('never stack mono bass on top of a sub already fighting for space', () => {
    for (const preset of PRESETS) {
      const s: EditSettings = { ...NEUTRAL };
      preset.apply(s);
      if (s.sub > 0.25) expect(s.monoBass, `${preset.id} pushes sub without mono bass`).toBe(true);
    }
  });

  it('never enables denoise and voice mode together — the engine runs one', () => {
    for (const preset of PRESETS) {
      const s: EditSettings = { ...NEUTRAL };
      preset.apply(s);
      expect(s.denoise && s.voiceMode, preset.id).toBe(false);
    }
  });

  it('keeps 8D slow enough to listen to', () => {
    for (const preset of PRESETS) {
      const s: EditSettings = { ...NEUTRAL };
      preset.apply(s);
      if (!s.spatial8d) continue;
      expect(s.spinRate, preset.id).toBeLessThanOrEqual(0.2);
      expect(s.spinRate, preset.id).toBeGreaterThan(0);
      expect(s.depth, preset.id).toBeLessThanOrEqual(0.75);
    }
  });

  it('explains itself with numbers, not adjectives', () => {
    for (const preset of PRESETS) {
      expect(preset.detail.length, preset.id).toBeGreaterThan(40);
      expect(preset.detail.length, preset.id).toBeLessThan(220);
      expect(preset.why ?? '', `${preset.id} has no reasoning`).toMatch(/\d/);
      expect(preset.why ?? '', `${preset.id} reasoning lacks units`).toMatch(/dB|Hz|kHz|semitone|detik|%/);
    }
  });

  it('is never unlocked by the free plan', () => {
    const free = new Set(PLANS.free.presets);
    for (const preset of owners) expect(free.has(preset.id), preset.id).toBe(false);
  });
});

describe('the Kino shelf', () => {
  const kino = PRESETS.filter((p) => p.family === 'kino');

  it('is ten presets, all slowed, all with reverb, exactly one 8D', () => {
    expect(kino).toHaveLength(10);
    for (const preset of kino) {
      const s: EditSettings = { ...NEUTRAL };
      preset.apply(s);
      expect(s.speed, `${preset.id} is not slowed`).toBeLessThan(1);
      expect(s.speed, `${preset.id} is too slow to be usable`).toBeGreaterThanOrEqual(0.7);
      expect(s.reverbEnabled, `${preset.id} has no reverb`).toBe(true);
      expect(s.reverbLevel, `${preset.id} reverb is inaudible`).toBeGreaterThanOrEqual(0.15);
      // The source clips at +0.7 dBTP and is already -11.4 LUFS: nothing here
      // may push level up, and mono bass is mandatory for a 11% wide image.
      expect(s.monoBass, `${preset.id} leaves the sub out of mono`).toBe(true);
      expect(s.speedMode, `${preset.id} slows without saying how`).toBe('retro');
      expect('target' in s).toBe(true);
    }
    const eight = kino.filter((p) => {
      const s: EditSettings = { ...NEUTRAL };
      p.apply(s);
      return s.spatial8d;
    });
    expect(eight).toHaveLength(1);
    expect(eight[0].id).toBe('kino_berputar');
  });

  it('spreads across tempos and reverb types instead of ten shades of one idea', () => {
    const speeds = new Set<string>();
    const reverbs = new Set<string>();
    for (const preset of kino) {
      const s: EditSettings = { ...NEUTRAL };
      preset.apply(s);
      speeds.add(s.speed.toFixed(2));
      reverbs.add(s.reverbType);
    }
    expect(speeds.size).toBeGreaterThanOrEqual(8);
    expect(reverbs.size).toBe(4);
  });


  // The real file is not the test bed: it is loud, clipped (+0.7 dBTP) and
  // nearly mono (side energy 11%). This stand-in has the same shape, so the ten
  // presets are proven on material like the source, not on a polite sine bed.
  it('lands on −14 LUFS on loud, clipped, near-mono material', () => {
    const seconds = 16;
    const n = Math.round(seconds * 48000);
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    const notes = [49, 98, 146.8, 196, 246.9, 392];
    for (let i = 0; i < n; i++) {
      const t = i / 48000;
      const beat = t % 0.6;
      let l = 0;
      let r = 0;
      for (let k = 0; k < notes.length; k++) {
        const a = 0.22 / (1 + k * 0.3);
        const ph = 2 * Math.PI * notes[k] * t + k * 0.7;
        l += Math.sin(ph) * a;
        r += Math.sin(ph) * a * 0.92;
      }
      const kick = Math.exp(-beat * 18) * Math.sin(2 * Math.PI * 55 * t) * 0.3;
      left[i] = (l + kick) * 1.9;
      right[i] = (r + kick) * 1.9;
    }
    for (let i = 0; i < n; i++) {
      left[i] = Math.max(-1, Math.min(1, left[i] * 1.6));
      right[i] = Math.max(-1, Math.min(1, right[i] * 1.6));
    }
    const material: Stereo = { left, right, sampleRate: 48000 };
    const info: SourceInfo = { name: 'kino-like', duration: seconds, sampleRate: 48000, channels: 2, size: 1 };

    for (const preset of kino) {
      const s: EditSettings = { ...NEUTRAL };
      preset.apply(s);
      const out = render(material, s, { ...info, duration: seconds });
      expect(Math.abs((out.lufs ?? 0) - -14), preset.id).toBeLessThan(0.6);
      expect(out.truePeak, preset.id).toBeLessThanOrEqual(-1.0);
      // Slowed + reverb means longer output, never shorter.
      expect(out.outputSeconds, preset.id).toBeGreaterThan(seconds / s.speed);
    }
  });

  it('is never unlocked by the free plan and never shares a name', () => {
    const free = new Set(PLANS.free.presets);
    expect(new Set(kino.map((p) => p.name)).size).toBe(10);
    for (const preset of kino) expect(free.has(preset.id), preset.id).toBe(false);
  });
});

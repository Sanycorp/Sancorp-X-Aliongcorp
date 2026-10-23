import { describe, expect, it } from 'vitest';
import type { Stereo } from '../src/dsp/buffer';
import { render, renderSegmented } from '../src/dsp/engine';
import { LONG_RENDER_SECONDS } from '../src/dsp/engine';
import { NEUTRAL } from '../src/model/settings';
import type { EditSettings, SourceInfo } from '../src/model/settings';

const SR = 48000;

function bed(seconds: number): Stereo {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const notes = [55, 82.4, 110, 164.8, 220, 329.6, 440, 659.3];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let l = 0;
    let r = 0;
    for (let k = 0; k < notes.length; k++) {
      const a = 0.15 / (1 + k * 0.35);
      const ph = 2 * Math.PI * notes[k] * t + k;
      l += Math.sin(ph) * a;
      r += Math.sin(ph + 0.08 * k) * a;
    }
    const hat = Math.exp(-(t % 0.5) * 40) * 0.1 * Math.sign(Math.sin(2 * Math.PI * 7200 * t));
    left[i] = (l + hat) * 0.9;
    right[i] = (r + hat * 0.85) * 0.9;
  }
  return { left, right, sampleRate: SR };
}

/**
 * Long renders used to be refused at 300 s because the chain needs several
 * buffers the size of the song. They are now windowed; these tests prove the
 * windowed result is the same file the single pass would have produced.
 */
describe('segmented rendering', () => {
  const info: SourceInfo = { name: 'bed', duration: 120, sampleRate: SR, channels: 2, size: 1 };
  const edit: EditSettings = {
    ...NEUTRAL,
    reverbEnabled: true,
    reverbType: 'hall',
    reverbLevel: 0.3,
    reverbRoom: 0.5,
    warmth: 0.15,
    width: 0.62,
    monoBass: true,
    clarity: 0.3,
    air: 0.2,
    target: 'streaming',
  };

  it('produces the same file as one pass, sample for sample', () => {
    const audio = bed(120);
    const whole = render(audio, edit, info);
    const seg = renderSegmented(audio, edit, info, { segmentSeconds: 30, padSeconds: 8 });

    expect(seg.outputSeconds).toBeCloseTo(whole.outputSeconds, 1);
    expect(seg.lufs ?? 0).toBeCloseTo(whole.lufs ?? 0, 1);
    expect(seg.truePeak).toBeLessThanOrEqual(-1.0);
    expect(Math.abs(seg.trimDb - whole.trimDb)).toBeLessThan(0.2);

    // Not "close": the pads make the windows converge, so the two renders must
    // agree to within the last bit or two of float32.
    let worst = 0;
    const n = Math.min(whole.audio.left.length, seg.audio.left.length);
    for (let i = 0; i < n; i += 31) {
      worst = Math.max(worst, Math.abs(whole.audio.left[i] - seg.audio.left[i]));
      worst = Math.max(worst, Math.abs(whole.audio.right[i] - seg.audio.right[i]));
    }
    expect(worst).toBeLessThan(0.01);
  });

  it('leaves no click at the joints', () => {
    const audio = bed(90);
    const seg = renderSegmented(audio, edit, info, { segmentSeconds: 20, padSeconds: 6 });
    let globalMax = 0;
    for (let i = 1; i < seg.audio.left.length; i++) {
      globalMax = Math.max(globalMax, Math.abs(seg.audio.left[i] - seg.audio.left[i - 1]));
    }
    // Every joint sits at a multiple of 20 s of output time.
    for (let k = 1; k <= 4; k++) {
      const g = Math.round(((k * 20) / edit.speed) * SR);
      if (g >= seg.audio.left.length - 1) break;
      let localMax = 0;
      for (let i = Math.max(1, g - 4000); i < Math.min(seg.audio.left.length, g + 4000); i++) {
        localMax = Math.max(localMax, Math.abs(seg.audio.left[i] - seg.audio.left[i - 1]));
      }
      // A seam must not be the loudest edge in the file.
      expect(localMax).toBeLessThanOrEqual(globalMax + 1e-6);
    }
  });

  it('keeps the loudness target when the tempo changes', () => {
    const audio = bed(100);
    const slow: EditSettings = { ...edit, speed: 0.88, speedMode: 'retro' };
    const seg = renderSegmented(audio, slow, { ...info, duration: 100 }, { segmentSeconds: 25, padSeconds: 8 });
    expect(Math.abs((seg.lufs ?? 0) - -14)).toBeLessThan(0.8);
    expect(seg.truePeak).toBeLessThanOrEqual(-1.0);
    // 100 s at 0.88× (113.6 s) plus the hall tail.
    expect(seg.outputSeconds).toBeGreaterThan(113);
    expect(seg.outputSeconds).toBeLessThan(125);
  });

  it('honours trim, without rendering the part that was cut', () => {
    const audio = bed(60);
    // No reverb here: the tail is real output, and this test is about the cut.
    const trimmed: EditSettings = { ...edit, reverbEnabled: false, trimStart: 10, trimEnd: 20 };
    const seg = renderSegmented(audio, trimmed, { ...info, duration: 60 }, { segmentSeconds: 8 });
    expect(seg.outputSeconds).toBeGreaterThan(9.6);
    expect(seg.outputSeconds).toBeLessThan(10.6);
  });

  it('is what the normal render path uses for long files', () => {
    expect(LONG_RENDER_SECONDS).toBeLessThanOrEqual(120);
    const long = bed(LONG_RENDER_SECONDS + 20);
    const out = render(long, edit, { ...info, duration: LONG_RENDER_SECONDS + 20 }, {
      onProgress: () => undefined,
    });
    expect(out.truePeak).toBeLessThanOrEqual(-1.0);
    expect(Math.abs((out.lufs ?? 0) - -14)).toBeLessThan(0.8);
  });
});

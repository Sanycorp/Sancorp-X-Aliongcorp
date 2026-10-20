import { describe, it } from 'vitest';
import { integratedLoudness, truePeakDb, samplePeakDb } from '../src/dsp/loudness';
import { limit } from '../src/dsp/limiter';
import { render } from '../src/dsp/engine';
import { NEUTRAL } from '../src/model/settings';
import { PRESETS } from '../src/model/presets';

const SR = 48000;

function tone(freq: number, dbfs: number, seconds: number) {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const a = Math.pow(10, dbfs / 20);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / SR) * a;
    left[i] = v;
    right[i] = v;
  }
  return { left, right, sampleRate: SR };
}

describe('probe', () => {
  it('logs', () => {
    const t = tone(997, -20, 6);
    console.log('sine -20dBFS 997Hz -> LUFS', integratedLoudness(t).toFixed(3), 'TP', truePeakDb(t).toFixed(3));
    const pinkish = tone(60, -6, 8);
    console.log('sine -6dBFS 60Hz -> LUFS', integratedLoudness(pinkish).toFixed(3));
    const limited = limit(tone(997, -1, 6), -1.2, 5, 140);
    console.log('limited TP', truePeakDb(limited).toFixed(3), 'peak', samplePeakDb(limited).toFixed(3));
    const src = { name: 'x', duration: 6, sampleRate: SR, channels: 2, size: 1 };
    for (const p of PRESETS.slice(0, 14)) {
      const s = { ...NEUTRAL };
      p.apply(s);
      const out = render(tone(220, -12, 6), s, src);
      console.log(p.id.padEnd(16), 'I', out.lufs?.toFixed(2), 'TP', out.truePeak.toFixed(2), 'trim', out.trimDb.toFixed(2));
    }
    // Fourteen full renders take about five seconds on a loaded machine, which is
    // exactly the default timeout — the suite went red on a slow runner twice.
  }, 60_000);
});

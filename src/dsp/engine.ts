import { Biquad } from './biquad';
import type { Stereo } from './buffer';
import {
  applyGain,
  clamp,
  concat,
  dbToGain,
  gainToDb,
  makeStereo,
  peakDb,
  silence,
  sliceSeconds,
  duration as dur,
} from './buffer';
import {
  deEssInto,
  fade,
  monoBassInto,
  orbit8d,
  saturateInto,
  widenInto,
} from './dynamics';
import { spectralDenoise, voiceFocus } from './denoise';
import { computeTrim, integratedLoudness, samplePeakDb, truePeakDb } from './loudness';
import { limit } from './limiter';
import { applyReverb, decaySeconds, tailSeconds } from './reverb';
import { resampleByStep, timeStretch } from './resample';
import type { EditSettings, SourceInfo } from '../model/settings';
import { effectiveEnd } from '../model/settings';

/** Local copy keeps the DSP core free of UI-facing metadata. */
const TARGET_META_LUFS: Record<string, number | null> = {
  off: null,
  podcast: -16,
  streaming: -14,
  loud: -11,
  club: -9,
};

export interface RenderProgress {
  (fraction: number, stage: string): void;
}

export interface RenderResult {
  audio: Stereo;
  lufs: number | null;
  truePeak: number;
  trimDb: number;
  outputSeconds: number;
}

export interface RenderOptions {
  /** Analysis only: stop before the limiter (used to measure honestly). */
  measure?: boolean;
  /** Cache-aware early exit. */
  onProgress?: RenderProgress;
}

/** Builds the creative chain, mirroring the FFmpeg graph stage by stage. */
function creativeChain(
  input: Stereo,
  s: EditSettings,
  duration: number,
  onProgress?: RenderProgress,
  measure = false,
): { audio: Stereo; lufs: number | null; truePeak: number } {
  const sr = input.sampleRate;
  let audio = input;

  const report = (p: number, stage: string) => onProgress?.(p, stage);

  // 1. DC / NaN hygiene + rumble cut.
  report(0.04, 'CLEAN');
  audio = input;
  {
    const out: Stereo = {
      left: audio.left.slice(),
      right: audio.right.slice(),
      sampleRate: sr,
    };
    Biquad.of('highpass', 24, 0.707, 0, sr).process(out.left, out.right);
    audio = out;
  }

  // 2. Repair.
  if (s.voiceMode) {
    report(0.08, 'VOICE');
    audio = voiceFocus(audio);
  } else if (s.denoise) {
    report(0.1, 'DENOISE');
    audio = spectralDenoise(audio, s.denoiseAmount);
  }

  // 3. Trim.
  const end = effectiveEnd(s, duration);
  const start = Math.max(0, Math.min(s.trimStart, end - 0.05));
  if (start > 0.01 || end < duration - 0.01) {
    audio = sliceSeconds(audio, start, Math.max(start + 0.05, end));
  }

  // 4. Input normalisation to −0.5 dBFS.
  if (s.normalizeInput) {
    const p = peakDb(audio);
    if (p < -0.05) audio = applyGain(audio, dbToGain(-0.5 - p));
  }

  // 5. Speed.
  if (Math.abs(s.speed - 1) > 0.001) {
    report(0.22, 'TIME');
    audio =
      s.speedMode === 'modern'
        ? timeStretch(audio, s.speed)
        : resampleByStep(audio, s.speed);
  }

  // 6. Fades (before the reverb send so the tail stays natural).
  if (s.fadeIn > 0.05 || s.fadeOut > 0.05) {
    audio = fade(audio, s.fadeIn, s.fadeOut);
  }

  // 7. Tone shaping, in place: the chain owns these buffers.
  report(0.3, 'TONE');
  const toneL = audio.left;
  const toneR = audio.right;
  if (s.bass > 0.01) {
    const f = 80 + 120 * clamp(s.bassFreq, 0, 1);
    Biquad.of('lowshelf', f, 0.8, 2 + s.bass * 10.5, sr).process(toneL, toneR);
  }
  if (s.sub > 0.01) {
    Biquad.of('lowshelf', 55, 0.9, 1.5 + s.sub * 7.5, sr).process(toneL, toneR);
  }
  if (s.clarity > 0.01) {
    Biquad.of('peaking', 680, 1.1, -2.5 * s.clarity, sr).process(toneL, toneR);
  }
  if (s.presence > 0.01) {
    Biquad.of('peaking', 2800, 1.3, s.presence * 2.5, sr).process(toneL, toneR);
  }
  if (s.air > 0.01) {
    Biquad.of('highshelf', 8000, 0.7, s.air * 4, sr).process(toneL, toneR);
  }
  if (s.lowpass > 0.01) {
    const cut = clamp(20000 * Math.pow(100, -s.lowpass), 120, 20000);
    Biquad.of('lowpass', cut, 0.7, 0, sr).process(toneL, toneR);
  }
  audio = { left: toneL, right: toneR, sampleRate: sr };

  // 8. Width.
  if (Math.abs(s.width - 0.5) > 0.01) {
    widenInto(audio, s.width);
  }

  // 9. 8D orbit.
  if (s.spatial8d) {
    report(0.4, 'ORBIT');
    audio = orbit8d(audio, s.spinRate, s.depth, s.width);
  }

  // 10. Reverb.
  if (s.reverbEnabled) {
    report(0.48, 'SPACE');
    audio = applyReverb(audio, {
      type: s.reverbType,
      level: s.reverbLevel,
      room: s.reverbRoom,
      damp: s.reverbDamp,
      decay: decaySeconds(s.reverbType, s.reverbRoom),
      sampleRate: sr,
    });
  }

  // 11. Warmth.
  if (s.warmth > 0.02) {
    report(0.56, 'WARMTH');
    saturateInto(audio, s.warmth);
  }

  // 12. Mono bass.
  if (s.monoBass) {
    monoBassInto(audio, 120);
  }

  // 13. De-esser.
  if (s.deEsser) {
    report(0.62, 'DE-ESS');
    deEssInto(audio);
  }

  // 14. Manual master gain.
  if (Math.abs(s.finalGain - 1) > 0.001) {
    for (let i = 0; i < audio.left.length; i++) {
      audio.left[i] *= s.finalGain;
      audio.right[i] *= s.finalGain;
    }
  }

  const lufs = measure ? integratedLoudness(audio) : null;
  const tp = truePeakDb(audio);
  return { audio, lufs, truePeak: tp };
}

/** Full render: creative chain + measurement + static trim + limiter. */
export function render(
  input: Stereo,
  s: EditSettings,
  source: SourceInfo,
  opts: RenderOptions = {},
): RenderResult {
  const report = opts.onProgress;
  const duration = source.duration || dur(input);

  if (opts.measure) {
    const { audio } = creativeChain(input, s, duration);
    return {
      audio,
      lufs: integratedLoudness(audio),
      truePeak: truePeakDb(audio),
      trimDb: 0,
      outputSeconds: dur(audio),
    };
  }

  // Pass 1: measurement (no limiter) so the static trim is honest.
  const measured = creativeChain(input, s, duration, report, true);
  const peak = samplePeakDb(measured.audio);

  // How hard the master is allowed to push, and how fast the limiter may let
  // go. A club master is mostly limiter work: with the old +18 dB cap and a
  // 140 ms release the gain could never recover between hits, so a −9 LUFS
  // target quietly landed 2 dB low. Quiet sources now get up to +27,6 dB, and
  // the release follows the target instead of being fixed.
  const maxGain = s.target === 'club' ? 24 : s.target === 'loud' ? 16 : 8;
  const releaseMs = s.target === 'club' ? 35 : s.target === 'loud' ? 80 : 140;

  const trim = computeTrim({
    peakDb: peak,
    lufs: measured.lufs,
    target: s.target,
    truePeakDb: measured.truePeak,
    maxGain,
  });

  report?.(0.72, 'MASTER');
  const base = measured.audio;
  let gain = trim;
  let audio = limit(applyGain(base, gain), -1.2, 5, releaseMs);
  let lufs = integratedLoudness(audio);

  // Static-gain convergence: pushing into the limiter costs level, so the
  // pre-limiter gain is solved for the *post*-limiter loudness target. This is
  // still one fixed gain for the whole file — no loudnorm pumping.
  const targetLufs = s.target === 'off' ? null : TARGET_META_LUFS[s.target];
  if (targetLufs != null) {
    // Loud targets lose more level to the limiter, so the solve needs more
    // iterations than the gentle ones before it settles.
    for (let pass = 0; pass < 8; pass++) {
      if (lufs < -60 || Math.abs(lufs - targetLufs) < 0.2) break;
      const next = clamp(gain * dbToGain(targetLufs - lufs), 0.2, maxGain);
      if (Math.abs(next - gain) < 0.004) break;
      gain = next;
      report?.(0.8 + pass * 0.02, 'LIMIT');
      audio = limit(applyGain(base, gain), -1.2, 5, releaseMs);
      lufs = integratedLoudness(audio);
    }
  }

  report?.(0.88, 'LIMIT');
  const out: RenderResult = {
    audio,
    lufs,
    truePeak: truePeakDb(audio),
    trimDb: gainToDb(gain),
    outputSeconds: dur(audio),
  };
  report?.(1, 'DONE');
  return out;
}

/** Longest possible output, used to size the export progress bar. */
export function expectedSeconds(s: EditSettings, source: SourceInfo): number {
  const processed = s.speed > 0 ? (effectiveEnd(s, source.duration) - s.trimStart) / s.speed : 0;
  const tail = s.reverbEnabled ? tailSeconds(s.reverbType, s.reverbRoom, s.reverbLevel) : 0;
  return Math.max(0.1, processed + tail);
}

/** Silence-padded tail so reverb decay can ring out fully. */
export function padTail(audio: Stereo, seconds: number): Stereo {
  if (seconds <= 0.01) return audio;
  return concat([audio, silence(seconds, audio.sampleRate)]);
}

export function renderWithTail(
  input: Stereo,
  s: EditSettings,
  source: SourceInfo,
  opts: RenderOptions = {},
): RenderResult {
  const result = render(input, s, source, opts);
  const target = expectedSeconds(s, source);
  const short = target - dur(result.audio);
  if (short > 0.02) {
    const padded = concat([result.audio, silence(short, result.audio.sampleRate)]);
    return { ...result, audio: padded };
  }
  return result;
}

/** Number of samples the reverb tail adds at 48 kHz. */
export function tailSamples(s: EditSettings, sampleRate: number): number {
  if (!s.reverbEnabled) return 0;
  return Math.round(tailSeconds(s.reverbType, s.reverbRoom, s.reverbLevel) * sampleRate);
}

export function emptyStereo(sampleRate = 48000, seconds = 1): Stereo {
  return makeStereo(Math.round(seconds * sampleRate), sampleRate);
}

export function shortSignature(s: EditSettings, source: SourceInfo): string {
  const parts = [
    source.name,
    source.duration.toFixed(2),
    s.speed.toFixed(3),
    s.speedMode,
    s.reverbEnabled ? `${s.reverbType}:${s.reverbLevel.toFixed(2)}:${s.reverbRoom.toFixed(2)}:${s.reverbDamp.toFixed(2)}` : 'dry',
    s.spatial8d ? `${s.spinRate.toFixed(3)}:${s.depth.toFixed(2)}` : 'no8d',
    s.width.toFixed(2),
    `${s.bass.toFixed(2)}:${s.bassFreq.toFixed(2)}:${s.sub.toFixed(2)}`,
    `${s.clarity.toFixed(2)}:${s.presence.toFixed(2)}:${s.air.toFixed(2)}:${s.lowpass.toFixed(2)}`,
    `${s.warmth.toFixed(2)}:${s.deEsser ? 1 : 0}:${s.monoBass ? 1 : 0}`,
    `${s.denoise ? 1 : 0}:${s.denoiseAmount.toFixed(2)}:${s.voiceMode ? 1 : 0}`,
    `${s.finalGain.toFixed(2)}:${s.target}`,
    `${s.fadeIn.toFixed(2)}:${s.fadeOut.toFixed(2)}`,
    `${s.trimStart.toFixed(2)}:${s.trimEnd.toFixed(2)}`,
  ];
  return parts.join('|');
}

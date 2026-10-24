/**
 * Render an audio file with the app's own DSP, outside the browser.
 *
 * This exists so the video pipeline and the APK cannot drift apart: the same
 * `renderWithTail` that runs in the phone renders the soundtrack for the MP4.
 * If a preset sounds a certain way in your hand, it sounds the same in the
 * video, because it is the same code.
 *
 * Input : a job JSON (see VideoJob below) pointing at raw interleaved f32 PCM,
 *         which ffmpeg produces in one line: -f f32le -ac 2 -ar 48000.
 * Output: a WAV + one JSON line on stdout with the measurements.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Stereo } from '../src/dsp/buffer';
import { renderWithTail } from '../src/dsp/engine';
import { encodeWav } from '../src/io/encode';
import { NEUTRAL } from '../src/model/settings';
import type { EditSettings, SourceInfo } from '../src/model/settings';
import { presetById } from '../src/model/presets';

interface VideoJob {
  input: string;
  out: string;
  sampleRate?: number;
  duration?: number;
  name?: string;
 /** Preset id from the arsenal. Missing id is an error, not a silent default. */
  preset?: string | null;
  /** Explicit overrides on top of the preset (or of NEUTRAL). */
  edit?: Partial<EditSettings> | null;
  bitDepth?: 16 | 24;
  trimStart?: number;
  trimEnd?: number;
}

const jobPath = process.argv[2];
if (!jobPath) {
  console.error('usage: render-cli <job.json>');
  process.exit(2);
}

const job = JSON.parse(readFileSync(jobPath, 'utf8')) as VideoJob;
const sampleRate = job.sampleRate ?? 48000;

const raw = readFileSync(job.input);
const frames = Math.floor(raw.byteLength / 8);
const left = new Float32Array(frames);
const right = new Float32Array(frames);
const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
for (let i = 0; i < frames; i++) {
  left[i] = view.getFloat32(i * 8, true);
  right[i] = view.getFloat32(i * 8 + 4, true);
}

const audio: Stereo = { left, right, sampleRate };
const duration = job.duration ?? frames / sampleRate;

const edit: EditSettings = { ...NEUTRAL };
if (job.preset) {
  const preset = presetById(job.preset);
  if (!preset) {
    console.error(`unknown preset: ${job.preset}`);
    process.exit(2);
  }
  preset.apply(edit);
  edit.activePreset = preset.id;
}
if (job.edit) Object.assign(edit, job.edit);
if (job.trimStart != null) edit.trimStart = job.trimStart;
if (job.trimEnd != null) edit.trimEnd = job.trimEnd;

const source: SourceInfo = {
  name: job.name ?? 'source',
  duration,
  sampleRate,
  channels: 2,
  size: raw.byteLength,
};

const started = Date.now();
let lastStage = '';
const result = renderWithTail(audio, edit, source, {
  onProgress: (p, stage) => {
    if (stage !== lastStage || p === 1) {
      lastStage = stage;
      console.error(`progress ${Math.round(p * 100)}% ${stage}`);
    }
    void p;
  },
});

const blob = encodeWav(result.audio, job.bitDepth ?? 16, {
  title: job.name ?? 'Aegis Sound Lab',
  software: 'Sanocorp Aegis Sound Lab — video pipeline',
});
writeFileSync(job.out, Buffer.from(await blob.arrayBuffer()));

console.log(
  JSON.stringify({
    ok: true,
    out: job.out,
    seconds: Number(result.outputSeconds.toFixed(3)),
    lufs: result.lufs == null ? null : Number(result.lufs.toFixed(2)),
    truePeak: Number(result.truePeak.toFixed(2)),
    trimDb: Number(result.trimDb.toFixed(2)),
    preset: edit.activePreset,
    speed: edit.speed,
    renderMs: Date.now() - started,
  }),
);

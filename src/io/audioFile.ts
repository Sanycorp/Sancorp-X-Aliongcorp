import type { Stereo } from '../dsp/buffer';
import type { SourceInfo } from '../model/settings';

export interface DecodedFile {
  audio: Stereo;
  info: SourceInfo;
  file: File;
}

/**
 * Decoding strategy, newest API first:
 *  1. `AudioContext.decodeAudioData` — implemented with the platform codecs
 *     (MediaCodec on Android, CoreAudio on iOS, FFmpeg internally on Chrome).
 *     This is the same decoder stack the OS uses for playback, so anything the
 *     phone can play, the app can forge.
 *  2. HTMLAudio fallback for exotic containers.
 */
export async function decodeFile(
  file: File,
  targetRate = 48000,
): Promise<DecodedFile> {
  const bytes = await file.arrayBuffer();
  const Ctx: typeof AudioContext =
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    window.AudioContext;

  // Decode at the hardware rate when possible to avoid a second resample.
  const ctx = new Ctx({ sampleRate: targetRate });
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(bytes.slice(0));
  } catch (err) {
    await ctx.close();
    throw new Error(
      `Tidak bisa membaca "${file.name}". Format tidak didukung browser/WebView ini.`,
      { cause: err },
    );
  }
  await ctx.close();

  const left = new Float32Array(buffer.length);
  const right = new Float32Array(buffer.length);
  left.set(buffer.getChannelData(0));
  if (buffer.numberOfChannels > 1) {
    right.set(buffer.getChannelData(1));
  } else {
    right.set(buffer.getChannelData(0));
  }

  const audio: Stereo = { left, right, sampleRate: buffer.sampleRate };
  const info: SourceInfo = {
    name: file.name,
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    size: file.size,
  };
  return { audio, info, file };
}

/** Downsampled square-peak envelope for the timeline. */
export function peaksFrom(audio: Stereo, buckets = 480): Float32Array {
  const n = audio.left.length;
  const out = new Float32Array(buckets);
  if (n === 0) return out;
  const per = n / buckets;
  let max = 0;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * per);
    const end = Math.min(n, Math.floor((b + 1) * per));
    let m = 0;
    for (let i = start; i < end; i += 1) {
      const v = Math.max(Math.abs(audio.left[i]), Math.abs(audio.right[i]));
      if (v > m) m = v;
    }
    out[b] = m;
    if (m > max) max = m;
  }
  if (max > 0.001) {
    for (let i = 0; i < buckets; i++) out[i] = Math.pow(out[i] / max, 0.72);
  }
  return out;
}

export function formatDuration(seconds: number, tenths = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const t = Math.floor((seconds * 10) % 10);
  return tenths ? `${m}:${String(s).padStart(2, '0')}.${t}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 10 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

export function formatDb(db: number): string {
  if (!Number.isFinite(db)) return '—';
  const sign = db > 0 ? '+' : '';
  return `${sign}${db.toFixed(1)} dB`;
}

export function formatRate(hz: number): string {
  return hz % 1000 === 0 ? `${hz / 1000} kHz` : `${(hz / 1000).toFixed(1)} kHz`;
}

import type { Stereo } from '../dsp/buffer';
import { duration } from '../dsp/buffer';
import { cancelRenderJob, renderOffThread } from './renderClient';
import { startRenderService, stopRenderService, updateRenderService } from './background';
import { encode } from '../io/encode';
import { Haptics } from '../ui/haptics';
import { decodeFile } from '../io/audioFile';
import { removeExport, saveExport, shareExport } from '../io/storage';
import type { EditSettings, SourceInfo } from '../model/settings';
import { effectiveEnd } from '../model/settings';
import { presetById } from '../model/presets';
import { APP_VERSION } from '../version';
import type { ExportRecord } from './store';
import { store } from './store';
import { session } from './session';
import { mayRender } from '../model/entitlements';

let previewAudio: Stereo | null = null;

/**
 * One export at a time, and one generation number for all of them. Cancelling
 * bumps the generation, so every step checks it and stops writing.
 */
let exportGeneration = 0;

/**
 * How much audio one render may hold at once.
 *
 * Measured on the render chain: a 3-minute stereo file peaks around 280 MB of
 * DSP buffers. A phone webview cannot take a 9-minute pass (≈840 MB) — that is
 * what killed the app at the write stage. Five minutes is the ceiling; longer
 * sources render after trimming, and the message says so instead of dying.
 */
export const MAX_RENDER_SECONDS = 300;

export function cancelExport(): void {
  if (!store.status.active) return;
  exportGeneration += 1;
  cancelRenderJob();
  void stopRenderService();
  store.setStatus({ active: false, stage: 'CANCELLED', progress: 0, error: null });
  Haptics.tap();
}
let previewStats: { lufs: number | null; truePeak: number } | null = null;

/** Loudness/peak of the current preview render — drives the deck meter. */
export function getPreviewStats(): { lufs: number | null; truePeak: number } | null {
  return previewStats;
}

export function getPreview(): Stereo | null {
  return previewAudio;
}

/** Stable 64-bit fingerprint of the render inputs (FNV-1a, hex). */
export function fingerprint(edit: EditSettings, source: SourceInfo): string {
  const payload = JSON.stringify({ source: source.name, size: source.size, d: source.duration, edit });
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = ((h2 + c) * 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).toUpperCase();
}

function safeName(name: string): string {
  return (
    name
      .replace(/\.[A-Za-z0-9]{1,5}$/, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .slice(0, 48) || 'audio'
  );
}

export function outputName(edit: EditSettings, source: SourceInfo, ext: string): string {
  const preset = (presetById(edit.activePreset)?.name ?? 'CUSTOM')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  const speed = edit.speed.toFixed(2).replace('.', '');
  return `ELTZY_${safeName(source.name)}_${preset}_${speed}.${ext}`;
}

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

export async function loadSource(file: File): Promise<void> {
  store.setStatus({ error: null, stage: 'DECODE', progress: 0, active: false });
  try {
    const decoded = await decodeFile(file);
    previewStats = null;
    store.setSource(decoded.audio, decoded.info);
    store.setStatus({ stage: 'READY', progress: 0 });
    Haptics.tap();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setStatus({ error: message, stage: 'ERROR' });
    Haptics.error();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Preview (audio audition)
// ---------------------------------------------------------------------------

/** True when the preview buffer still matches the current settings. */
export function previewIsFresh(): boolean {
  return store.previewReady && previewAudio !== null;
}

export async function renderPreview(): Promise<Stereo | null> {
  if (!store.audio || !store.source) return null;
  if (previewIsFresh()) return previewAudio;
  store.previewBusy = true;
  store.emit();
  try {
    // Long sources only need a 24 s window to judge the chain. Slice first so
    // the worker never receives a whole 10-minute file for a preview.
    const { audio, source } = store;
    const sr = audio.sampleRate;
    const end = effectiveEnd(store.edit, source.duration);
    const windowSeconds = Math.min(24, Math.max(1, end - store.edit.trimStart));
    const startSample = Math.floor(store.edit.trimStart * sr);
    const endSample = Math.min(audio.left.length, startSample + Math.round(windowSeconds * sr));
    const windowAudio = {
      left: audio.left.slice(startSample, endSample),
      right: audio.right.slice(startSample, endSample),
      sampleRate: sr,
    };
    const windowSource = { ...source, duration: windowAudio.left.length / sr };
    const previewEdit: EditSettings = { ...store.edit, trimStart: 0, trimEnd: 0 };
    const result = await renderOffThread(windowAudio, previewEdit, windowSource);
    previewAudio = result.audio;
    previewStats = { lufs: result.lufs, truePeak: result.truePeak };
    store.previewReady = true;
    return previewAudio;
  } catch (err) {
    store.setStatus({ error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    store.previewBusy = false;
    store.emit();
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function forgeExport(): Promise<void> {
  const { audio, source, status } = store;
  if (!audio || !source) {
    store.setStatus({ error: 'Belum ada sumber audio. Muat lagu dulu.' });
    return;
  }
  if (status.active) return;

  const seconds = effectiveEnd(store.edit, source.duration) - store.edit.trimStart;
  if (seconds > MAX_RENDER_SECONDS) {
    store.setStatus({
      active: false,
      stage: 'TOO_LONG',
      progress: 0,
      error: `Lagu ini ${Math.round(seconds)} detik. Satu render dibatasi ${MAX_RENDER_SECONDS} detik supaya aplikasi tidak kehabisan memori di HP. Pakai POTONG di bawah waveform: ambil bagian yang kamu mau, lalu render lagi.`,
    });
    return;
  }

  // Backstop. The deck already refused a locked combination and the session
  // clamp normally ran on boot, but the encoder is the last place a stale value
  // could still ship a paid format, so the tier is applied again right here.
  const tier = session.state.status === 'loading' ? 'pro' : session.tier;
  store.clampToTier(tier);
  const edit = store.edit;
  if (!mayRender(tier, edit)) {
    store.setStatus({
      active: false,
      stage: 'BLOCKED',
      progress: 0,
      error: 'Setelan ini termasuk PRO. Pilih MP3/WAV 16, target OFF/−14 LUFS, dan preset gratis.',
    });
    return;
  }

  Haptics.heavy();
  const generation = ++exportGeneration;
  const cancelled = (): boolean => generation !== exportGeneration;
  store.setStatus({
    active: true,
    progress: 0,
    stage: 'PREPARE',
    error: null,
    report: null,
  });

  // From here on the render is protected: a foreground service on Android, so
  // locking the screen or switching apps cannot freeze it, and the notification
  // carries a STOP button that calls cancelExport().
  await startRenderService(`Merender ${safeName(source.name)}`);

  // Yield so the console paints before the DSP blocks the main thread.
  await new Promise((r) => setTimeout(r, 40));

  try {
    const started = performance.now();
    const result = await renderOffThread(audio, edit, source, (p, stage) => {
      if (cancelled()) return;
      store.setStatus({ progress: p * 0.78, stage });
      void updateRenderService(`${stage} · ${Math.round(p * 78)}%`, p * 0.78);
    });
    if (cancelled()) return;

    store.setStatus({ progress: 0.82, stage: 'ENCODE' });
    await new Promise((r) => setTimeout(r, 30));

    const hash = fingerprint(edit, source);
    const presetName = presetById(edit.activePreset)?.name ?? 'CUSTOM';
    const meta: Record<string, string> = {
      artist: 'Sanayacorp',
      album: 'Aegis Sound Lab',
      title: `ELTZY ${safeName(source.name)}`,
      comment: `Aegis Sound Lab v8|preset=${presetName}|target=${edit.target}|trim=${result.trimDb.toFixed(2)}dB|hash=${hash}`,
      software: `Sanayacorp Aegis Sound Lab ${APP_VERSION}`,
    };
    const encoded = await encode(result.audio, edit.format, edit.bitrate, meta);
    const name = outputName(edit, source, encoded.ext);
    if (cancelled()) return;

    store.setStatus({ progress: 0.94, stage: 'WRITE' });
    void updateRenderService('Menulis file · 94%', 0.94);
    // Chunked on native: the old one-shot base64 string is what OOM-killed the
    // app at exactly this percentage.
    const saved = await saveExport(encoded, name, (fraction) => {
      if (cancelled()) return;
      store.setStatus({ progress: 0.94 + fraction * 0.05, stage: 'WRITE' });
    });
    if (cancelled()) {
      // A cancelled write must not leave half a file in Documents.
      void removeExport(name);
      return;
    }

    const record: ExportRecord = {
      id: `${Date.now()}-${hash.slice(0, 6)}`,
      name,
      format: edit.format.toUpperCase(),
      preset: presetName,
      duration: duration(result.audio),
      bytes: encoded.blob.size,
      lufs: result.lufs,
      truePeak: result.truePeak,
      trimDb: result.trimDb,
      hash,
      createdAt: Date.now(),
      where: saved.where,
    };
    store.addHistory(record);

    if (store.settings.shareAfterExport) {
      await shareExport(encoded, name).catch(() => false);
    }

    store.setStatus({
      active: false,
      progress: 1,
      stage: 'DONE',
      report: {
        name: saved.name,
        duration: record.duration,
        bytes: record.bytes,
        lufs: record.lufs,
        truePeak: record.truePeak,
        trimDb: record.trimDb,
        hash: record.hash,
        format: edit.format.toUpperCase(),
        where: saved.where,
      },
    });
    Haptics.success();
    void stopRenderService();
    // Keep the encoded blob around so the manifest can offer Share again.
    lastExport = { encoded, name };
    void started;
  } catch (err) {
    if (cancelled()) return;
    const message = err instanceof Error ? err.message : String(err);
    void stopRenderService();
    store.setStatus({ active: false, stage: 'ERROR', error: message, progress: 0 });
    Haptics.error();
  }
}

let lastExport: { encoded: Awaited<ReturnType<typeof encode>>; name: string } | null = null;

export async function shareLast(): Promise<boolean> {
  if (!lastExport) return false;
  try {
    return await shareExport(lastExport.encoded, lastExport.name);
  } catch {
    return false;
  }
}

export function resetPreview(): void {
  previewAudio = null;
  previewStats = null;
  store.previewReady = false;
  store.emit();
}

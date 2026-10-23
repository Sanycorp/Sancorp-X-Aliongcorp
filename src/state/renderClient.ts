import type { EditSettings, SourceInfo } from '../model/settings';
import { renderWithTail } from '../dsp/engine';
import type { Stereo } from '../dsp/buffer';
import type { RenderMessage, RenderRequest } from '../workers/render.worker';

export interface RenderOut {
  audio: Stereo;
  lufs: number | null;
  truePeak: number;
  trimDb: number;
  outputSeconds: number;
}

export type ProgressFn = (progress: number, stage: string) => void;

let worker: Worker | null = null;
let requestId = 1;
const pending = new Map<
  number,
  { resolve: (v: RenderOut) => void; reject: (e: Error) => void; onProgress?: ProgressFn }
>();

function spawn(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('../workers/render.worker.ts', import.meta.url), {
      type: 'module',
      name: 'aegis-render',
    });
    w.onmessage = (event: MessageEvent<RenderMessage>) => {
      const msg = event.data;
      const job = pending.get(msg.id);
      if (!job) return;
      if (msg.type === 'progress') {
        job.onProgress?.(msg.progress, msg.stage);
        return;
      }
      pending.delete(msg.id);
      if (msg.type === 'error') {
        job.reject(new Error(msg.message));
        return;
      }
      job.resolve({
        audio: { left: msg.left, right: msg.right, sampleRate: msg.sampleRate },
        lufs: msg.lufs,
        truePeak: msg.truePeak,
        trimDb: msg.trimDb,
        outputSeconds: msg.outputSeconds,
      });
    };
    w.onerror = () => {
      // Restart the worker on the next call; fail the current job fast.
      worker = null;
      for (const [, job] of pending) job.reject(new Error('Render worker crashed'));
      pending.clear();
    };
    return w;
  } catch {
    return null;
  }
}

/**
 * Renders off the main thread so the UI keeps animating during export.
 * Falls back to a synchronous render where Workers are unavailable (SSR, tests).
 */
export async function renderOffThread(
  audio: Stereo,
  edit: EditSettings,
  source: SourceInfo,
  onProgress?: ProgressFn,
): Promise<RenderOut> {
  if (!worker) worker = spawn();

  if (!worker) {
    const result = renderWithTail(audio, edit, source, {
      onProgress: (p, stage) => onProgress?.(p, stage),
    });
    return {
      audio: result.audio,
      lufs: result.lufs,
      truePeak: result.truePeak,
      trimDb: result.trimDb,
      outputSeconds: result.outputSeconds,
    };
  }

  const id = requestId++;
  const copies: RenderRequest = {
    id,
    left: audio.left.slice(),
    right: audio.right.slice(),
    sampleRate: audio.sampleRate,
    edit,
    source,
  };

  const result = await new Promise<RenderOut>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    worker!.postMessage(copies, [copies.left.buffer, copies.right.buffer]);
  });
  return result;
}

/** Stops the current job and throws the worker away. The caller re-renders from
 * a clean one next time, which is what makes cancel feel instant. */
export function cancelRenderJob(reason = 'Render dibatalkan'): void {
  worker?.terminate();
  worker = null;
  for (const [, job] of pending) job.reject(new Error(reason));
  pending.clear();
}

export function disposeRenderWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}

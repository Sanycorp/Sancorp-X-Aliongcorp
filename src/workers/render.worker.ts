/// <reference lib="webworker" />
import { renderWithTail } from '../dsp/engine';
import type { EditSettings, SourceInfo } from '../model/settings';
import type { Stereo } from '../dsp/buffer';

export interface RenderRequest {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  edit: EditSettings;
  source: SourceInfo;
  id: number;
}

export type RenderMessage =
  | { type: 'progress'; id: number; progress: number; stage: string }
  | {
      type: 'done';
      id: number;
      left: Float32Array;
      right: Float32Array;
      sampleRate: number;
      lufs: number | null;
      truePeak: number;
      trimDb: number;
      outputSeconds: number;
    }
  | { type: 'error'; id: number; message: string };

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, left, right, sampleRate, edit, source } = event.data;
  try {
    const input: Stereo = { left, right, sampleRate };
    const result = renderWithTail(input, edit, source, {
      onProgress: (progress, stage) => {
        const msg: RenderMessage = { type: 'progress', id, progress, stage };
        (self as unknown as Worker).postMessage(msg);
      },
    });
    const done: RenderMessage = {
      type: 'done',
      id,
      left: result.audio.left,
      right: result.audio.right,
      sampleRate: result.audio.sampleRate,
      lufs: result.lufs,
      truePeak: result.truePeak,
      trimDb: result.trimDb,
      outputSeconds: result.outputSeconds,
    };
    (self as unknown as Worker).postMessage(done, [result.audio.left.buffer, result.audio.right.buffer]);
  } catch (err) {
    const msg: RenderMessage = {
      type: 'error',
      id,
      message: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(msg);
  }
};

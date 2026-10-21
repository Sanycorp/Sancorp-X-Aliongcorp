import { describe, expect, it } from 'vitest';
import { CHAIN_GROUPS, CHAIN_STAGES, FORMAT_LADDER, stageGroupIndex } from '../src/model/chain';

/**
 * The deck draws six pips for the six groups, but `engine.ts` reports thirteen
 * names while a render runs. The mapping between the two used to be an
 * `indexOf` on six labels, so DENOISE, ORBIT, MONO and DEESS all returned −1 and
 * the bar sat still. These tests pin the mapping instead of the pixels.
 */

describe('chain order', () => {
  it('is the engine order: hygiene first, limiter last', () => {
    const ids = CHAIN_STAGES.map((s) => s.id);
    expect(ids[0]).toBe('clean');
    expect(ids.at(-1)).toBe('limit');
    expect(ids.indexOf('master')).toBeLessThan(ids.indexOf('limit'));
    // Reverb before mono bass, or the low end would be re-spread afterwards.
    expect(ids.indexOf('space')).toBeLessThan(ids.indexOf('mono'));
  });

  it('groups every stage exactly once, in the same order', () => {
    const flat = CHAIN_GROUPS.flatMap((g) => g.stages);
    expect(flat).toEqual(CHAIN_STAGES.map((s) => s.id));
  });

  it('offers five formats, lossless behind PRO', () => {
    expect(FORMAT_LADDER.map((f) => f.id)).toEqual(['mp3', 'wav16', 'wav24', 'wav32', 'flac']);
    expect(FORMAT_LADDER.filter((f) => f.pro).map((f) => f.id)).toEqual(['wav24', 'wav32', 'flac']);
  });
});

describe('progress mapping', () => {
  it('places every report the engine emits inside the six groups', () => {
    const reports = [
      'CLEAN',
      'VOICE',
      'DENOISE',
      'TIME',
      'TONE',
      'SPACE',
      'ORBIT',
      'WARMTH',
      'MONO',
      'DEESS',
      'MASTER',
      'LIMIT',
    ];
    for (const report of reports) {
      const idx = stageGroupIndex(report);
      expect(idx, report).toBeGreaterThanOrEqual(0);
      expect(idx, report).toBeLessThan(CHAIN_GROUPS.length);
    }
  });

  it('keeps the two repair paths in the same group as CLEAN', () => {
    expect(stageGroupIndex('VOICE')).toBe(stageGroupIndex('CLEAN'));
    expect(stageGroupIndex('DENOISE')).toBe(stageGroupIndex('CLEAN'));
  });

  it('does not move backwards as the render advances', () => {
    const order = ['CLEAN', 'TIME', 'TONE', 'SPACE', 'ORBIT', 'WARMTH', 'MONO', 'DEESS', 'MASTER', 'LIMIT'];
    const idx = order.map(stageGroupIndex);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it('completes the bar for the steps after the last filter', () => {
    const done = CHAIN_GROUPS.length;
    expect(stageGroupIndex('ENCODE')).toBe(done);
    expect(stageGroupIndex('WRITE')).toBe(done);
    expect(stageGroupIndex('DONE')).toBe(done);
  });

  it('reports -1 for a name it does not know, so the caller can fall back', () => {
    expect(stageGroupIndex('LOADING')).toBe(-1);
  });

  it('is case-insensitive', () => {
    expect(stageGroupIndex('deess')).toBe(stageGroupIndex('DEESS'));
  });
});

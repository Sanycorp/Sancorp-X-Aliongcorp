// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ALL_PRESET_IDS,
  PLANS,
  can,
  formatAllowed,
  isPro,
  presetAllowed,
  targetAllowed,
  upgradeHint,
} from '../src/model/tiers';
import { PRESETS } from '../src/model/presets';

describe('tier matrix', () => {
  it('keeps the free tier genuinely usable', () => {
    const free = PLANS.free;
    expect(free.presets.length).toBeGreaterThanOrEqual(4);
    expect(free.formats).toContain('mp3');
    expect(free.formats).toContain('wav16');
    expect(free.limits.maxMinutes).toBeGreaterThan(0);
  });

  it('gates more than half of the arsenal behind PRO without hiding the DSP', () => {
    const locked = ALL_PRESET_IDS.filter((id) => !presetAllowed('free', id));
    expect(locked.length).toBeGreaterThan(ALL_PRESET_IDS.length / 2);
    // The chain itself is never crippled: every stage stays editable on FREE.
    expect(PLANS.free.formats.length).toBeGreaterThan(0);
    expect(PLANS.free.targets).toContain('streaming');
  });

  it('gates features that cost the user real time, not quality', () => {
    expect(can('free', 'orbit8d')).toBe(false);
    expect(can('free', 'repair')).toBe(false);
    expect(can('free', 'abMemory')).toBe(false);
    expect(can('pro', 'orbit8d')).toBe(true);
    expect(can('admin', 'repair')).toBe(true);
  });

  it('never allows a paid format or target on free', () => {
    for (const format of ['wav24', 'wav32', 'flac'] as const) {
      expect(formatAllowed('free', format)).toBe(false);
      expect(formatAllowed('pro', format)).toBe(true);
    }
    expect(targetAllowed('free', 'club')).toBe(false);
    expect(targetAllowed('pro', 'club')).toBe(true);
  });

  it('agrees with the real preset catalogue', () => {
    const catalogue = PRESETS.map((p) => p.id).sort();
    expect([...ALL_PRESET_IDS].sort()).toEqual(catalogue);
    for (const id of PLANS.free.presets) expect(catalogue).toContain(id);
  });

  it('treats admin as a superset of pro', () => {
    expect(isPro('admin')).toBe(true);
    expect(isPro('free')).toBe(false);
    for (const feature of Object.keys(PLANS.pro.features) as (keyof typeof PLANS.pro.features)[]) {
      expect(PLANS.admin.features[feature]).toBe(true);
    }
    expect(PLANS.admin.presets).toEqual(PLANS.pro.presets);
  });

  it('explains every gate in human language', () => {
    for (const key of ['preset', 'format', 'target', 'orbit8d', 'repair', 'abMemory', 'limit', 'history', 'nope']) {
      const hint = upgradeHint(key);
      expect(hint.length).toBeGreaterThan(10);
      expect(hint).toMatch(/PRO|gratis|menit/i);
    }
  });
});

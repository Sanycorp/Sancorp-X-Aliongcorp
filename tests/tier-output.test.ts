// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_DEFAULTS, NEUTRAL } from '../src/model/settings';
import type { EditSettings } from '../src/model/settings';
import { clampForTier, formatChoices, mayRender, targetChoices } from '../src/model/entitlements';

const ROOT = process.cwd();

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true });
});

/** The store is a singleton; every test starts from a known, PRO-shaped state. */
async function resetStore() {
  const { store } = await import('../src/state/store');
  store.settings = {
    ...APP_DEFAULTS,
    format: 'flac',
    target: 'club',
    bitrate: 320,
  };
  store.edit = { ...NEUTRAL, format: 'flac', target: 'club', spatial8d: true, denoise: true };
  store.slotA = null;
  store.slotB = null;
  localStorage.clear();
  return store;
}

describe('one output decision, two copies', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('writes format, bitrate and target to settings and edit together', async () => {
    const { store } = await import('../src/state/store');
    store.setOutput({ format: 'wav16' });
    expect(store.settings.format).toBe('wav16');
    expect(store.edit.format).toBe('wav16');

    store.setOutput({ target: 'streaming', bitrate: 192 });
    expect(store.settings.target).toBe('streaming');
    expect(store.edit.target).toBe('streaming');
    expect(store.settings.bitrate).toBe(192);
    expect(store.edit.bitrate).toBe(192);
  });

  it('a downgrade rewrites the encoder input, not just the default', async () => {
    const { store } = await import('../src/state/store');
    expect(store.edit.format).toBe('flac');

    expect(store.clampToTier('free')).toBe(true);

    // Both copies, or the gate and the encoder disagree — the original bug.
    expect(store.settings.format).toBe('mp3');
    expect(store.edit.format).toBe('mp3');
    expect(store.settings.target).toBe('streaming');
    expect(store.edit.target).toBe('streaming');
    expect(store.edit.spatial8d).toBe(false);
    expect(store.edit.denoise).toBe(false);
    expect(mayRender('free', store.edit)).toBe(true);
  });

  it('leaves a paid session untouched', async () => {
    const { store } = await import('../src/state/store');
    expect(store.clampToTier('pro')).toBe(false);
    expect(store.edit.format).toBe('flac');
    expect(store.edit.spatial8d).toBe(true);
  });

  it('a slot saved during a PRO month cannot smuggle its engines past a downgrade', async () => {
    const { store } = await import('../src/state/store');
    store.slotA = { ...NEUTRAL, format: 'flac', spatial8d: true, denoise: true };

    store.clampToTier('free');

    expect(store.slotA?.spatial8d).toBe(false);
    expect(store.slotA?.denoise).toBe(false);
    expect(store.slotA?.format).toBe('mp3');
  });

  it('recalling a slot never changes the export format', async () => {
    const { store } = await import('../src/state/store');
    store.setOutput({ format: 'wav16', target: 'off' });
    store.slotA = { ...NEUTRAL, format: 'flac', target: 'club', speed: 0.8 };

    store.recallSlot('A');

    expect(store.edit.speed).toBe(0.8);
    expect(store.edit.format).toBe('wav16');
    expect(store.edit.target).toBe('off');
  });

  it('reconciles the two copies after a reload', async () => {
    const { store } = await import('../src/state/store');
    localStorage.setItem(
      'aegis.session.v8',
      JSON.stringify({
        // A stale build wrote FLAC into the chain while SYSTEM stayed on MP3.
        edit: { ...NEUTRAL, format: 'flac', target: 'club' },
        settings: { ...APP_DEFAULTS, format: 'mp3', target: 'streaming' },
        history: [],
      }),
    );

    store.restore();

    expect(store.edit.format).toBe('mp3');
    expect(store.edit.target).toBe('streaming');
  });

  it('ignores a corrupted stored format instead of rendering undefined', async () => {
    const { store } = await import('../src/state/store');
    localStorage.setItem(
      'aegis.session.v8',
      JSON.stringify({
        edit: { ...NEUTRAL, format: 'aiff' },
        settings: { ...APP_DEFAULTS, format: 'aiff', bitrate: 999 },
        history: [],
      }),
    );

    store.restore();

    expect(store.settings.format).toBe('mp3');
    expect(store.edit.format).toBe('mp3');
    expect(store.settings.bitrate).toBe(320);
  });
});

describe('the format ladder is shared by both screens', () => {
  it('offers five formats and locks the paid ones on FREE', () => {
    const free = formatChoices('free');
    expect(free.map((c) => c.value)).toEqual(['mp3', 'wav16', 'wav24', 'wav32', 'flac']);
    expect(free.filter((c) => !c.locked).map((c) => c.value)).toEqual(['mp3', 'wav16']);

    const pro = formatChoices('pro');
    expect(pro.every((c) => !c.locked)).toBe(true);
  });

  it('locks the loud targets above -14 on FREE', () => {
    const free = targetChoices('free').filter((c) => !c.locked).map((c) => c.value);
    expect(free).toEqual(['off', 'streaming']);
    expect(targetChoices('pro').every((c) => !c.locked)).toBe(true);
  });

  it('rejects every paid combination at the encoder door', () => {
    const paid: Partial<EditSettings>[] = [
      { format: 'flac' },
      { format: 'wav24' },
      { target: 'club' },
      { spatial8d: true },
      { denoise: true },
      { activePreset: 'void_drift' },
    ];
    for (const patch of paid) {
      expect(mayRender('free', { ...NEUTRAL, ...patch })).toBe(false);
      expect(mayRender('pro', { ...NEUTRAL, ...patch })).toBe(true);
    }
    expect(mayRender('free', { ...NEUTRAL, format: 'wav16', target: 'streaming' })).toBe(true);
  });

  it('clamps the chain and the output in one call', () => {
    const clamp = clampForTier('free', { ...APP_DEFAULTS, format: 'wav24', target: 'loud' }, {
      ...NEUTRAL,
      format: 'wav24',
      target: 'loud',
      voiceMode: true,
    });
    expect(clamp.settings).toEqual({ format: 'mp3', target: 'streaming' });
    expect(clamp.edit).toEqual({ format: 'mp3', target: 'streaming', voiceMode: false });
  });
});

describe('deck and SYSTEM cannot drift apart again', () => {
  const deck = readFileSync(join(ROOT, 'src/ui/screens/deck.ts'), 'utf8');
  const system = readFileSync(join(ROOT, 'src/ui/screens/system.ts'), 'utf8');

  it('both build their format list from formatChoices()', () => {
    expect(deck).toContain('formatChoices(session.tier)');
    expect(system).toContain('formatChoices(session.tier)');
    expect(system).toContain('targetChoices(session.tier)');
  });

  it('the deck no longer draws WAV 16 as WAV 24', () => {
    expect(deck).not.toMatch(/wav16' \|\| store\.edit\.format === 'wav32'/);
    expect(deck).toContain('formatSeg.set(store.edit.format)');
  });

  it('both write the output through setOutput()', () => {
    expect(deck).toContain('store.setOutput({ format:');
    expect(system).toContain('store.setOutput({ format:');
    expect(system).toContain('store.setOutput({ target:');
  });

  it('the render gate reads the field the encoder reads', () => {
    expect(deck).toMatch(/function formatBlocked\(\)[\s\S]*?formatAllowed\(session\.tier, store\.edit\.format\)/);
    expect(deck).toMatch(/function targetBlocked\(\)/);
    expect(deck).toContain('exportBlocked()');
  });
});

describe('SYSTEM shows the same locks as the deck', () => {
  it('marks paid options PRO and refuses to store them on FREE', async () => {
    const { session } = await import('../src/state/session');
    const { store } = await import('../src/state/store');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ tier: 'free', exp: null, subject: null, adminEnabled: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
      }) as unknown as Response),
    );
    await session.refresh();

    store.settings = { ...APP_DEFAULTS };
    store.edit = { ...NEUTRAL };

    const { createSystem } = await import('../src/ui/screens/system');
    const screen = createSystem();
    document.body.replaceChildren(screen.el);

    const formatSelect = screen.el.querySelectorAll('select')[0] as HTMLSelectElement;
    const labels = Array.from(formatSelect.options).map((o) => o.textContent);
    expect(labels).toEqual([
      'MP3 · 320K',
      'WAV 16 · 44.1/48K',
      'WAV 24 · 24-BIT · PRO',
      'WAV 32F · FLOAT · PRO',
      'FLAC · LOSSLESS · PRO',
    ]);

    // Choosing a paid format opens the paywall and leaves the store alone.
    formatSelect.value = 'flac';
    formatSelect.dispatchEvent(new Event('change'));
    expect(store.settings.format).toBe('mp3');
    expect(store.edit.format).toBe('mp3');
    expect(formatSelect.value).toBe('mp3');

    screen.destroy?.();
    vi.unstubAllGlobals();
  });
});

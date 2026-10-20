// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { clampForTier, exportableFormats, mayExport, presetLocked } from '../src/model/entitlements';
import { NEUTRAL } from '../src/model/settings';
import type { AppSettings, EditSettings } from '../src/model/settings';
import { allGrants, makeGrant, parseGrant, premiumFor } from '../api/_lib/premium.js';
import { makeState, readState } from '../api/_lib/google.js';

const ROOT = process.cwd();

const settings = (patch: Partial<AppSettings> = {}): AppSettings => ({ ...({} as AppSettings), format: 'mp3', target: 'streaming', ...patch });
const edit = (patch: Partial<EditSettings> = {}): EditSettings => ({ ...NEUTRAL, ...patch });

describe('tier enforcement', () => {
  it('strips every PRO tool from a downgraded session', () => {
    const clamp = clampForTier(
      'free',
      settings({ format: 'flac', target: 'club' }),
      edit({ spatial8d: true, denoise: true, voiceMode: true }),
    );
    expect(clamp.edit).toEqual({ spatial8d: false, denoise: false, voiceMode: false });
    expect(clamp.settings).toEqual({ format: 'mp3', target: 'streaming' });
  });

  it('leaves a paid session exactly as it was', () => {
    const clamp = clampForTier('pro', settings({ format: 'flac', target: 'club' }), edit({ spatial8d: true }));
    expect(clamp).toEqual({ settings: {}, edit: {} });
  });

  it('locks the paid presets and keeps the four free ones', () => {
    expect(presetLocked('free', 'night_shift')).toBe(false);
    expect(presetLocked('free', 'deep_orbit')).toBe(true);
    expect(presetLocked('pro', 'deep_orbit')).toBe(false);
  });

  it('refuses a paid format or preset at export time', () => {
    expect(mayExport('free', 'flac', 'night_shift')).toBe(false);
    expect(mayExport('free', 'mp3', 'deep_orbit')).toBe(false);
    expect(mayExport('free', 'mp3', 'night_shift')).toBe(true);
    expect(mayExport('pro', 'flac', 'deep_orbit')).toBe(true);
    expect(exportableFormats('free')).toEqual(['mp3', 'wav16']);
  });
});

describe('google premium grants', () => {
  beforeEach(() => {
    delete process.env.AEGIS_PREMIUM;
    delete process.env.AEGIS_REVOKED;
  });

  it('mints a token that verifies back to the same address', () => {
    const token = makeGrant('Budi@Gmail.com', 30);
    const parsed = parseGrant(token);
    expect(parsed?.email).toBe('budi@gmail.com');
    expect(parsed?.active).toBe(true);
  });

  it('rejects a token whose date was edited', () => {
    const [email, , sig] = makeGrant('budi@gmail.com', 30).split(':');
    expect(parseGrant(`${email}:20301231:${sig}`)).toBeNull();
  });

  it('rejects an email with no signature at all', () => {
    expect(parseGrant('budi@gmail.com')).toBeNull();
    expect(parseGrant('budi@gmail.com:20301231')).toBeNull();
    expect(parseGrant('not-an-email:20301231:abc')).toBeNull();
  });

  it('reads the grant list from the environment', () => {
    process.env.AEGIS_PREMIUM = `${makeGrant('a@x.id', 30)}, ${makeGrant('b@x.id', 90)}`;
    expect(allGrants().map((g) => g.email)).toEqual(['a@x.id', 'b@x.id']);
    expect(premiumFor('a@x.id')?.exp).toBeGreaterThan(Date.now());
    expect(premiumFor('c@x.id')).toBeNull();
  });

  it('lets the operator cut someone off by revoking the address', () => {
    process.env.AEGIS_PREMIUM = makeGrant('a@x.id', 30);
    expect(premiumFor('a@x.id')).not.toBeNull();
    process.env.AEGIS_REVOKED = 'a@x.id';
    expect(premiumFor('a@x.id')).toBeNull();
  });
});

describe('google oauth state', () => {
  it('round-trips the remember flag', () => {
    expect(readState(makeState(true))?.remember).toBe(true);
    expect(readState(makeState(false))?.remember).toBe(false);
  });

  it('rejects a forged or stale state', () => {
    const state = makeState(true);
    expect(readState(`${state}x`)).toBeNull();
    const [payload] = state.split('.');
    expect(readState(`${payload}.forged`)).toBeNull();
    expect(readState(makeState(true), Date.now() + 20 * 60_000)).toBeNull();
  });
});

describe('sheet can never swallow the page', () => {
  it('hides a closed scrim and stops it capturing clicks', () => {
    const css = readFileSync(join(ROOT, 'src/styles/account.css'), 'utf8');
    // A class rule sets display:grid, which outranks the UA [hidden] rule, so
    // the closed overlay used to cover the whole app and eat every tap.
    expect(css).toMatch(/\.sheet-scrim\[hidden\]\s*\{\s*display:\s*none/);
    expect(css).toMatch(/\.sheet-scrim\s*\{[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/\.sheet-scrim\.is-open\s*\{[^}]*pointer-events:\s*auto/);
  });
});

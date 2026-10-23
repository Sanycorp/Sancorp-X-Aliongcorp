// @vitest-environment jsdom
/**
 * Tuning, from the owner's side.
 *
 * Two promises are tested here:
 *   1. every control explains itself in plain Indonesian, and
 *   2. every section can be put back to neutral on its own — resetting reverb
 *      must not touch tone, and must not leave a stray room size behind.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { HELP, SECTION_HELP } from '../src/model/help';
import type { HelpKey } from '../src/model/help';
import { NEUTRAL } from '../src/model/settings';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true });
});

describe('the help text', () => {
  const entries = Object.entries(HELP) as [HelpKey, (typeof HELP)[HelpKey]][];

  it('covers every control the lab exposes', () => {
    for (const key of ['speed', 'reverbLevel', 'reverbRoom', 'reverbDamp', 'clarity', 'warmth', 'denoiseAmount']) {
      expect(HELP[key as HelpKey], key).toBeTruthy();
    }
    expect(entries.length).toBeGreaterThanOrEqual(28);
  });

  it('answers "what is this" in one breath, without jargon', () => {
    const jargon = /\b(WSOLA|FDN|STFT|biquad|RBJ|Hadamard|lookahead|dBTP|send bus)\b/i;
    for (const [key, entry] of entries) {
      expect(entry.term.length, key).toBeGreaterThan(2);
      expect(entry.what.length, key).toBeGreaterThan(20);
      expect(entry.what.length, key).toBeLessThan(170);
      expect(entry.what.split('. ').length, `${key}: one sentence`).toBeLessThan(3);
      expect(entry.what, `${key} uses jargon`).not.toMatch(jargon);
      expect(entry.more.length, key).toBeGreaterThan(40);
      expect(entry.tip.length, key).toBeGreaterThan(5);
    }
  });

  it('never tells the owner to do something dangerous', () => {
    // Mono bass is a safety measure; its advice must stay "leave it on".
    expect(HELP.monoBass.tip.toLowerCase()).toContain('nyalakan');
    // The limiter guidance must not invite clipping.
    expect(HELP.finalGain.tip).toMatch(/0 dB/);
  });

  it('describes each section and when to touch it', () => {
    for (const id of ['time', 'space', 'orbit', 'tone', 'dynamics', 'repair']) {
      const section = SECTION_HELP[id];
      expect(section, id).toBeTruthy();
      expect(section.plain.length).toBeGreaterThan(30);
      expect(section.when.length).toBeGreaterThan(20);
    }
  });
});

describe('per-section reset', () => {
  it('resets only the group it belongs to', async () => {
    const { store } = await import('../src/state/store');
    store.patchEdit({ reverbLevel: 0.9, reverbRoom: 0.8, reverbDamp: 0.7, bass: 0.5, clarity: 0.4 });

    store.resetSection(['reverbEnabled', 'reverbType', 'reverbLevel', 'reverbRoom', 'reverbDamp']);

    expect(store.edit.reverbLevel).toBe(NEUTRAL.reverbLevel);
    expect(store.edit.reverbRoom).toBe(NEUTRAL.reverbRoom);
    expect(store.edit.reverbDamp).toBe(NEUTRAL.reverbDamp);
    expect(store.edit.reverbType).toBe(NEUTRAL.reverbType);
    // The neighbouring section is untouched, which is the whole point.
    expect(store.edit.bass).toBe(0.5);
    expect(store.edit.clarity).toBe(0.4);
  });

  it('marks the preview stale so the next play cannot lie', async () => {
    const { store } = await import('../src/state/store');
    store.previewReady = true;
    store.resetSection(['speed', 'fadeIn', 'fadeOut']);
    expect(store.previewReady).toBe(false);
  });

  it('puts every section back to neutral through its own button', async () => {
    const { createLab } = await import('../src/ui/screens/lab');
    const { store } = await import('../src/state/store');
    store.patchEdit({ speed: 0.7, reverbLevel: 0.6, spinRate: 0.4, bass: 0.8, warmth: 0.7, denoiseAmount: 0.9 });

    const screen = createLab();
    document.body.replaceChildren(screen.el);

    const groups = Array.from(screen.el.querySelectorAll<HTMLElement>('.lab-group'));
    expect(groups.length).toBeGreaterThanOrEqual(6);

    for (const group of groups.filter((g) => g.dataset.section)) {
      const button = group.querySelector<HTMLButtonElement>('.lab-reset');
      expect(button, `${group.dataset.section} has no reset`).not.toBeNull();
      button!.click();
    }

    expect(store.edit.speed).toBe(NEUTRAL.speed);
    expect(store.edit.reverbLevel).toBe(NEUTRAL.reverbLevel);
    expect(store.edit.spinRate).toBe(NEUTRAL.spinRate);
    expect(store.edit.bass).toBe(NEUTRAL.bass);
    expect(store.edit.warmth).toBe(NEUTRAL.warmth);
    expect(store.edit.denoiseAmount).toBe(NEUTRAL.denoiseAmount);
  });

  it('shows the explanation for every control on the screen', async () => {
    const { createLab } = await import('../src/ui/screens/lab');
    const screen = createLab();
    document.body.replaceChildren(screen.el);

    // One helper line under each fader, in the fader's own words.
    const hints = Array.from(screen.el.querySelectorAll('.fader__hint')).map((n) => n.textContent ?? '');
    expect(hints.length).toBeGreaterThanOrEqual(16);
    expect(hints.every((h) => h.length > 15)).toBe(true);

    // Reverb is explained where the reverb controls are.
    const space = screen.el.querySelector('#tune-space') as HTMLElement;
    expect(space.textContent).toContain('gema');
    expect(space.textContent).toContain('ruangan');
    // And the fold-out guide names the controls in plain words.
    expect(space.querySelectorAll('.lab-guide__list dt').length).toBeGreaterThanOrEqual(5);
  });
});

describe('the personal build', () => {
  it('opens the music screen, not the storefront or the panel', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toContain("let activeRoute: RouteId = isNativeApp() ? 'deck' : 'home';");
  });

  it('needs no account and no network inside the app', async () => {
    const { readFileSync } = await import('node:fs');
    const session = readFileSync('src/state/session.ts', 'utf8');
    // The APK is the licence: it answers locally instead of asking a server it
    // cannot reach from https://localhost.
    expect(session).toContain('if (isNativeApp()) {');
    expect(session).toContain("tier: 'pro',");

    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toContain('if (isNativeApp()) {\n      closeGate();');
  });

  it('hides the storefront tab in the app', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toContain('const ROUTES: NavRoute[] = isNativeApp()');
    expect(main).toContain("STUDIO_ROUTES: NavRoute[] = [");
  });
});

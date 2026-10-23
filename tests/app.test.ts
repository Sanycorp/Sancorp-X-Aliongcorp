// @vitest-environment jsdom
/**
 * The panel is an app, not a page.
 *
 * Three things make that true and all three are easy to regress: the tab bar
 * sits at the bottom on a phone, the site chrome is gone while the panel is
 * open, and the manifest offers it as an installable shortcut.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

describe('install surface', () => {
  it('is unavailable in a plain browser tab, and says so instead of pretending', async () => {
    const { installAvailable, promptInstall, standalone } = await import('../src/ui/install');
    expect(standalone()).toBe(false);
    expect(installAvailable()).toBe(false);
    // No prompt event was ever captured, so the caller must not show a button.
    await expect(promptInstall()).resolves.toBe('unavailable');
  });

  it('knows when it is already installed', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('standalone'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    const { installAvailable, standalone } = await import('../src/ui/install');
    expect(standalone()).toBe(true);
    expect(installAvailable()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('offers the Share sheet line on iOS instead of a dead button', async () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
    const { iosInstallHint } = await import('../src/ui/install');
    expect(iosInstallHint()).toBe(true);
  });
});

describe('manifest', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
    display: string;
    orientation: string;
    shortcuts: { name: string; short_name: string; url: string }[];
    icons: { purpose?: string }[];
  };

  it('opens as a standalone app, portrait, with a maskable icon', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait-primary');
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('offers the owner panel as a home-screen shortcut', () => {
    const urls = manifest.shortcuts.map((s) => s.url);
    expect(urls).toContain('./#/control');
    const owner = manifest.shortcuts.find((s) => s.url === './#/control');
    expect(owner?.name).toBe('Panel owner');
    // No stale codename survives in the launcher.
    expect(manifest.shortcuts.map((s) => s.name).join(' ')).not.toMatch(/Forge|OPS/);
  });
});

describe('app shell', () => {
  const css = readFileSync('src/styles/control.css', 'utf8');

  it('removes the site chrome while the panel is open', () => {
    expect(css).toMatch(/\[data-route='control'\] \.app-header/);
    expect(css).toMatch(/\[data-route='control'\] \.nav/);
  });

  it('moves the rooms to a bottom tab bar on a phone', () => {
    // The fixed bar and its safe-area padding both live in the small-screen block.
    expect(css).toMatch(/\.owner-tabs\s*\{[^}]*position: fixed/);
    expect(css).toMatch(/padding-bottom: env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/\.owner-tab\s*\{[^}]*min-height: 56px/);
  });

  it('keeps the page clear of the bar', () => {
    expect(css).toMatch(/padding-bottom: calc\(74px \+ env\(safe-area-inset-bottom\)\)/);
  });
});

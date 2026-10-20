import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static audit of the responsive layer. These are cheap guards against the
 * regressions that actually break phones: a missing safe-area, a fixed width,
 * a hover-only affordance, an unclamped headline.
 */

const STYLE_DIR = join(process.cwd(), 'src', 'styles');
const css = readdirSync(STYLE_DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(STYLE_DIR, f), 'utf8'))
  .join('\n');

const count = (needle: RegExp): number => (css.match(needle) ?? []).length;

describe('responsive stylesheet', () => {
  it('uses fluid type instead of fixed headline sizes', () => {
    expect(count(/clamp\(/g)).toBeGreaterThan(30);
    expect(css).toContain('--fs-display');
    expect(css).toContain('--fs-2xs');
  });

  it('declares the full breakpoint set', () => {
    for (const query of [
      'min-width: 720px',
      'min-width: 900px',
      'min-width: 1080px',
      'min-width: 1440px',
      'max-width: 359px',
      'orientation: landscape',
    ]) {
      expect(css).toContain(query);
    }
  });

  it('respects every safe-area inset', () => {
    for (const inset of ['safe-area-inset-top', 'safe-area-inset-bottom', 'safe-area-inset-left', 'safe-area-inset-right']) {
      expect(css).toContain(inset);
    }
  });

  it('never uses viewport-width units that cause horizontal scroll', () => {
    expect(css).not.toMatch(/width:\s*100vw/);
    expect(css).not.toMatch(/min-width:\s*100vw/);
  });

  it('keeps touch targets at or above 44 px', () => {
    expect(css).toMatch(/\.btn\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.toggle\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.nav__btn\s*\{[^}]*min-height:\s*44px/);
  });

  it('gates hover effects behind a real pointer', () => {
    expect(css).toContain('@media (hover: hover) and (pointer: fine)');
    expect(css).toContain('@media (hover: none)');
  });

  it('supports reduced motion and dynamic viewport height', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('100dvh');
  });

  it('ships the mobile dock and hides it on desktop', () => {
    expect(css).toContain('.dock');
    expect(css).toMatch(/@media \(min-width: 900px\)\s*\{\s*\[data-route='deck'\] \.dock\s*\{\s*display: none/);
  });

  it('styles native view transitions', () => {
    expect(css).toContain('::view-transition-old(root)');
    expect(css).toContain('::view-transition-new(root)');
  });
});

describe('app shell markup contract', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  it('declares a viewport that covers notches', () => {
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('width=device-width');
  });

  it('ships light and dark theme colours', () => {
    expect(html).toContain('prefers-color-scheme: light');
    expect(html).toContain('prefers-color-scheme: dark');
  });

  it('routes the boot splash through safe areas', () => {
    // The splash stylesheet now lives in /boot.css so the document can ship
    // without inline <style> under a strict CSP.
    const boot = readFileSync(join(process.cwd(), 'public', 'boot.css'), 'utf8');
    expect(boot).toContain('safe-area-inset-top');
    expect(boot).toContain('safe-area-inset-bottom');
    expect(html).toContain('/boot.css');
    expect(html).not.toContain('<style>');
  });
});

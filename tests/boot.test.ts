// @vitest-environment jsdom
/**
 * Cold-boot smoke test.
 *
 * Unit tests prove each module in isolation; this one proves the whole shell
 * still mounts. The failures it catches are the expensive kind — a missing
 * import or a browser API that only exists on some platforms — which unit tests
 * cannot see because they never run `boot()`.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', NoopObserver);
  vi.stubGlobal('IntersectionObserver', NoopObserver);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  document.body.innerHTML = '<div id="app"></div><div id="boot"><span>boot</span></div>';
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({
      tier: 'free',
      exp: null,
      subject: null,
      name: '',
      email: null,
      lic: null,
      signedIn: false,
      adminEnabled: true,
      devSecret: false,
      google: true,
    }),
  }));
});

describe('cold boot', () => {
  it('opens on the public front page, with no gate over it', async () => {
    await import('../src/main');
    await new Promise((resolve) => setTimeout(resolve, 600));

    const html = document.documentElement;
    // The platform facts have to exist before screens are built.
    expect(html.dataset.form).toBeTruthy();
    expect(html.dataset.os).toBeTruthy();
    expect(html.dataset.perf).toBeTruthy();

    // A commercial page nobody can read is not a commercial page.
    expect(html.dataset.route).toBe('home');
    expect(document.querySelector('#screen-home.is-active')).toBeTruthy();
    expect(document.querySelector('.gate')).toBeNull();
    expect(document.getElementById('app')?.hasAttribute('inert')).toBe(false);
  });

  it('demands an account the moment the studio is opened', async () => {
    location.hash = '#/deck';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await new Promise((resolve) => setTimeout(resolve, 60));

    const gate = document.querySelector('.gate');
    expect(gate).toBeTruthy();
    expect(document.body.classList.contains('gate-open')).toBe(true);
    expect(document.getElementById('app')?.hasAttribute('inert')).toBe(true);
    // The only door is Google.
    expect(gate?.textContent).toContain('MASUK DENGAN GOOGLE');
    // A key alone must not be offered here.
    expect(gate?.querySelector('.input--key')).toBeNull();
  });
});

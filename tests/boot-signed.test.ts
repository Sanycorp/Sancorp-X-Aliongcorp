// @vitest-environment jsdom
/**
 * The other half of the gate contract: a signed-in visitor must *not* be
 * interrupted. A gate that never closes is as broken as one that never opens.
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
  document.body.innerHTML = '<div id="app"></div><div id="boot"></div>';
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({
      tier: 'pro',
      exp: Date.now() + 20 * 86_400_000,
      subject: 'someone@gmail.com',
      name: 'Someone',
      email: 'someone@gmail.com',
      lic: 'ABCD1234XY',
      signedIn: true,
      adminEnabled: true,
      devSecret: false,
      google: true,
    }),
  }));
});

describe('boot with a session', () => {
  it('does not block a signed-in account', async () => {
    await import('../src/main');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(document.querySelector('.gate')).toBeNull();
    expect(document.getElementById('app')?.hasAttribute('inert')).toBe(false);
    expect(document.body.classList.contains('gate-open')).toBe(false);
  });
});

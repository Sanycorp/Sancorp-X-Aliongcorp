// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';

const ctxStub = {
  setTransform: () => undefined,
  clearRect: () => undefined,
  fillRect: () => undefined,
  strokeRect: () => undefined,
  beginPath: () => undefined,
  moveTo: () => undefined,
  lineTo: () => undefined,
  stroke: () => undefined,
  fill: () => undefined,
  closePath: () => undefined,
  createLinearGradient: () => ({ addColorStop: () => undefined }),
  fillText: () => undefined,
  set fillStyle(_v: string) {},
  set strokeStyle(_v: string) {},
  set lineWidth(_v: number) {},
  set globalAlpha(_v: number) {},
  set font(_v: string) {},
  set textAlign(_v: string) {},
  set textBaseline(_v: string) {},
};

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ctxStub,
    configurable: true,
  });
  Element.prototype.scrollIntoView = () => undefined;
  Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true });
});

/** A Response-shaped object good enough for the session store. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

describe('operator console', () => {
  it('stays locked for a signed-out visitor', async () => {
    const { createControl } = await import('../src/ui/screens/control');
    const { session } = await import('../src/state/session');

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ tier: 'free', adminEnabled: true })));
    await session.refresh();

    const screen = createControl();
    document.body.replaceChildren(screen.el);

    expect(screen.el.dataset.gate).toBe('locked');
    expect(screen.el.querySelector('.ctrl-gate__title')?.textContent).toBe('AKSES OPERATOR');
    expect(screen.el.querySelector('.ctrl-tabs')?.textContent).toBe('');
    screen.destroy?.();
    vi.unstubAllGlobals();
  });

  it('renders telemetry for an admin session', async () => {
    const { createControl } = await import('../src/ui/screens/control');
    const { session } = await import('../src/state/session');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/auth')) {
          return jsonResponse({
            tier: 'admin',
            exp: Date.now() + 86_400_000,
            subject: 'admin',
            adminEnabled: true,
            devSecret: false,
          });
        }
        if (url.startsWith('/api/health')) {
          return jsonResponse({
            ok: true,
            commit: 'abc1234',
            ref: 'main',
            env: 'production',
            region: 'sin1',
            uptimeSec: 42,
            now: Date.now(),
          });
        }
        if (url.startsWith('/api/csp-report')) return jsonResponse({ count: 0, reports: [] });
        if (url.startsWith('/api/license')) return jsonResponse({ ok: true, revoked: 0, adminEnabled: true, devSecret: false, days: [1, 7, 30] });
        return jsonResponse({}, 404);
      }),
    );
    await session.refresh();

    const screen = createControl();
    document.body.replaceChildren(screen.el);

    expect(session.tier).toBe('admin');
    expect(screen.el.dataset.gate).toBe('open');

    const tabs = screen.el.querySelectorAll('.ctrl-tabs .segment button');
    expect(Array.from(tabs).map((b) => b.textContent)).toEqual(['LIVE', 'AKUN', 'TERBIT', 'KEAMANAN']);

    // The desk mints on the server; the copy must say so.
    (tabs[2] as HTMLButtonElement).click();
    expect(screen.el.textContent).toContain('TERBITKAN KUNCI');
    expect(screen.el.textContent).toContain('HMAC-SHA256');

    // And the ledger is the operator's own device, not a database.
    (tabs[1] as HTMLButtonElement).click();
    expect(screen.el.textContent).toContain('DAFTAR AKUN');
    expect(screen.el.textContent).toContain('perangkat ini');

    // Revocation and the live header probe live behind the fourth tab.
    (tabs[3] as HTMLButtonElement).click();
    expect(screen.el.textContent).toContain('PENCABUTAN');
    expect(screen.el.textContent).toContain('HEADER LIVE');
    expect(screen.el.textContent).toContain('LAPORAN CSP');

    screen.destroy?.();
    vi.unstubAllGlobals();
  });

  it('never grants a tier when the endpoint is unreachable', async () => {
    const { session } = await import('../src/state/session');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    await session.refresh();
    expect(session.tier).toBe('free');
    expect(session.state.status).toBe('offline');
    vi.unstubAllGlobals();
  });
});

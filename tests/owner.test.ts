// @vitest-environment jsdom
/**
 * The owner panel.
 *
 * These tests are written from the owner's side of the screen: every room must
 * say what it is for in words that do not require the source code, the front
 * page of the panel must answer "what needs doing today", and the guide must
 * cover the five things that actually happen on Telegram.
 */
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
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => ctxStub, configurable: true });
  Element.prototype.scrollIntoView = () => undefined;
  Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: () => Promise.resolve() },
    configurable: true,
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

async function openPanel(license: Record<string, unknown> = {}) {
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
          subject: 'owner',
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
          uptimeSec: 61,
          now: Date.now(),
        });
      }
      if (url.startsWith('/api/csp-report')) return jsonResponse({ count: 0, reports: [] });
      if (url.startsWith('/api/rating')) {
        return jsonResponse({
          ok: true,
          sink: false,
          source: 'none',
          cachedAt: 0,
          summary: { count: 0, average: 0, distribution: [0, 0, 0, 0, 0], positive: 0 },
          ratings: [],
        });
      }
      if (url.startsWith('/api/license')) {
        return jsonResponse({ ok: true, revoked: 0, adminEnabled: true, devSecret: false, days: [1, 7, 30], ...license });
      }
      return jsonResponse({}, 404);
    }),
  );

  await session.refresh();
  const screen = createControl();
  document.body.replaceChildren(screen.el);
  return { screen, tabs: () => Array.from(screen.el.querySelectorAll<HTMLButtonElement>('.owner-tab')) };
}

describe('owner panel', () => {
  it('opens with the company seal and says whose panel this is', async () => {
    const { screen } = await openPanel();
    const head = screen.el.querySelector('.owner-head');
    expect(head).not.toBeNull();
    // The seal is the company mark, the same vector used in the header.
    expect(head?.querySelector('.brand__mark .brand-seal')).not.toBeNull();
    expect(head?.textContent).toContain('PANEL OWNER');
    expect(head?.textContent).toContain('pusat kendali');
    // A greeting, not a system message.
    expect(screen.el.querySelector('.owner-head__greet')?.textContent).toMatch(/Selamat (pagi|siang|sore|malam), Owner/);
    screen.destroy?.();
    vi.unstubAllGlobals();
  });

  it('lands on a summary that answers "what needs doing today"', async () => {
    const { screen, tabs } = await openPanel();
    // The panel probes health and the ledger once on arrival; wait for that
    // first answer instead of racing it.
    await new Promise((r) => setTimeout(r, 60));
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');

    const text = screen.el.textContent ?? '';
    expect(text).toContain('PERLU KEPUTUSAN');
    expect(text).toContain('MULAI DARI SINI');
    expect(text).toContain('HARI INI');
    // Plain state, not log lines.
    expect(text).toContain('SITUS');
    expect(text).toContain('AKUN AKTIF');
    expect(text).toContain('PENDAPATAN');
    // With nothing wrong, the panel says so instead of showing an empty box.
    expect(text).toContain('Semua beres');
    screen.destroy?.();
    vi.unstubAllGlobals();
  });

  it('raises the two settings that can cost money, in plain words', async () => {
    const { screen } = await openPanel({ devSecret: true });
    await new Promise((r) => setTimeout(r, 30));
    const text = screen.el.textContent ?? '';
    expect(text).toContain('Kunci keamanan masih mode uji');
    expect(text).toContain('bisa dipalsukan');
    screen.destroy?.();
    vi.unstubAllGlobals();
  });

  it('explains every room before showing its controls', async () => {
    const { screen, tabs } = await openPanel();
    for (const index of [1, 2, 3, 4]) {
      tabs()[index].click();
      const notes = screen.el.querySelectorAll('.owner-note');
      expect(notes.length, `room ${index} has no helper line`).toBeGreaterThan(0);
      const copy = Array.from(notes).map((n) => n.textContent ?? '').join(' ');
      // A helper line is a sentence, not a label.
      expect(copy.length).toBeGreaterThan(40);
      expect(copy).not.toMatch(/\bAPI\b|\bendpoint\b|\bJSON\b/);
    }
    screen.destroy?.();
    vi.unstubAllGlobals();
  });

  it('carries a manual that matches what happens on Telegram', async () => {
    const { screen, tabs } = await openPanel();
    tabs()[5].click();

    const flows = screen.el.querySelectorAll('.owner-flow');
    expect(flows.length).toBe(5);
    const text = screen.el.textContent ?? '';
    expect(text).toContain('Kalau ada yang membayar');
    expect(text).toContain('Kalau pembeli sudah punya akun Google');
    expect(text).toContain('minta perpanjang');
    expect(text).toContain('ganti HP');
    expect(text).toContain('menyalahgunakan kunci');

    // The glossary exists so no screen has to teach jargon twice.
    expect(screen.el.querySelectorAll('.owner-gloss dt').length).toBeGreaterThanOrEqual(5);
    expect(text).toContain('Satu kunci hanya hidup di satu perangkat');

    // Ready-to-send messages, one per common situation.
    expect(screen.el.querySelectorAll('.owner-tpl').length).toBe(3);

    // And the rules that keep the desk honest.
    expect(screen.el.querySelectorAll('.owner-dont li').length).toBeGreaterThanOrEqual(3);
    screen.destroy?.();
    vi.unstubAllGlobals();
  });

  it('keeps the owner out until the operator key is given', async () => {
    const { createControl } = await import('../src/ui/screens/control');
    const { session } = await import('../src/state/session');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ tier: 'pro', adminEnabled: true })));
    await session.refresh();

    const screen = createControl();
    document.body.replaceChildren(screen.el);
    expect(screen.el.dataset.gate).toBe('locked');
    // The manual is not available to a signed-in customer either.
    expect(screen.el.querySelector('.owner-tabs')).toBeNull();
    expect(screen.el.textContent).not.toContain('LIMA PEKERJAAN UTAMA');
    screen.destroy?.();
    vi.unstubAllGlobals();
  });
});

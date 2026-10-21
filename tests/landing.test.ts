// @vitest-environment jsdom
/**
 * The front page is the only part of the product a stranger sees, so it is
 * tested like a product: the numbers have to be the real ones, the price has to
 * be the price, and the door has to lead somewhere.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CHAIN_GROUPS, CHAIN_STAGES, FORMAT_LADDER } from '../src/model/chain';
import { PRO_PRICE } from '../src/model/tiers';

class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

vi.mock('../src/state/session', () => {
  const listeners = new Set<() => void>();
  return {
    session: {
      state: { status: 'ready', tier: 'free', google: true, email: null, subject: null },
      get signedIn() {
        return false;
      },
      subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      signInGoogle: vi.fn(),
    },
  };
});

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', NoopObserver);
  vi.stubGlobal('IntersectionObserver', NoopObserver);
  document.body.innerHTML = '<div id="app"></div>';
});

describe('pricing arithmetic', () => {
  it('charges per full 30-day month, with no rounding surprise', async () => {
    const { passPrice, rupiah } = await import('../src/ui/screens/home');
    expect(passPrice(30)).toBe(5000);
    expect(passPrice(90)).toBe(15000);
    expect(passPrice(365)).toBe(60833);
    expect(rupiah(60833)).toMatch(/^Rp\s?60\.833$/);
    expect(PRO_PRICE).toBe('Rp 5.000');
  });
});

describe('the chain table is the engine order', () => {
  it('lists every stage once, master before limiter', () => {
    const ids = CHAIN_STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.indexOf('master')).toBeLessThan(ids.indexOf('limit'));
    expect(ids.indexOf('clean')).toBe(0);
    // The limiter is the last thing that touches samples.
    expect(ids.at(-1)).toBe('limit');
  });

  it('groups the same stages, in the same order, without losing one', () => {
    const flat = CHAIN_GROUPS.flatMap((g) => g.stages);
    expect(flat).toEqual(CHAIN_STAGES.map((s) => s.id));
  });

  it('offers five formats, with the lossless ones behind PRO', () => {
    expect(FORMAT_LADDER.map((f) => f.id)).toEqual(['mp3', 'wav16', 'wav24', 'wav32', 'flac']);
    expect(FORMAT_LADDER.filter((f) => !f.pro).map((f) => f.id)).toEqual(['mp3', 'wav16']);
  });
});

describe('the page itself', () => {
  it('leads with the product claim, not a slogan about AI', async () => {
    const { createHome } = await import('../src/ui/screens/home');
    const { el } = createHome();
    const text = (el.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('Rantai mastering');
    expect(text).not.toMatch(/\bAI\b|kecerdasan buatan|revolusioner|terbaik di dunia/i);
    expect(text).toContain('Rp 5.000');
    expect(text).toContain('satu perangkat per kunci');
    expect(text).toContain('−1.2 dBTP');
    expect(text).toContain('48 kHz');
  });

  it('answers the six objections a buyer actually has', async () => {
    const { createHome } = await import('../src/ui/screens/home');
    const { el } = createHome();
    const items = el.querySelectorAll('.lp-faq__item');
    expect(items.length).toBeGreaterThanOrEqual(6);
    const text = el.textContent ?? '';
    expect(text).toContain('diunggah');
    expect(text).toContain('langganan otomatis');
    expect(text).toContain('Telegram');
  });

  it('recalculates the pass total when the length changes', async () => {
    const { createHome } = await import('../src/ui/screens/home');
    const { el } = createHome();
    const total = el.querySelector('.lp-price__total') as HTMLElement;
    expect(total.textContent).toMatch(/5\.000/);

    const year = el.querySelector<HTMLButtonElement>('.lp-price__opt[data-days="365"]');
    expect(year).toBeTruthy();
    year!.click();
    expect(total.textContent).toMatch(/60\.833/);
    expect(year!.getAttribute('aria-pressed')).toBe('true');
  });

  it('sends a signed-out visitor to the gate, not into the studio', async () => {
    const { createHome } = await import('../src/ui/screens/home');
    const { el } = createHome();
    el.querySelector<HTMLButtonElement>('.lp-hero__actions .btn')?.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelector('.gate')).toBeTruthy();
    expect(location.hash).not.toBe('#/deck');
  });
});

describe('the front page is wired into the shell', () => {
  const read = (path: string) => require('node:fs').readFileSync(path, 'utf8') as string;

  it('imports its stylesheet', () => {
    const main = read('src/main.ts');
    expect(main).toContain("import './styles/landing.css'");
    expect(main).toContain("import { createHome } from './ui/screens/home'");
    expect(main).toMatch(/PUBLIC_ROUTES = new Set<RouteId>\(\['home', 'control'\]\)/);
  });

  it('hides the studio chrome on the public page', () => {
    const css = read('src/styles/landing.css');
    expect(css).toMatch(/html\[data-route='home'\] \.app-header/);
    expect(css).toMatch(/html\[data-route='home'\] \.nav/);
  });
});

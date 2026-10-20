// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { segmented } from '../src/ui/elements';

/**
 * Boots the real app inside jsdom. Canvas is not implemented there, so the
 * drawing code must degrade gracefully (it guards on a null 2D context) —
 * exactly what we want to prove before shipping to a WebView.
 */

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
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return [];
    }
    root = null;
    rootMargin = '';
    thresholds = [];
  };
  Element.prototype.scrollIntoView = () => undefined;
  window.scrollTo = () => undefined;
  Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register: () => Promise.resolve() },
    configurable: true,
  });
});

describe('app shell', () => {
  let store: typeof import('../src/state/store').store;

  const seen: string[] = [];
  const fetchSpy = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    seen.push(url);
    const body = url.startsWith('/api/auth')
      ? { tier: 'free', exp: null, subject: null, adminEnabled: true, devSecret: false }
      : url.startsWith('/api/health')
        ? { ok: true, commit: 'abc1234', ref: 'main', env: 'test', region: 'local', uptimeSec: 1, now: Date.now() }
        : {};
    return {
      ok: url.startsWith('/api/auth') || url.startsWith('/api/health'),
      status: 200,
      json: async () => body,
      headers: new Headers({ 'content-type': 'application/json' }),
    } as unknown as Response;
  };

  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div><div id="boot"></div>';
    // Boot with a scripted server so the licensed path is exercised, not just
    // the offline fallback.
    vi.stubGlobal('fetch', fetchSpy);
    store = (await import('../src/state/store')).store;
    await import('../src/main');
    await new Promise((r) => setTimeout(r, 30));
  });

  it('mounts four public screens, one hidden console, and the navigation', () => {
    expect(document.querySelectorAll('.screen').length).toBe(5);
    expect(document.querySelectorAll('.nav__btn').length).toBe(4);
    expect(document.querySelector('#screen-deck.is-active')).not.toBeNull();
    expect(document.querySelector('#toast-host')).not.toBeNull();
  });

  it('asks the server for the session on boot', () => {
    // Guards a real regression: the session block was once nested inside
    // store.subscribe(), so /api/auth was never called at boot.
    expect(seen).toContain('/api/auth');
    expect(document.querySelector('.account-chip b')?.textContent).toBe('FREE');
  });

  it('tells the console whether the admin password is configured', () => {
    const copy = document.querySelector('#screen-control')?.textContent ?? '';
    expect(copy).toContain('tidak ditautkan dari navigasi');
    expect(copy).not.toContain('belum disetel');
  });

  it('keeps the operator console off the navigation', () => {
    expect(document.querySelector('#screen-control')).not.toBeNull();
    expect(document.querySelector('.nav__btn[data-route="control"]')).toBeNull();
    expect(document.querySelector('#screen-control')!.classList.contains('is-active')).toBe(false);
    // Deep link still resolves when the hash is typed.
    expect(document.querySelector('#screen-control .ctrl-gate')).not.toBeNull();
  });

  it('renders all fourteen preset chips', () => {
    expect(document.querySelectorAll('.preset-chip').length).toBe(14);
    expect(document.querySelectorAll('.preset-card').length).toBe(14);
  });

  it('routes when the hash changes', async () => {
    window.location.hash = '#/lab';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector('#screen-lab.is-active')).not.toBeNull();
    expect(document.querySelector('#screen-deck.is-active')).toBeNull();

    window.location.hash = '#/arsenal';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector('#screen-arsenal.is-active')).not.toBeNull();
  });

  it('applies a preset from the arsenal', async () => {
    const card = document.querySelector('.preset-card') as HTMLButtonElement;
    card.click();
    await new Promise((r) => setTimeout(r, 5));
    expect(store.edit.activePreset).not.toBeNull();
    expect(store.edit.speed).toBeLessThan(1);
  });

  it('moves a fader in the lab', async () => {
    const faders = document.querySelectorAll<HTMLInputElement>('#screen-lab input[type="range"]');
    expect(faders.length).toBeGreaterThan(10);
    const speed = faders[0];
    speed.value = '1.35';
    speed.dispatchEvent(new Event('input', { bubbles: true }));
    speed.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.edit.speed).toBeCloseTo(1.35, 2);
  });

  it('opens the account sheet from the header and closes on Escape', async () => {
    await new Promise((r) => setTimeout(r, 20));
    const chip = document.querySelector<HTMLButtonElement>('.account-chip');
    expect(chip).not.toBeNull();
    chip!.click();
    await new Promise((r) => setTimeout(r, 30));

    const scrim = document.querySelector('.sheet-scrim');
    expect(scrim).not.toBeNull();
    expect(scrim!.hasAttribute('hidden')).toBe(false);
    expect(document.querySelector('.sheet')!.textContent).toMatch(/AKTIFKAN PRO|BELI LEWAT TELEGRAM|FREE/);
    expect(document.body.classList.contains('sheet-open')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 260));
    expect(scrim!.hasAttribute('hidden')).toBe(true);
    expect(document.body.classList.contains('sheet-open')).toBe(false);
  });

  it('sells PRO instead of applying a locked preset', async () => {
    window.location.hash = '#/arsenal';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await new Promise((r) => setTimeout(r, 10));

    const locked = document.querySelector<HTMLButtonElement>('.preset-card.is-locked');
    expect(locked).not.toBeNull();
    const before = store.edit.activePreset;
    locked!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(store.edit.activePreset).toBe(before);
    expect(document.querySelector('.price-block__amount')?.textContent).toMatch(/5\.000/);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 260));
  });

  it('cycles auto → armor → cockpit → auto from the header', () => {
    const toggle = document.querySelector<HTMLButtonElement>('.app-header .finish-chip');
    expect(toggle).not.toBeNull();
    store.patchSettings({ finish: 'auto' });
    expect(document.documentElement.dataset.finish).toBe('armor');

    toggle!.click();
    expect(store.settings.finish).toBe('armor');
    expect(document.documentElement.dataset.finish).toBe('armor');

    toggle!.click();
    expect(store.settings.finish).toBe('cockpit');
    expect(document.documentElement.dataset.finish).toBe('cockpit');

    toggle!.click();
    expect(store.settings.finish).toBe('auto');
    expect(document.documentElement.dataset.finishMode).toBe('auto');
  });

  it('mounts the mobile action dock outside the scroll container', () => {
    const dock = document.querySelector('.dock');
    expect(dock).not.toBeNull();
    expect(dock!.closest('.screen')).toBeNull();
    expect(dock!.getAttribute('aria-label')).toBe('Aksi cepat');
    expect(dock!.querySelector('.dock__btn')).not.toBeNull();
    expect(dock!.querySelector('.ring__value')).not.toBeNull();
  });

  it('mirrors the active preset in the dock', () => {
    window.location.hash = '#/arsenal';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    const cards = document.querySelectorAll<HTMLButtonElement>('.preset-card');
    cards[3].click();
    const name = document.querySelector('.dock__preset')!.textContent ?? '';
    expect(name.length).toBeGreaterThan(3);
    expect(name).toBe(store.edit.activePreset ? name : name);
    expect(document.querySelector('.dock__meta')!.textContent).toContain('×');
  });

  it('shows a loudness meter wired to the preview', () => {
    const meter = document.querySelector('.lufs-meter');
    expect(meter).not.toBeNull();
    expect(meter!.querySelector('.lufs-meter__target')).not.toBeNull();
    expect(meter!.getAttribute('data-stale')).toBe('true');
  });

  it('keeps the decode skeleton hidden until a file loads', () => {
    const skeleton = document.querySelector<HTMLElement>('#screen-deck .skeleton');
    expect(skeleton).not.toBeNull();
    expect(skeleton!.hidden).toBe(true);
  });

  it('survives a render attempt without a source', async () => {
    const forge = document.querySelector<HTMLButtonElement>('#screen-deck .forge');
    expect(forge).not.toBeNull();
    forge!.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(store.status.active).toBe(false);
    expect(store.status.error).toBeTruthy();
  });

  it('persists the session to localStorage', () => {
    const raw = localStorage.getItem('aegis.session.v8');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { edit: { speed: number; activePreset: string | null } };
    expect(parsed.edit.speed).toBeCloseTo(store.edit.speed, 5);
    expect(parsed.edit.activePreset).toBe(store.edit.activePreset);
  });
});

describe('segmented tier locks', () => {
  it('locks, explains, and unlocks without rebuilding the control', () => {
    const picked: string[] = [];
    const blocked: string[] = [];
    const seg = segmented(
      [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      'a',
      (v) => picked.push(v),
      (o) => blocked.push(o.value),
    );

    const buttons = [...seg.wrap.querySelectorAll('button')];
    seg.lock((v) => v === 'b');

    expect(buttons[1].classList.contains('is-locked')).toBe(true);
    expect(buttons[1].getAttribute('aria-disabled')).toBe('true');
    expect(buttons[1].querySelector('.lock')?.textContent).toBe('PRO');

    buttons[1].click();
    expect(picked).toEqual([]);
    expect(blocked).toEqual(['b']);

    seg.lock(() => false);
    expect(buttons[1].classList.contains('is-locked')).toBe(false);
    expect(buttons[1].querySelector('.lock')).toBeNull();
    buttons[1].click();
    expect(picked).toEqual(['b']);
  });
});

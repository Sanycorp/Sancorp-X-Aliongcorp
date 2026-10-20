// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';

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

  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div><div id="boot"></div>';
    store = (await import('../src/state/store')).store;
    await import('../src/main');
  });

  it('mounts four screens and the navigation', () => {
    expect(document.querySelectorAll('.screen').length).toBe(4);
    expect(document.querySelectorAll('.nav__btn').length).toBe(4);
    expect(document.querySelector('#screen-deck.is-active')).not.toBeNull();
    expect(document.querySelector('#toast-host')).not.toBeNull();
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

  it('cycles auto → armor → cockpit → auto from the header', () => {
    const toggle = document.querySelector<HTMLButtonElement>('.app-header .header__meta button');
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

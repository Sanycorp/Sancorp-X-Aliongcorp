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

  it('toggles the cockpit finish', () => {
    const toggle = document.querySelector<HTMLButtonElement>('.app-header .header__meta button');
    expect(toggle).not.toBeNull();
    const before = store.settings.finish;
    toggle!.click();
    expect(store.settings.finish).not.toBe(before);
    expect(document.documentElement.dataset.finish).toBe(store.settings.finish);
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
    const parsed = JSON.parse(raw!) as { edit: { speed: number } };
    expect(parsed.edit.speed).toBeCloseTo(1.35, 2);
  });
});

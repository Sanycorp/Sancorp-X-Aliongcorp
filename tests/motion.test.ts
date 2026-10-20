// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { store } from '../src/state/store';

const ctxStub = {
  setTransform: () => undefined,
  clearRect: () => undefined,
  save: () => undefined,
  restore: () => undefined,
  translate: () => undefined,
  rotate: () => undefined,
  fillRect: () => undefined,
  set fillStyle(_v: string) {},
  set globalAlpha(_v: number) {},
};

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ctxStub,
    configurable: true,
  });
  if (!window.matchMedia) {
    // jsdom ships matchMedia, but older environments may not.
    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
  }
});

beforeEach(() => {
  store.patchSettings({ reduceMotion: false });
  document.body.innerHTML = '';
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('tween', () => {
  it('walks from start to end and fires onDone', async () => {
    const { tween } = await import('../src/ui/motion');
    const seen: number[] = [];
    let done = false;
    tween(0, 100, (v) => seen.push(v), { duration: 80, onDone: () => (done = true) });
    await sleep(220);
    expect(done).toBe(true);
    expect(seen[seen.length - 1]).toBe(100);
    expect(seen[0]).toBeLessThan(100);
    expect(seen.length).toBeGreaterThan(2);
  });

  it('jumps instantly when Reduce Motion is on', async () => {
    const { tween } = await import('../src/ui/motion');
    store.patchSettings({ reduceMotion: true });
    const seen: number[] = [];
    tween(0, 100, (v) => seen.push(v), { duration: 500 });
    expect(seen).toEqual([100]);
  });
});

describe('animateValue', () => {
  it('retargets from the value currently on screen', async () => {
    const { animateValue } = await import('../src/ui/motion');
    const node = document.createElement('span');
    document.body.appendChild(node);
    animateValue(node, 50, (n) => n.toFixed(1), { duration: 60 });
    await sleep(140);
    expect(node.textContent).toBe('50.0');

    animateValue(node, 75, (n) => n.toFixed(1), { duration: 60 });
    await sleep(140);
    expect(node.textContent).toBe('75.0');
  });

  it('formats non-finite values without throwing', async () => {
    const { animateValue } = await import('../src/ui/motion');
    const node = document.createElement('span');
    animateValue(node, Number.NEGATIVE_INFINITY, (n) => (Number.isFinite(n) ? n.toFixed(1) : '−∞'));
    expect(node.textContent).toBe('−∞');
  });
});

describe('scramble', () => {
  it('settles on the final text and keeps an aria-label', async () => {
    const { scramble } = await import('../src/ui/motion');
    const node = document.createElement('span');
    scramble(node, 'MECHA PROTOCOL', 120);
    await sleep(260);
    expect(node.textContent).toBe('MECHA PROTOCOL');
    expect(node.getAttribute('aria-label')).toBe('MECHA PROTOCOL');
  });

  it('is instant under Reduce Motion', async () => {
    const { scramble } = await import('../src/ui/motion');
    store.patchSettings({ reduceMotion: true });
    const node = document.createElement('span');
    scramble(node, 'NIGHT SHIFT');
    expect(node.textContent).toBe('NIGHT SHIFT');
  });
});

describe('ripple', () => {
  it('adds a ripple inside a button and removes it later', async () => {
    const { installRipple } = await import('../src/ui/motion');
    installRipple(document);
    const btn = document.createElement('button');
    btn.className = 'btn';
    document.body.appendChild(btn);
    btn.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }),
    );
    expect(btn.querySelector('.ripple')).not.toBeNull();
    await sleep(700);
    expect(btn.querySelector('.ripple')).toBeNull();
  });

  it('ignores clicks outside interactive controls', async () => {
    const { installRipple } = await import('../src/ui/motion');
    installRipple(document);
    const div = document.createElement('div');
    document.body.appendChild(div);
    div.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(document.querySelector('.ripple')).toBeNull();
  });
});

describe('kinetic title', () => {
  it('splits characters while exposing one readable label', async () => {
    const { kineticTitle } = await import('../src/ui/motion');
    const h1 = document.createElement('h1');
    h1.className = 'screen__title';
    h1.innerHTML = 'FORGE <em>DECK</em>';
    document.body.appendChild(h1);
    kineticTitle(h1);
    expect(h1.querySelectorAll('.kchar').length).toBe(9); // letters only, spaces kept as text
    expect(h1.getAttribute('aria-label')).toBe('FORGE DECK');
    expect(h1.dataset.kinetic).toBe('1');

    // Second call is a no-op, so re-entering a screen cannot double-wrap.
    const before = h1.innerHTML;
    kineticTitle(h1);
    expect(h1.innerHTML).toBe(before);
  });
});

describe('spark burst', () => {
  it('creates a single fx canvas and never throws', async () => {
    const { burst } = await import('../src/ui/motion');
    burst(40, 40, 12);
    burst(80, 80, 8);
    expect(document.querySelectorAll('#fx-layer').length).toBe(1);
    await sleep(40);
  });

  it('does nothing when Reduce Motion is on', async () => {
    const { burst } = await import('../src/ui/motion');
    store.patchSettings({ reduceMotion: true });
    burst(10, 10, 8);
    expect(document.querySelector('#fx-layer')).toBeNull();
  });
});

describe('reduced motion resolver', () => {
  it('follows the in-app switch', async () => {
    const { prefersReduced } = await import('../src/ui/motion');
    store.patchSettings({ reduceMotion: false });
    expect(prefersReduced()).toBe(false);
    store.patchSettings({ reduceMotion: true });
    expect(prefersReduced()).toBe(true);
  });
});

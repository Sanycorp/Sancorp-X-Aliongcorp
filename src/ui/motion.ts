import { store } from '../state/store';

/**
 * Motion toolkit.
 *
 * Everything here is opt-out twice: the user's Reduce Motion switch and the
 * operating system's `prefers-reduced-motion` both turn these helpers into
 * instant, final state changes. Nothing loops forever, so tablets stay cool.
 */

export function prefersReduced(): boolean {
  if (store.settings.reduceMotion) return true;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function raf(fn: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
  return setTimeout(() => fn(performance.now()), 16) as unknown as number;
}

function cancel(id: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
}

export const EASE = {
  out: (t: number): number => 1 - Math.pow(1 - t, 3),
  inOut: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: (t: number): number => 1 - Math.pow(1 - t, 5),
  spring: (t: number): number => {
    const c = 1.70158 + 1.2;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
};

export interface TweenOptions {
  duration?: number;
  ease?: (t: number) => number;
  onDone?: () => void;
}

/** Frame-driven value tween. Returns a cancel function. */
export function tween(
  from: number,
  to: number,
  onUpdate: (value: number, progress: number) => void,
  opts: TweenOptions = {},
): () => void {
  if (prefersReduced() || from === to) {
    onUpdate(to, 1);
    opts.onDone?.();
    return () => undefined;
  }
  const duration = Math.max(1, opts.duration ?? 520);
  const ease = opts.ease ?? EASE.out;
  // rAF timestamps and performance.now() can use different clocks (and jsdom
  // does), so the first frame anchors the timeline instead of trusting `start`.
  let start = -1;
  let cancelled = false;
  let handle = 0;

  const step = (now: number): void => {
    if (cancelled) return;
    if (start < 0) start = now;
    const raw = (now - start) / duration;
    const t = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
    onUpdate(from + (to - from) * ease(t), t);
    if (t < 1) handle = raf(step);
    else opts.onDone?.();
  };
  handle = raf(step);

  return () => {
    cancelled = true;
    cancel(handle);
  };
}

const valueCache = new WeakMap<HTMLElement, { current: number; cancel: () => void }>();

/**
 * Tweens a number inside an element. Repeated calls retarget smoothly from the
 * value currently on screen instead of snapping back to zero.
 */
export function animateValue(
  node: HTMLElement,
  to: number,
  format: (v: number) => string,
  opts: TweenOptions = {},
): void {
  if (!Number.isFinite(to)) {
    node.textContent = format(to);
    return;
  }
  const cached = valueCache.get(node);
  const from = cached?.current ?? 0;
  cached?.cancel();

  if (prefersReduced() || Math.abs(to - from) < 0.05) {
    node.textContent = format(to);
    valueCache.set(node, { current: to, cancel: () => undefined });
    return;
  }

  const cancelFn = tween(
    from,
    to,
    (v) => {
      node.textContent = format(v);
    },
    {
      ...opts,
      onDone: () => {
        node.textContent = format(to);
        valueCache.set(node, { current: to, cancel: () => undefined });
        opts.onDone?.();
      },
    },
  );
  valueCache.set(node, { current: from, cancel: cancelFn });
}

/**
 * Mecha text decode: characters resolve from a random glyph set into the real
 * string. Screen readers always get the final text through aria-label.
 */
export function scramble(node: HTMLElement, text: string, duration = 620): void {
  node.setAttribute('aria-label', text);
  if (prefersReduced()) {
    node.textContent = text;
    return;
  }
  const glyphs = '▚▞░▒█<>/\\[]{}#*+=ΞΔΣ0123456789ABCDEF';
  const total = Math.max(6, Math.round(duration / 34));
  let frame = 0;
  const id = setInterval(() => {
    frame += 1;
    const settled = Math.floor((frame / total) * text.length);
    let out = text.slice(0, settled);
    for (let i = settled; i < text.length; i++) {
      out += text[i] === ' ' ? ' ' : glyphs[Math.floor(Math.random() * glyphs.length)];
    }
    node.textContent = out;
    if (frame >= total) {
      clearInterval(id);
      node.textContent = text;
    }
  }, 34);
}

// ---------------------------------------------------------------------------
// Pointer effects
// ---------------------------------------------------------------------------

const RIPPLE_SELECTOR =
  '.btn, .preset-chip, .preset-card, .dock__btn, .nav__btn, .segment button, .icon-btn, .ab-slot, .forge, .toggle, .nav__btn';

/** Delegated tap ripple. One listener for the whole app. */
export function installRipple(root: Document | HTMLElement = document): void {
  root.addEventListener(
    'pointerdown',
    (ev) => {
      if (prefersReduced()) return;
      const pe = ev as PointerEvent;
      const target = pe.target as HTMLElement | null;
      const host = target?.closest<HTMLElement>(RIPPLE_SELECTOR);
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.9;
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${pe.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${pe.clientY - rect.top - size / 2}px`;
      host.appendChild(ripple);
      setTimeout(() => ripple.remove(), 620);
    },
    { passive: true },
  );
}

const MAGNET_SELECTOR = '.forge, .dock__btn, .btn--primary';

/** Buttons lean toward the pointer, a few pixels, with a spring back. */
export function installMagnets(root: ParentNode = document): () => void {
  if (typeof window.matchMedia === 'function') {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fine.matches) return () => undefined;
  }
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(MAGNET_SELECTOR));
  const cleanups: (() => void)[] = [];

  for (const node of nodes) {
    let frame = 0;
    const move = (ev: PointerEvent): void => {
      if (prefersReduced()) return;
      const rect = node.getBoundingClientRect();
      const dx = ((ev.clientX - rect.left) / rect.width - 0.5) * 10;
      const dy = ((ev.clientY - rect.top) / rect.height - 0.5) * 8;
      cancel(frame);
      frame = raf(() => {
        node.style.setProperty('--mag-x', `${dx.toFixed(2)}px`);
        node.style.setProperty('--mag-y', `${dy.toFixed(2)}px`);
        node.classList.add('is-magnetic');
      });
    };
    const leave = (): void => {
      cancel(frame);
      node.style.setProperty('--mag-x', '0px');
      node.style.setProperty('--mag-y', '0px');
      node.classList.remove('is-magnetic');
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerleave', leave);
    cleanups.push(() => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerleave', leave);
      leave();
    });
  }
  return () => cleanups.forEach((fn) => fn());
}

/** Card tilt + pointer spotlight, desktop only. */
export function installTilt(root: ParentNode = document): () => void {
  if (typeof window.matchMedia === 'function') {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fine.matches) return () => undefined;
  }
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.preset-card, .plate'));
  const cleanups: (() => void)[] = [];

  for (const node of nodes) {
    const move = (ev: PointerEvent): void => {
      if (prefersReduced()) return;
      const rect = node.getBoundingClientRect();
      const px = (ev.clientX - rect.left) / rect.width;
      const py = (ev.clientY - rect.top) / rect.height;
      node.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      node.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      if (node.classList.contains('preset-card')) {
        node.style.setProperty('--tilt-y', `${((px - 0.5) * 6).toFixed(2)}deg`);
        node.style.setProperty('--tilt-x', `${((0.5 - py) * 5).toFixed(2)}deg`);
      }
    };
    const leave = (): void => {
      node.style.setProperty('--tilt-y', '0deg');
      node.style.setProperty('--tilt-x', '0deg');
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerleave', leave);
    cleanups.push(() => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerleave', leave);
      leave();
    });
  }
  return () => cleanups.forEach((fn) => fn());
}

// ---------------------------------------------------------------------------
// Confetti / sparks
// ---------------------------------------------------------------------------

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  spin: number;
  angle: number;
}

let fxCanvas: HTMLCanvasElement | null = null;
let fxContext: CanvasRenderingContext2D | null = null;
let sparks: Spark[] = [];
let fxRunning = false;

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (fxCanvas && fxContext) return fxContext;
  if (typeof document === 'undefined') return null;
  fxCanvas = document.createElement('canvas');
  fxCanvas.id = 'fx-layer';
  fxCanvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fxCanvas);
  fxContext = fxCanvas.getContext('2d');
  return fxContext;
}

/** Short mecha spark burst — cobalt / crimson / white shards. */
export function burst(x: number, y: number, amount = 34): void {
  if (prefersReduced()) return;
  const ctx = ensureCanvas();
  if (!ctx || !fxCanvas) return;
  const colors = ['#0b4fd6', '#d91e2b', '#e8ecf3', '#e89b12', '#3d7bff'];

  for (let i = 0; i < amount; i++) {
    const angle = (Math.PI * 2 * i) / amount + Math.random() * 0.5;
    const speed = 2.2 + Math.random() * 6.4;
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.4,
      life: 0,
      maxLife: 46 + Math.random() * 34,
      size: 2 + Math.random() * 4,
      color: colors[i % colors.length],
      spin: (Math.random() - 0.5) * 0.4,
      angle: Math.random() * Math.PI,
    });
  }
  if (!fxRunning) {
    fxRunning = true;
    raf(fxLoop);
  }
}

function fxLoop(): void {
  const ctx = fxContext;
  const canvas = fxCanvas;
  if (!ctx || !canvas) {
    fxRunning = false;
    return;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  sparks = sparks.filter((s) => s.life < s.maxLife && s.y < h + 60);
  for (const s of sparks) {
    s.life += 1;
    s.vy += 0.34;
    s.vx *= 0.985;
    s.x += s.vx;
    s.y += s.vy;
    s.angle += s.spin;
    const fade = 1 - s.life / s.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillStyle = s.color;
    ctx.fillRect(-s.size / 2, -s.size / 2, s.size, s.size * 1.8);
    ctx.restore();
  }

  if (sparks.length > 0) {
    raf(fxLoop);
  } else {
    ctx.clearRect(0, 0, w, h);
    fxRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Scroll chrome
// ---------------------------------------------------------------------------

/** Thin progress bar under the header + compact header on scroll. */
export function installScrollChrome(header: HTMLElement): () => void {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<i></i>';
  header.appendChild(bar);
  const fill = bar.firstElementChild as HTMLElement;

  let ticking = false;
  const update = (): void => {
    ticking = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    fill.style.transform = `scaleX(${ratio.toFixed(4)})`;
    header.classList.toggle('is-compact', window.scrollY > 16);
    document.documentElement.style.setProperty('--scroll-y', String(Math.round(window.scrollY)));
  };
  const onScroll = (): void => {
    if (ticking) return;
    ticking = true;
    raf(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();

  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    bar.remove();
  };
}

/**
 * Sliding highlight inside the tab bar (FLIP-style), replacing per-button bars.
 */
export function installNavPulse(nav: HTMLElement): { move(index: number): void } {
  const pulse = document.createElement('span');
  pulse.className = 'nav__pulse';
  pulse.setAttribute('aria-hidden', 'true');
  nav.appendChild(pulse);

  const move = (index: number): void => {
    const buttons = nav.querySelectorAll<HTMLElement>('.nav__btn');
    const btn = buttons[index];
    if (!btn) return;
    const navRect = nav.getBoundingClientRect();
    const rect = btn.getBoundingClientRect();
    pulse.style.width = `${rect.width * 0.52}px`;
    pulse.style.transform = `translate3d(${rect.left - navRect.left + rect.width * 0.24}px, 0, 0)`;
    pulse.classList.add('is-in');
  };

  return { move };
}

/**
 * Splits a heading into per-character spans that rise into place.
 * The heading keeps an aria-label so assistive tech reads it once.
 */
export function kineticTitle(node: HTMLElement): void {
  if (prefersReduced()) return;
  if (node.dataset.kinetic === '1') return;
  node.dataset.kinetic = '1';
  const label = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
  node.setAttribute('aria-label', label);

  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    if (n.textContent && n.textContent.trim().length > 0) textNodes.push(n);
  }

  let index = 0;
  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    const frag = document.createDocumentFragment();
    for (const ch of text) {
      if (ch === ' ') {
        frag.appendChild(document.createTextNode(' '));
        continue;
      }
      const span = document.createElement('span');
      span.className = 'kchar';
      span.textContent = ch;
      span.style.setProperty('--i', String(index));
      span.setAttribute('aria-hidden', 'true');
      frag.appendChild(span);
      index += 1;
    }
    textNode.replaceWith(frag);
  }
  node.classList.add('is-kinetic');
}

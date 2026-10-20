import './styles/base.css';
import './styles/primitives.css';
import './styles/controls.css';
import './styles/app.css';
import './styles/motion.css';
import './styles/account.css';
import './styles/rating.css';
import './styles/control.css';

import { store } from './state/store';
import { resolveFinish } from './model/settings';
import type { AppSettings, EditSettings } from './model/settings';
import { formatAllowed, isPro, targetAllowed } from './model/tiers';
import { Haptics } from './ui/haptics';
import { createDeck } from './ui/screens/deck';
import { createLab } from './ui/screens/lab';
import { createArsenal } from './ui/screens/arsenal';
import { createSystem, APP_VERSION } from './ui/screens/system';
import { createControl } from './ui/screens/control';
import { accountButton } from './ui/account';
import { session } from './state/session';
import { icon, el, toast } from './ui/elements';
import { brandMark } from './ui/brand';
import { isNativeApp } from './security/platform';
import {
  installMagnets,
  installNavPulse,
  installRipple,
  installScrollChrome,
  installTilt,
  kineticTitle,
} from './ui/motion';
import type { Screen } from './ui/screens/deck';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

type RouteId = 'deck' | 'lab' | 'arsenal' | 'system' | 'control';

const ROUTES: { id: RouteId; label: string; icon: 'deck' | 'lab' | 'arsenal' | 'system' }[] = [
  { id: 'deck', label: 'DECK', icon: 'deck' },
  { id: 'lab', label: 'LAB', icon: 'lab' },
  { id: 'arsenal', label: 'ARSENAL', icon: 'arsenal' },
  { id: 'system', label: 'SYSTEM', icon: 'system' },
];

/** Operator console: reachable by hash only, never rendered into the tab bar. */
const HIDDEN_ROUTES: RouteId[] = ['control'];

const ALL_ROUTE_IDS: RouteId[] = [...ROUTES.map((r) => r.id), ...HIDDEN_ROUTES];

function boot(): void {
  store.restore();

  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');

  const screens: Record<RouteId, Screen> = {
    deck: createDeck(),
    lab: createLab(),
    arsenal: createArsenal(),
    system: createSystem(),
    control: createControl(),
  };

  const navButtons = ROUTES.map((route) =>
    el(
      'button',
      {
        class: 'nav__btn',
        id: `nav-${route.id}`,
        attrs: {
          type: 'button',
          role: 'tab',
          'aria-selected': 'false',
          'aria-controls': `screen-${route.id}`,
          'aria-label': route.label,
          title: route.label,
          'data-route': route.id,
        },
        on: {
          click: () => {
            if (location.hash === `#/${route.id}`) return;
            location.hash = `#/${route.id}`;
            Haptics.tap();
          },
        },
      },
      icon(route.icon, 19),
      el('span', { class: 'nav__label', text: route.label }),
    ),
  );

  const mark = brandMark(30);
  const brandName = el('div', { class: 'brand__name', text: 'SANAYACORP' });
  const brandSub = el('div', { class: 'brand__sub', html: `AEGIS MUSIC <b>${APP_VERSION}</b>` });
  const headerStatus = el('span', { class: 'chip chip--live' }, el('b', { text: 'READY' }));
  const starBtn = el(
    'button',
    {
      class: 'chip finish-chip',
      style: 'cursor:pointer',
      attrs: { type: 'button', title: 'Ganti finish' },
      on: {
        click: () => {
          const next =
            store.settings.finish === 'auto'
              ? 'armor'
              : store.settings.finish === 'armor'
                ? 'cockpit'
                : 'auto';
          store.patchSettings({ finish: next });
          Haptics.tap();
        },
      },
    },
    el('span', { text: 'FINISH' }),
    el('b', { text: store.settings.finish.toUpperCase() }),
  );

  const header = el(
    'header',
    { class: 'app-header' },
    el('div', { class: 'brand' }, mark, el('div', { class: 'brand__text' }, brandName, brandSub)),
    el('div', { class: 'header__meta' }, headerStatus, accountButton(), starBtn),
  );

  const aurora = el('div', { class: 'aurora', attrs: { 'aria-hidden': 'true' } }, el('i'), el('i'));
  const shell = el('div', { class: 'shell' }, aurora, header);
  const main = el('main', { style: 'flex:1;display:flex;flex-direction:column;position:relative;z-index:1' });
  for (const route of [...ROUTES, ...HIDDEN_ROUTES.map((id) => ({ id }))]) {
    const node = screens[route.id].el;
    node.setAttribute('role', 'tabpanel');
    node.setAttribute('aria-labelledby', `nav-${route.id}`);
    main.appendChild(node);
  }
  main.id = 'main-content';
  main.tabIndex = -1;
  shell.appendChild(main);
  for (const route of [...ROUTES, ...HIDDEN_ROUTES.map((id) => ({ id }))]) {
    const overlay = screens[route.id].overlay;
    if (overlay) shell.appendChild(overlay);
  }

  const nav = el('nav', { class: 'nav', attrs: { role: 'tablist', 'aria-label': 'Navigasi utama' } }, navButtons);
  const skipLink = el('a', {
    class: 'skip-link',
    text: 'LEWATI KE KONTEN',
    attrs: { href: '#main-content' },
    on: {
      click: (ev) => {
        ev.preventDefault();
        main.focus();
        main.scrollIntoView({ block: 'start' });
      },
    },
  });
  const routeAnnouncer = el('div', {
    class: 'sr-only',
    attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
  });

  app.replaceChildren(skipLink, shell, nav, routeAnnouncer, el('div', { id: 'toast-host' }));

  // ------------------------------------------------------------------ motion
  document.documentElement.dataset.platform = isNativeApp() ? 'app' : 'web';

  const scrollMotion =
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
      ? CSS.supports('animation-timeline: view()')
      : false;
  if (scrollMotion) document.documentElement.dataset.scrollMotion = '1';

  const navPulse = installNavPulse(nav);
  installRipple(document);
  installScrollChrome(header);
  // Pointer-only effects, attached once; they no-op on touch devices.
  requestAnimationFrame(() => {
    installMagnets(document);
    installTilt(document);
  });

  const kineticDone = new Set<RouteId>();

  // ------------------------------------------------------------------ theme
  let resolvedFinish = resolveFinish(store.settings.finish);

  const applyTheme = (): void => {
    resolvedFinish = resolveFinish(store.settings.finish);
    document.documentElement.dataset.finish = resolvedFinish;
    document.documentElement.dataset.finishMode = store.settings.finish;
    document.documentElement.dataset.motion = store.settings.reduceMotion ? 'reduced' : 'full';
    starBtn.querySelector('b')!.textContent = store.settings.finish.toUpperCase();
    starBtn.title =
      store.settings.finish === 'auto'
        ? `Auto — mengikuti sistem (sekarang ${resolvedFinish})`
        : `Finish ${resolvedFinish}`;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolvedFinish === 'armor' ? '#e8ecf3' : '#070a0f');
    void syncStatusBar();
  };

  // Follow the OS theme live while the user keeps `auto`.
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', () => {
      if (store.settings.finish === 'auto') applyTheme();
    });
  }

  async function syncStatusBar(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await StatusBar.setStyle({ style: resolvedFinish === 'armor' ? Style.Light : Style.Dark });
      await StatusBar.setBackgroundColor({
        color: resolvedFinish === 'armor' ? '#e8ecf3' : '#070a0f',
      });
    } catch {
      // StatusBar is optional on some devices
    }
  }

  // ------------------------------------------------------------------ router
  let activeRoute: RouteId = 'deck';

  const commitRoute = (id: RouteId): void => {
    activeRoute = id;
    for (const route of ALL_ROUTE_IDS) {
      const screen = screens[route];
      screen.el.classList.toggle('is-active', route === id);
      if (route === id) {
        screen.el.removeAttribute('aria-hidden');
        screen.onEnter?.();
      } else {
        screen.el.setAttribute('aria-hidden', 'true');
      }
    }
    for (const btn of navButtons) {
      btn.setAttribute('aria-selected', String(btn.dataset.route === id));
    }
    document.documentElement.dataset.route = id;
    document.title = `AEGIS MUSIC · ${id.toUpperCase()}`;
    routeAnnouncer.textContent = `Layar ${ROUTES.find((r) => r.id === id)?.label ?? 'Kontrol'}`;
    const navIndex = ROUTES.findIndex((r) => r.id === id);
    if (navIndex >= 0) navPulse.move(navIndex);
    else navPulse.hide();
    if (!kineticDone.has(id)) {
      kineticDone.add(id);
      const title = screens[id].el.querySelector<HTMLElement>('.screen__title');
      if (title) kineticTitle(title);
    }
    // Re-attach pointer effects to controls created on this screen.
    const activeScreen = screens[id].el;
    installMagnets(activeScreen);
    installTilt(activeScreen);
    window.scrollTo({ top: 0, behavior: 'auto' });
    revealVisible();
  };

  const setRoute = (id: RouteId, animate = true): void => {
    const reduce = store.settings.reduceMotion;
    const vt = (
      document as unknown as {
        startViewTransition?: (cb: () => void) => { finished: Promise<void> };
      }
    ).startViewTransition;
    if (animate && !reduce && typeof vt === 'function') {
      document.documentElement.dataset.vt = '1';
      const transition = vt.call(document, () => commitRoute(id));
      void transition.finished.finally(() => {
        delete document.documentElement.dataset.vt;
      });
    } else {
      commitRoute(id);
    }
  };

  const parseHash = (): RouteId => {
    const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
    if (!raw) return activeRoute;
    const found = ALL_ROUTE_IDS.find((r) => r === raw);
    // Unknown hashes (skip links, deep links from older versions) keep the
    // current screen instead of yanking the user back to the deck.
    return found ?? activeRoute;
  };

  nav.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    ev.preventDefault();
    const index = ROUTES.findIndex((r) => r.id === activeRoute);
    const next = (index + (ev.key === 'ArrowRight' ? 1 : ROUTES.length - 1)) % ROUTES.length;
    location.hash = `#/${ROUTES[next].id}`;
    navButtons[next].focus();
    Haptics.tap();
  });

  window.addEventListener('hashchange', () => setRoute(parseHash()));
  setRoute(parseHash(), false);

  // ------------------------------------------------------------------ state → UI
  store.subscribe(() => {
    applyTheme();

    const busy = store.status.active;
    headerStatus.className = `chip ${busy ? '' : 'chip--live'}`;
    headerStatus.replaceChildren();
    const chipText = busy ? store.status.stage : 'READY';
    const chipLabel = el('b', { text: chipText });
    if (headerStatus.textContent !== chipText) chipLabel.classList.add('chip-flip');
    headerStatus.append(chipLabel);
    if (busy) headerStatus.style.borderColor = 'var(--cobalt)';
    else headerStatus.style.borderColor = '';
  });

  // ------------------------------------------------------------------ session
  /**
   * A downgrade has to close the doors the previous tier opened. Stored edits
   * and settings survive a sign-out, so the paid engines are switched off here
   * rather than trusted to the UI.
   */
  const applyTierLimits = (): void => {
    if (isPro(session.tier)) return;
    const edit: Partial<EditSettings> = {};
    if (store.edit.spatial8d) edit.spatial8d = false;
    if (store.edit.denoise) edit.denoise = false;
    if (store.edit.voiceMode) edit.voiceMode = false;
    if (Object.keys(edit).length > 0) store.patchEdit(edit);

    const settings: Partial<AppSettings> = {};
    if (!formatAllowed('free', store.settings.format)) settings.format = 'mp3';
    if (!targetAllowed('free', store.settings.target)) settings.target = 'streaming';
    if (Object.keys(settings).length > 0) store.patchSettings(settings);
  };

  let enforced = false;
  const onSession = (): void => {
    if (session.state.status === 'loading') return;
    // Only the server may take features away. If the check itself failed we
    // leave the user's stored chain untouched instead of silently rewriting
    // their settings on a flaky connection.
    if (session.state.status === 'ready') applyTierLimits();
    if (!enforced) {
      enforced = true;
      if (session.state.status === 'offline' && session.state.tier === 'free') {
        // No functions (static host / offline install): say so once, calmly.
        console.info('[aegis] mode offline — tier FREE');
      }
    }
  };
  session.subscribe(onSession);
  onSession();
  void session.refresh();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const stale = !session.state.exp || session.state.exp - Date.now() < 86_400_000;
    if (stale) void session.refresh();
  });
  applyTheme();

  // ------------------------------------------------------------------ engine warm-up banner
  if (!store.source) {
    setTimeout(() => {
      if (!store.source) {
        toast('Muat satu lagu untuk mulai. Semua proses tetap offline.', 'info', 4200);
      }
    }, 1200);
  }

  // ------------------------------------------------------------------ shortcuts
  window.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    switch (ev.key) {
      case ' ':
        ev.preventDefault();
        (screens.deck.el.querySelector('.play-btn') as HTMLButtonElement | null)?.click();
        break;
      case '1':
        setRoute('deck');
        break;
      case '2':
        setRoute('lab');
        break;
      case '3':
        setRoute('arsenal');
        break;
      case '4':
        setRoute('system');
        break;
      case 'f':
      case 'F':
        (screens.deck.el.querySelector('.forge') as HTMLButtonElement | null)?.click();
        break;
      default:
        break;
    }
  });

  // ------------------------------------------------------------------ reveal on scroll
  setupReveal();
  revealVisible();

  window.addEventListener(
    'resize',
    () => {
      navPulse.move(ROUTES.findIndex((r) => r.id === activeRoute));
    },
    { passive: true },
  );

  // ------------------------------------------------------------------ swipe between screens
  let touchStart: { x: number; y: number; at: number; ignore: boolean } | null = null;

  window.addEventListener(
    'touchstart',
    (ev) => {
      const t = ev.touches[0];
      if (!t) return;
      const target = ev.target as HTMLElement | null;
      const ignore = !!target?.closest(
        'input, textarea, select, canvas, .rail, .wave, .transport, .nav, .dock, .segment',
      );
      touchStart = { x: t.clientX, y: t.clientY, at: performance.now(), ignore };
    },
    { passive: true },
  );

  window.addEventListener(
    'touchend',
    (ev) => {
      const start = touchStart;
      touchStart = null;
      if (!start || start.ignore) return;
      const t = ev.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const dt = performance.now() - start.at;
      if (dt > 650 || Math.abs(dx) < 64 || Math.abs(dy) > 52) return;
      const index = ROUTES.findIndex((r) => r.id === activeRoute);
      const next = dx < 0 ? index + 1 : index - 1;
      if (next < 0 || next >= ROUTES.length) return;
      location.hash = `#/${ROUTES[next].id}`;
      Haptics.tap();
    },
    { passive: true },
  );

  // ------------------------------------------------------------------ native shell
  void initNative();

  // ------------------------------------------------------------------ pwa
  registerServiceWorker();

  // drop guard: never let the browser navigate away from a dropped file
  window.addEventListener('dragover', (ev) => ev.preventDefault());
  window.addEventListener('drop', (ev) => ev.preventDefault());

  // dismiss the boot splash once the shell is on screen
  const splash = document.getElementById('boot');
  if (splash) {
    requestAnimationFrame(() => {
      splash.classList.add('is-gone');
      setTimeout(() => splash.remove(), 520);
    });
  }
}

let revealIO: IntersectionObserver | null = null;

/** Scroll-reveal for plates and cards; degrades to "always visible". */
function setupReveal(): void {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('.screen .plate, .preset-card, .ab-slot'),
  );
  if (typeof IntersectionObserver === 'undefined') {
    nodes.forEach((n) => n.classList.add('reveal', 'is-in'));
    return;
  }
  revealIO = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        revealIO?.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.03 },
  );
  nodes.forEach((node) => {
    node.classList.add('reveal');
    revealIO!.observe(node);
  });
}

/** Paints the first visible cards immediately so the first frame is never blank. */
function revealVisible(): void {
  const active = document.querySelector('.screen.is-active');
  if (!active) return;
  const pending = active.querySelectorAll<HTMLElement>('.reveal:not(.is-in)');
  pending.forEach((node, i) => {
    if (i < 3) node.classList.add('is-in');
  });
}

async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      if (location.hash && location.hash !== '#/deck') {
        location.hash = '#/deck';
      } else {
        void App.exitApp();
      }
    });
  } catch {
    // plugin missing on web
  }
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  // The Android build ships its assets inside the APK; a service worker there
  // would only add a stale-cache failure mode. Web-only on purpose.
  if (isNativeApp()) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && !Capacitor.isNativePlatform()) {
    // Vite preview over http still works; skip only for plain file://
    if (location.protocol === 'file:') return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // A failed SW registration must never block the app.
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

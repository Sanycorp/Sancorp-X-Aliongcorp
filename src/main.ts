import './styles/base.css';
import './styles/primitives.css';
import './styles/controls.css';
import './styles/app.css';
import './styles/motion.css';
import './styles/account.css';
import './styles/rating.css';
import './styles/control.css';
import './styles/adaptive.css';
import './styles/landing.css';

import { store } from './state/store';
import { resolveFinish } from './model/settings';
import { Haptics } from './ui/haptics';
import { createDeck } from './ui/screens/deck';
import { createLab } from './ui/screens/lab';
import { createArsenal } from './ui/screens/arsenal';
import { createSystem, APP_VERSION } from './ui/screens/system';
import { createControl } from './ui/screens/control';
import { createHome, sectionNav } from './ui/screens/home';
import { accountButton } from './ui/account';
import { standalone, watchInstall } from './ui/install';
import { session } from './state/session';
import { icon, el, toast } from './ui/elements';
import { brandMark } from './ui/brand';
import { closeGate, gateOpen, openGate, readRedirect } from './ui/gate';
import { bootPlatform } from './model/platform';
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

type RouteId = 'home' | 'deck' | 'lab' | 'arsenal' | 'system' | 'control';

/** Routes a visitor may see without an account. */
const PUBLIC_ROUTES = new Set<RouteId>(['home', 'control']);

/** Page titles. The landing is the product sentence, not the route id. */
const TITLES: Record<RouteId, string> = {
  home: 'Aegis Sound Lab — rantai mastering di perangkatmu',
  deck: 'Aegis Sound Lab · Render',
  lab: 'Aegis Sound Lab · Tuning',
  arsenal: 'Aegis Sound Lab · Arsenal',
  system: 'Aegis Sound Lab · Sistem',
  control: 'Aegis Sound Lab · Konsol Operator',
};

type NavRoute = { id: RouteId; label: string; icon: 'home' | 'deck' | 'lab' | 'arsenal' | 'system' };

const STUDIO_ROUTES: NavRoute[] = [
  { id: 'deck', label: 'RENDER', icon: 'deck' },
  { id: 'lab', label: 'TUNING', icon: 'lab' },
  { id: 'arsenal', label: 'ARSENAL', icon: 'arsenal' },
  { id: 'system', label: 'SISTEM', icon: 'system' },
];

/**
 * The tab bar. The installed app is a music tool, so it has no storefront tab —
 * no price, no Telegram pitch, nothing to buy while working. The web build
 * keeps BERANDA first because that is where a visitor decides.
 */
const ROUTES: NavRoute[] = isNativeApp()
  ? STUDIO_ROUTES
  : [{ id: 'home', label: 'BERANDA', icon: 'home' }, ...STUDIO_ROUTES];

/**
 * Operator console: reachable by hash only, never rendered into the tab bar.
 * The front page is a normal route now — it has a tab like everything else, it
 * is just outside the gate.
 */
const HIDDEN_ROUTES: RouteId[] = ['control'];

const ALL_ROUTE_IDS: RouteId[] = [...ROUTES.map((r) => r.id), ...HIDDEN_ROUTES];

function boot(): void {
  store.restore();
  // OS, form factor, engine and capability flags land on <html> before a single
  // screen is built, so the first paint already has the right layout.
  const platform = bootPlatform();
  const lite = platform.perf === 'lite';

  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');

  const screens: Record<RouteId, Screen> = {
    home: createHome() as unknown as Screen,
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
  const brandName = el('div', { class: 'brand__name', text: 'AEGIS SOUND LAB' });
  const brandSub = el('div', { class: 'brand__sub', html: `SANAYACORP <b>${APP_VERSION}</b>` });
  const headerStatus = el('span', { class: 'chip chip--live' }, el('b', { text: 'DI PERANGKAT' }));
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

  // The seal is the way back to the front page from anywhere in the studio.
  const brand = el(
    'button',
    {
      class: 'brand',
      attrs: { type: 'button', 'aria-label': 'Kembali ke beranda' },
      on: {
        click: () => {
          if (location.hash === '#/home') window.scrollTo({ top: 0, behavior: 'smooth' });
          else location.hash = '#/home';
        },
      },
    },
    mark,
    el('div', { class: 'brand__text' }, brandName, brandSub),
  );

  // One header for the whole site: same seal, same status, same account door,
  // whether you are reading the price or rendering a file. The section links
  // only exist on the front page; the tab bar is the studio's navigation.
  const header = el(
    'header',
    { class: 'app-header' },
    brand,
    isNativeApp() ? null : sectionNav(),
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
  document.documentElement.dataset.display = standalone() ? 'standalone' : 'browser';

  const scrollMotion =
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
      ? CSS.supports('animation-timeline: view()')
      : false;
  if (scrollMotion) document.documentElement.dataset.scrollMotion = '1';

  const navPulse = installNavPulse(nav);
  installRipple(document);
  watchInstall();
  installScrollChrome(header);
  // Pointer-only decoration, attached once; it no-ops on touch devices and is
  // skipped entirely on a slow one — the DSP is what has to stay fast.
  if (!lite) {
    requestAnimationFrame(() => {
      installMagnets(document);
      installTilt(document);
    });
  }

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
  // The APK is a music app: it opens on the renderer, not on the storefront or
  // the operator panel. The web build keeps the public front page first.
  let activeRoute: RouteId = isNativeApp() ? 'deck' : 'home';

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
    document.title = TITLES[id] ?? 'Aegis Sound Lab';
    routeAnnouncer.textContent =
      id === 'home' ? 'Beranda' : `Layar ${ROUTES.find((r) => r.id === id)?.label ?? 'Kontrol'}`;
    const navIndex = ROUTES.findIndex((r) => r.id === id);
    if (navIndex >= 0) navPulse.move(navIndex);
    else navPulse.hide();
    if (!kineticDone.has(id) && !lite) {
      kineticDone.add(id);
      const title = screens[id].el.querySelector<HTMLElement>('.screen__title');
      if (title) kineticTitle(title);
    }
    // Re-attach pointer effects to controls created on this screen.
    if (!lite) {
      const activeScreen = screens[id].el;
      installMagnets(activeScreen);
      installTilt(activeScreen);
    }
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

  window.addEventListener('hashchange', () => {
    setRoute(parseHash());
    syncGate();
  });
  setRoute(parseHash(), false);

  // ------------------------------------------------------------------ state → UI
  store.subscribe(() => {
    applyTheme();

    const busy = store.status.active;
    headerStatus.className = `chip ${busy ? '' : 'chip--live'}`;
    headerStatus.replaceChildren();
    const chipText = busy ? store.status.stage : 'DI PERANGKAT';
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
    // One pass over the chain, the delivery decision and both A/B slots. The
    // store owns this now, so nothing can be clamped in one place and missed in
    // another (that is how a free session kept exporting FLAC).
    const changed = store.clampToTier(session.tier);
    if (changed) store.previewReady = false;
    // History is capped by plan as well; a lapse trims it without a reload.
    store.trimHistory();
  };

  /**
   * The account is mandatory. The only exception is the operator console,
   * which carries its own credential and must stay reachable when nobody is
   * signed in — including from a phone that has just been wiped.
   */
  const syncGate = (): void => {
    // The private build has no gate: the owner already holds the APK.
    if (isNativeApp()) {
      closeGate();
      return;
    }
    if (session.state.status === 'loading') return;
    // The front page is public on purpose: you should be able to read what the
    // product is and what it costs before handing over an account. The studio
    // behind it is not.
    if (PUBLIC_ROUTES.has(activeRoute)) {
      closeGate();
      return;
    }
    if (session.signedIn) closeGate();
    else openGate('');
  };

  let enforced = false;
  const onSession = (): void => {
    if (session.state.status === 'loading') return;
    // Only the server may take features away. If the check itself failed we
    // leave the user's stored chain untouched instead of silently rewriting
    // their settings on a flaky connection.
    if (session.state.status === 'ready') applyTierLimits();
    syncGate();
    // The front page is built before the session answers, so its call to action
    // ("MASUK DENGAN GOOGLE") has to be rewritten once the answer arrives.
    screens.home.update();
    screens[activeRoute].update();
    if (!enforced) {
      enforced = true;
      if (session.state.status === 'offline' && !session.signedIn) {
        console.info('[aegis] offline — belum ada sesi tersimpan');
      }
    }
  };
  session.subscribe(onSession);
  onSession();

  // Keep the splash up until the server answers, so a signed-out visitor never
  // sees the deck for a frame before the gate covers it.
  const splash = document.getElementById('boot');
  let splashGone = false;
  const dismissSplash = (): void => {
    if (splashGone) return;
    splashGone = true;
    if (!splash) return;
    requestAnimationFrame(() => {
      splash.classList.add('is-gone');
      setTimeout(() => splash.remove(), 520);
    });
  };
  const answered = session.refresh().then((result) => {
    const redirect = readRedirect();
    if (redirect === 'gagal') toast('Masuk dengan Google gagal. Coba lagi.', 'err', 2600);
    if (redirect === 'ok') {
      toast('Masuk — akun terbaca', 'ok', 2200);
      void session.refresh();
      // They pressed sign-in to get into the studio, not to come back to the pitch.
      location.hash = '#/deck';
    }
    void result;
    syncGate();
  });
  // The landing needs no session to be correct, so it never waits behind the
  // splash. Gated routes do: they must not flash before the gate covers them.
  if (activeRoute === 'home') dismissSplash();
  // A dead function must not hold the splash forever; the gate says the rest.
  void Promise.race([answered, new Promise((r) => setTimeout(r, 2000))]).finally(() => {
    dismissSplash();
    syncGate();
  });
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
    if (gateOpen()) return;
    // Tab navigation only exists inside the studio; on the landing the browser
    // keeps its own shortcuts.
    if (ROUTES.every((r) => r.id !== activeRoute)) return;
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
    // Android back: from the studio, go back to the panel; from the panel, ask
    // before leaving the app. Never drop the owner out mid-render by accident.
    App.addListener('backButton', ({ canGoBack }) => {
      const route = location.hash.replace(/^#\/?/, '');
      // Back always means "up one level" in the studio, never "leave" from a
      // screen where the owner is halfway through a render.
      if (route === 'lab' || route === 'arsenal' || route === 'system') {
        location.hash = '#/deck';
        return;
      }
      if (canGoBack) window.history.back();
      else void App.exitApp();
    });
  } catch {
    // plugin missing on web
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    // The panel paints before this runs; hiding early avoids a black stall.
    await SplashScreen.hide({ fadeOutDuration: 180 });
  } catch {
    // splash plugin is optional
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

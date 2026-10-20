import './styles/base.css';
import './styles/primitives.css';
import './styles/controls.css';
import './styles/app.css';

import { store } from './state/store';
import { Haptics } from './ui/haptics';
import { createDeck } from './ui/screens/deck';
import { createLab } from './ui/screens/lab';
import { createArsenal } from './ui/screens/arsenal';
import { createSystem, APP_VERSION } from './ui/screens/system';
import { icon, el, toast } from './ui/elements';
import type { Screen } from './ui/screens/deck';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

type RouteId = 'deck' | 'lab' | 'arsenal' | 'system';

const ROUTES: { id: RouteId; label: string; icon: 'deck' | 'lab' | 'arsenal' | 'system' }[] = [
  { id: 'deck', label: 'DECK', icon: 'deck' },
  { id: 'lab', label: 'LAB', icon: 'lab' },
  { id: 'arsenal', label: 'ARSENAL', icon: 'arsenal' },
  { id: 'system', label: 'SYSTEM', icon: 'system' },
];

function boot(): void {
  store.restore();

  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');

  const screens: Record<RouteId, Screen> = {
    deck: createDeck(),
    lab: createLab(),
    arsenal: createArsenal(),
    system: createSystem(),
  };

  const navButtons = ROUTES.map((route) =>
    el(
      'button',
      {
        class: 'nav__btn',
        attrs: { type: 'button', role: 'tab', 'aria-selected': 'false', 'data-route': route.id },
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

  const brandMark = el('div', { class: 'brand__mark', html: '<span>E/T</span>' });
  const brandName = el('div', { class: 'brand__name', text: 'EL TZY' });
  const brandSub = el('div', { class: 'brand__sub', html: `AEGIS-M <b>${APP_VERSION}</b>` });
  const headerStatus = el('span', { class: 'chip chip--live' }, el('b', { text: 'READY' }));
  const starBtn = el(
    'button',
    {
      class: 'chip',
      style: 'cursor:pointer',
      attrs: { type: 'button', title: 'Ganti finish' },
      on: {
        click: () => {
          store.patchSettings({ finish: store.settings.finish === 'armor' ? 'cockpit' : 'armor' });
          Haptics.tap();
        },
      },
    },
    el('span', { text: 'FINISH' }),
    el('b', { text: store.settings.finish === 'armor' ? 'ARMOR' : 'COCKPIT' }),
  );

  const header = el(
    'header',
    { class: 'app-header' },
    el('div', { class: 'brand' }, brandMark, el('div', { class: 'brand__text' }, brandName, brandSub)),
    el('div', { class: 'header__meta' }, headerStatus, starBtn),
  );

  const shell = el('div', { class: 'shell' }, header);
  const main = el('main', { style: 'flex:1;display:flex;flex-direction:column;position:relative;z-index:1' });
  for (const route of ROUTES) main.appendChild(screens[route.id].el);
  shell.appendChild(main);

  const nav = el('nav', { class: 'nav', attrs: { role: 'tablist', 'aria-label': 'Navigasi utama' } }, navButtons);
  app.replaceChildren(shell, nav, el('div', { id: 'toast-host' }));

  // ------------------------------------------------------------------ theme
  const applyTheme = (): void => {
    document.documentElement.dataset.finish = store.settings.finish;
    document.documentElement.dataset.motion = store.settings.reduceMotion ? 'reduced' : 'full';
    starBtn.querySelector('b')!.textContent = store.settings.finish === 'armor' ? 'ARMOR' : 'COCKPIT';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', store.settings.finish === 'armor' ? '#e8ecf3' : '#070a0f');
    void syncStatusBar();
  };

  async function syncStatusBar(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await StatusBar.setStyle({ style: store.settings.finish === 'armor' ? Style.Light : Style.Dark });
      await StatusBar.setBackgroundColor({
        color: store.settings.finish === 'armor' ? '#e8ecf3' : '#070a0f',
      });
    } catch {
      // StatusBar is optional on some devices
    }
  }

  // ------------------------------------------------------------------ router
  const setRoute = (id: RouteId, animate = true): void => {
    for (const route of ROUTES) {
      const screen = screens[route.id];
      screen.el.classList.toggle('is-active', route.id === id);
      if (route.id === id) {
        if (animate) {
          screen.el.classList.remove('fade-up');
          void screen.el.offsetWidth;
        }
        screen.onEnter?.();
      }
    }
    for (const btn of navButtons) {
      btn.setAttribute('aria-selected', String(btn.dataset.route === id));
    }
    document.title = `EL TZY AEGIS-M · ${id.toUpperCase()}`;
    window.scrollTo({ top: 0, behavior: store.settings.reduceMotion ? 'auto' : 'smooth' });
  };

  const parseHash = (): RouteId => {
    const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
    const found = ROUTES.find((r) => r.id === raw);
    return found ? found.id : 'deck';
  };

  window.addEventListener('hashchange', () => setRoute(parseHash()));
  setRoute(parseHash(), false);

  // ------------------------------------------------------------------ state → UI
  store.subscribe(() => {
    applyTheme();
    const busy = store.status.active;
    headerStatus.className = `chip ${busy ? '' : 'chip--live'}`;
    headerStatus.innerHTML = '';
    headerStatus.append(el('b', { text: busy ? store.status.stage : 'READY' }));
    if (busy) headerStatus.style.borderColor = 'var(--cobalt)';
    else headerStatus.style.borderColor = '';
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

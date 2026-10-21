/**
 * The sign-in gate.
 *
 * Aegis Sound Lab requires an account: there is no "continue as guest". The
 * gate is therefore a real modal — it cannot be dismissed by clicking outside,
 * by Escape, or by reloading — and the shell behind it is inert until a session
 * exists. The operator console (`#/control`) is the only route that opens
 * without Google, because it has its own credential.
 *
 * Google sign-in is a server redirect (`/api/auth?google=start`), not a script
 * from accounts.google.com: the CSP allows scripts from this origin only, and
 * that is worth more than a one-tap popup.
 *
 * A PRO key is not a second way in. It is a claim the signed-in account makes
 * once inside (AKUN → AKTIFKAN KUNCI), which is what lets the server tie the key
 * to one account and one device.
 */
import { session } from '../state/session';
import { button, el } from './elements';
import { TELEGRAM_HANDLE } from '../model/contact';

const REMEMBER = 'aegis.gate.remember';

let host: HTMLElement | null = null;
let lastReason = '';
let renderedGoogle: boolean | null = null;
let trapBound = false;

function rememberDefault(): boolean {
  try {
    return localStorage.getItem(REMEMBER) !== '0';
  } catch {
    return true;
  }
}

export function gateOpen(): boolean {
  return host !== null;
}

function remove(): void {
  host?.classList.remove('is-open');
  renderedGoogle = null;
  const node = host;
  host = null;
  document.body.classList.remove('gate-open');
  document.getElementById('app')?.removeAttribute('inert');
  window.setTimeout(() => node?.remove(), 200);
}

/** Closes the gate — only after the server has confirmed a session. */
export function closeGate(): void {
  if (!host) return;
  remove();
}

function googleIcon(): HTMLElement {
  // The four-colour G, inline. No external asset, no third-party request.
  return el('span', {
    class: 'gate__g',
    attrs: { 'aria-hidden': 'true' },
    html: `<svg viewBox="0 0 18 18" width="18" height="18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/></svg>`,
  });
}

function trap(container: HTMLElement): void {
  // Bound once per page. Binding on every open would stack one listener per
  // sign-in attempt for as long as the tab lives.
  if (trapBound) return;
  trapBound = true;
  document.addEventListener('keydown', (ev) => {
    if (!host) return;
    // The gate is mandatory: Escape must not dismiss it.
    if (ev.key === 'Escape') {
      ev.preventDefault();
      return;
    }
    if (ev.key !== 'Tab') return;
    const items = Array.from(
      container.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'),
    ).filter((n) => n.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });
}

/**
 * Opens (or refreshes) the gate. Safe to call repeatedly: a second call while
 * it is open only updates the reason line.
 */
export function openGate(reason = ''): void {
  if (host) {
    // Google availability is only known after /api/auth answers. If it changed
    // while the gate was up, rebuild so the button stops being disabled.
    if (renderedGoogle !== session.state.google) {
      remove();
    } else {
      if (reason && reason !== lastReason) {
        lastReason = reason;
        const note = host.querySelector('.gate__reason');
        if (note) note.textContent = reason;
        else host.querySelector('.gate__card')?.prepend(el('p', { class: 'gate__reason', text: reason }));
      }
      return;
    }
  }
  lastReason = reason;
  renderedGoogle = session.state.google;

  let remember = rememberDefault();

  const rememberBox = el('input', {
    class: 'gate__check',
    attrs: { type: 'checkbox', id: 'gate-remember' },
  }) as HTMLInputElement;
  rememberBox.checked = remember;
  rememberBox.addEventListener('change', () => {
    remember = rememberBox.checked;
    try {
      localStorage.setItem(REMEMBER, remember ? '1' : '0');
    } catch {
      /* ignore */
    }
  });

  const google = button('MASUK DENGAN GOOGLE', {
    tone: 'primary',
    block: true,
    onClick: () => {
      session.signInGoogle(remember);
    },
  });
  google.classList.add('gate__google');
  google.prepend(googleIcon());

  const disabled = !session.state.google;
  if (disabled) {
    google.disabled = true;
    google.title = 'Masuk dengan Google belum diaktifkan operator';
  }

  const card = el(
    'div',
    { class: 'gate__card', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gate-title' } },
    el('div', { class: 'gate__kicker', text: 'AEGIS SOUND LAB' }),
    el('h2', { class: 'gate__title', attrs: { id: 'gate-title' }, text: 'MASUK' }),
    el('p', {
      class: 'gate__lede',
      text: 'Aplikasi ini memakai akun Google. Tanpa akun, deck tidak bisa dipakai — ini bukan halaman opsional.',
    }),
    reason ? el('p', { class: 'gate__reason', text: reason }) : null,
    google,
    disabled
      ? el('p', {
          class: 'gate__note',
          text: 'Login Google belum aktif di server ini. Hubungi operator agar GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET dipasang, lalu muat ulang halaman.',
        })
      : null,
    el(
      'label',
      { class: 'gate__remember', attrs: { for: 'gate-remember' } },
      rememberBox,
      el(
        'span',
        {},
        el('b', { text: 'Ingat saya di perangkat ini' }),
        el('small', { text: 'Sesi bertahan 30 hari. Kalau dimatikan, keluar saat browser ditutup.' }),
      ),
    ),
    el('p', {
      class: 'gate__foot',
      text: 'Yang disimpan hanya email dan masa berlaku, di dalam cookie bertanda tangan. Tidak ada kata sandi, tidak ada pelacakan.',
    }),
    el(
      'p',
      { class: 'gate__help' },
      el('span', { text: 'Punya kunci PRO? Masuk dulu, lalu tempel kuncinya di AKUN. ' }),
      el('a', {
        attrs: { href: `https://t.me/${TELEGRAM_HANDLE.replace(/^@/, '')}`, target: '_blank', rel: 'noopener noreferrer' },
        text: 'Butuh bantuan?',
      }),
    ),
    el(
      'p',
      { class: 'gate__help' },
      // The front page is public, so the gate must never be a dead end: a
      // visitor who only wanted to read the price can step back out.
      el(
        'button',
        {
          class: 'gate__back',
          attrs: { type: 'button' },
          text: '← Kembali ke beranda',
          on: {
            click: () => {
              closeGate();
              location.hash = '#/home';
            },
          },
        },
      ),
      el('span', { text: ' · ' }),
      el('a', { attrs: { href: '#/control' }, text: 'Operator: buka konsol' }),
    ),
  );

  const gate = el('div', { class: 'gate' }, card);

  // No click-outside close and no Escape: the gate is the door, not a popup.
  host = gate;
  document.body.appendChild(gate);
  document.body.classList.add('gate-open');
  // The shell behind the gate must not be reachable by keyboard or screen reader.
  document.getElementById('app')?.setAttribute('inert', '');
  trap(card);
  requestAnimationFrame(() => {
    gate.classList.add('is-open');
    (card.querySelector('.gate__google') as HTMLButtonElement | null)?.focus();
  });
}

/** `/?masuk=ok|gagal` comes back from the Google redirect. */
export function readRedirect(): 'ok' | 'gagal' | null {
  if (typeof location === 'undefined') return null;
  const url = new URL(location.href);
  const result = url.searchParams.get('masuk');
  if (!result) return null;
  url.searchParams.delete('masuk');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  return result === 'ok' ? 'ok' : 'gagal';
}

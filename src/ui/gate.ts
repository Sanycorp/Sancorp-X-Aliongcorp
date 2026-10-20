/**
 * First-visit sign-in.
 *
 * One screen, shown once, before the app is used: Google, or a PRO key, or
 * "lanjut tanpa akun". Nothing is mandatory — a free visitor can walk past it —
 * but it is the first thing a new visitor sees, which is where an account
 * belongs.
 *
 * Google sign-in is a server redirect (`/api/auth?google=start`), not a script
 * from accounts.google.com: this app's CSP allows scripts only from its own
 * origin, and that is worth more than a one-tap popup.
 */
import { session } from '../state/session';
import { button, el, toast } from './elements';
import { openAccount } from './account';

const SEEN = 'aegis.gate.seen';
const REMEMBER = 'aegis.gate.remember';

let host: HTMLElement | null = null;

function rememberDefault(): boolean {
  try {
    return localStorage.getItem(REMEMBER) !== '0';
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN, '1');
  } catch {
    /* private mode: the gate simply shows again next visit */
  }
}

export function gateSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === '1';
  } catch {
    return false;
  }
}

function close(): void {
  host?.classList.remove('is-open');
  const node = host;
  host = null;
  window.setTimeout(() => node?.remove(), 220);
}

function googleIcon(): HTMLElement {
  // The four-colour G, inline. No external asset, no third-party request.
  return el('span', {
    class: 'gate__g',
    attrs: { 'aria-hidden': 'true' },
    html: `<svg viewBox="0 0 18 18" width="18" height="18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/></svg>`,
  });
}

export function openGate(): void {
  if (host) return;

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

  const google = button('LANJUT DENGAN GOOGLE', {
    tone: 'primary',
    block: true,
    onClick: () => {
      markSeen();
      session.signInGoogle(remember);
    },
  });
  google.classList.add('gate__google');
  google.prepend(googleIcon());

  if (!session.state.google) {
    google.disabled = true;
    google.title = 'Masuk dengan Google belum diaktifkan operator';
  }

  const gate = el(
    'div',
    { class: 'gate' },
    el(
      'div',
      { class: 'gate__card', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gate-title' } },
      el('div', { class: 'gate__kicker', text: 'SELAMAT DATANG' }),
      el('h2', { class: 'gate__title', attrs: { id: 'gate-title' }, text: 'MASUK' }),
      el('p', {
        class: 'gate__lede',
        text: 'Masuk dengan akun Google supaya PRO melekat di akunmu, bukan di satu perangkat. Tanpa akun pun aplikasinya tetap bisa dipakai.',
      }),
      google,
      session.state.google
        ? null
        : el('p', {
            class: 'gate__note',
            text: 'Google belum aktif di server. Sementara ini masuk dengan kunci PRO di bawah, atau lanjut tanpa akun.',
          }),
      el(
        'label',
        { class: 'gate__remember', attrs: { for: 'gate-remember' } },
        rememberBox,
        el('span', {}, el('b', { text: 'Ingat saya di perangkat ini' }), el('small', { text: 'Sesi bertahan 30 hari. Kalau dimatikan, keluar saat browser ditutup.' })),
      ),
      el(
        'div',
        { class: 'gate__alt' },
        button('PUNYA KUNCI PRO?', {
          tone: 'ghost',
          size: 'sm',
          onClick: () => {
            markSeen();
            close();
            openAccount();
          },
        }),
        button('LANJUT TANPA AKUN', {
          tone: 'ghost',
          size: 'sm',
          onClick: () => {
            markSeen();
            close();
          },
        }),
      ),
      el('p', { class: 'gate__foot', text: 'Tidak ada email yang disimpan di server. Sesi hanya cookie bertanda tangan.' }),
    ),
  );

  gate.addEventListener('click', (ev) => {
    if (ev.target === gate) {
      markSeen();
      close();
    }
  });

  host = gate;
  document.body.appendChild(gate);
  requestAnimationFrame(() => gate.classList.add('is-open'));
}

/** `\/?masuk=ok|gagal` comes back from the Google redirect. */
export function readRedirect(): void {
  if (typeof location === 'undefined') return;
  const url = new URL(location.href);
  const result = url.searchParams.get('masuk');
  if (!result) return;
  url.searchParams.delete('masuk');
  history.replaceState(null, '', url.pathname + url.hash);
  if (result === 'ok') {
    markSeen();
    toast('Masuk — akun terbaca', 'ok', 2200);
  } else {
    toast('Masuk dengan Google gagal. Coba lagi.', 'err', 2600);
  }
}

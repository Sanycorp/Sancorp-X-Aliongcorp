import { append, el, icon, button, toast } from './elements';
import { PLANS, PRO_PASS_DAYS, PRO_PRICE, daysLeft } from '../model/tiers';
import type { Feature, Tier } from '../model/tiers';
import { session } from '../state/session';
import { deviceShort } from '../state/device';
import { Haptics } from './haptics';
import { CONTACT_HANDLE, PURCHASE_NOTE, TELEGRAM_HANDLE, openPurchase, openRenew, orderCode } from '../model/contact';

/**
 * Account sheet + paywall.
 *
 * One overlay, mounted once, opened from the header chip or from any locked
 * control. It owns focus trapping, Escape and the "return to what you were
 * doing" behaviour, so screens never have to know it exists.
 *
 * Signing in is Google, always. A PRO key is a claim an already signed-in
 * account makes on this sheet; the server binds that key to one device and
 * keeps the Google address as the session subject. The cookie is httpOnly and
 * carries only tier, expiry, email, licence serial and device id.
 */

let sheet: HTMLElement | null = null;
let panel: HTMLElement | null = null;
let opener: HTMLElement | null = null;
let lastFeature: Feature | null = null;

const PRICE_DISPLAY = PLANS.pro;

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((n) => !n.hasAttribute('disabled') && n.offsetParent !== null);
}

let hideTimer = 0;
let hideToken = 0;

function close(): void {
  if (!sheet || !panel) return;
  sheet.classList.remove('is-open');
  panel.classList.remove('is-open');
  document.body.classList.remove('sheet-open');
  const restore = opener;
  opener = null;
  // If the sheet is opened again before this fires, `open()` bumps `hideToken`
  // and the stale hide is dropped. Without that, closing and immediately opening
  // a paywall left the new sheet hidden behind an invisible scrim.
  const token = ++hideToken;
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (token !== hideToken) return;
    sheet?.setAttribute('hidden', '');
    restore?.focus?.();
  }, 220);
}

function ensureShell(): { sheet: HTMLElement; panel: HTMLElement } {
  if (sheet && panel) return { sheet, panel };

  panel = el('div', {
    class: 'sheet',
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' },
  });
  sheet = el(
    'div',
    {
      class: 'sheet-scrim',
      attrs: { hidden: '' },
      on: {
        click: (ev) => {
          if (ev.target === sheet) close();
        },
      },
    },
    panel,
  );
  document.body.appendChild(sheet);

  document.addEventListener('keydown', (ev) => {
    if (!sheet?.classList.contains('is-open')) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
      return;
    }
    if (ev.key !== 'Tab' || !panel) return;
    const items = focusables(panel);
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

  return { sheet, panel };
}

function open(trigger?: HTMLElement): void {
  const shell = ensureShell();
  hideToken += 1;
  window.clearTimeout(hideTimer);
  opener = trigger ?? (document.activeElement as HTMLElement | null);
  shell.sheet.removeAttribute('hidden');
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => {
    shell.sheet.classList.add('is-open');
    shell.panel.classList.add('is-open');
    const first = focusables(shell.panel)[0];
    first?.focus();
  });
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function tierBadge(tier: Tier): HTMLElement {
  const plan = PLANS[tier];
  return el(
    'span',
    { class: `tier-badge tier-badge--${tier}` },
    el('i'),
    el('b', { text: plan.label }),
  );
}

function orderLine(): HTMLElement {
  const code = orderCode();
  return el(
    'div',
    { class: 'order-code' },
    el('span', { text: 'KODE PESANAN' }),
    el('b', { text: code }),
    el(
      'button',
      {
        class: 'icon-btn',
        attrs: { type: 'button', 'aria-label': 'Salin kode pesanan' },
        on: {
          click: () => {
            void navigator.clipboard
              ?.writeText(code)
              .then(() => toast('Kode disalin — sertakan saat chat', 'ok', 1600))
              .catch(() => toast('Papan klip ditolak browser', 'err', 1600));
          },
        },
      },
      icon('copy', 14),
    ),
  );
}

function renderSignedIn(host: HTMLElement): void {
  const state = session.state;
  const plan = session.plan;
  const left = daysLeft(state.exp);
  const expires = state.exp
    ? new Date(state.exp).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const total = Math.max(PRO_PASS_DAYS, left ?? PRO_PASS_DAYS);
  const ratio = left === null ? 1 : Math.max(0.02, Math.min(1, left / total));

  append(host, [
    el(
      'div',
      { class: 'sheet__head' },
      el(
        'div',
        {},
        el('div', { class: 'sheet__kicker', text: 'AKUN' }),
        el('h2', { id: 'sheet-title', class: 'sheet__title', text: plan.label }),
      ),
      tierBadge(state.tier),
    ),
    el(
      'div',
      { class: 'account-card' },
      el('div', { class: 'account-card__row' }, el('span', { text: 'Status' }), el('b', { text: plan.tagline })),
      state.email
        ? el('div', { class: 'account-card__row' }, el('span', { text: 'Akun Google' }), el('b', { text: state.email }))
        : null,
      el('div', { class: 'account-card__row' }, el('span', { text: 'Serial' }), el('b', { text: state.subject ?? '—' })),
      el(
        'div',
        { class: 'account-card__row' },
        el('span', { text: 'Perangkat' }),
        el('b', { text: deviceShort() }),
      ),
      el('div', { class: 'account-card__row' }, el('span', { text: 'Berlaku sampai' }), el('b', { text: expires ?? 'tanpa batas' })),
      left !== null
        ? el('div', { class: 'account-card__row' }, el('span', { text: 'Sisa' }), el('b', { text: `${left} hari` }))
        : null,
    ),
    left !== null
      ? el(
          'div',
          { class: `session-meter ${left <= 7 ? 'is-low' : ''}`, attrs: { role: 'presentation' } },
          el('i', { style: `width:${Math.round(ratio * 100)}%` }),
        )
      : null,
    left !== null && left <= 7
      ? el('p', { class: 'sheet__warn', text: `Sisa ${left} hari. Perpanjang sekarang supaya arsenal tidak terkunci.` })
      : null,
    el(
      'ul',
      { class: 'perk-list' },
      ...plan.perks.map((perk) => el('li', {}, el('span', { class: 'perk-check', html: '' }), el('span', { text: perk }))),
    ),
    el(
      'div',
      { class: 'sheet__actions' },
      state.tier === 'admin'
        ? button('BUKA OPS', {
            tone: 'primary',
            block: true,
            icon: 'system',
            onClick: () => {
              close();
              location.hash = '#/control';
            },
          })
        : button(`PERPANJANG — ${PRO_PRICE}`, {
            tone: 'primary',
            block: true,
            icon: 'bolt',
            onClick: () => openRenew(state.subject ?? ''),
          }),
      button('GANTI KUNCI', {
        tone: 'ghost',
        block: true,
        icon: 'reset',
        onClick: () => {
          if (!panel) return;
          panel.replaceChildren();
          renderSignedOut(panel, { switching: true });
          appendClose(panel);
        },
      }),
      button('KELUAR', {
        tone: 'ghost',
        block: true,
        onClick: () => {
          void session.signOut().then(() => {
            close();
            toast('Kamu keluar — kembali ke FREE', 'info', 1800);
          });
        },
      }),
    ),
    el('p', {
      class: 'sheet__note',
      text: `Satu kunci berlaku di satu perangkat. Mau pindah HP? Kirim ID perangkat di atas ke ${CONTACT_HANDLE} supaya ikatannya dilepas.`,
    }),
  ]);
}

/**
 * Two different people land here:
 *  - a visitor with no session, who may only sign in with Google;
 *  - a signed-in FREE account, which is the only place a PRO key can be
 *    redeemed.
 * The key form is deliberately absent in the first case: the server refuses a
 * key without an account, so offering the field would be a dead end.
 */
function renderSignedOut(host: HTMLElement, opts: { switching?: boolean } = {}): void {
  const account = session.signedIn;
  const input = el('input', {
    class: 'input input--key',
    attrs: {
      type: 'text',
      inputmode: 'text',
      autocomplete: 'one-time-code',
      autocapitalize: 'characters',
      spellcheck: 'false',
      placeholder: 'AEGIS-PRO-XXXX-XXXXXXXX-XXXXXX',
      'aria-label': 'Kunci lisensi',
    },
    on: {
      input: () => {
        const caret = input.selectionStart;
        input.value = input.value.toUpperCase();
        if (caret !== null) input.setSelectionRange(caret, caret);
      },
    },
  });

  const error = el('p', { class: 'form-error', attrs: { role: 'alert' } });
  const submit = button('AKTIFKAN', { tone: 'primary', block: true, icon: 'check' });

  const run = async (): Promise<void> => {
    const key = input.value.trim();
    if (!key) {
      error.textContent = 'Masukkan kunci lisensi.';
      input.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = 'MEMERIKSA…';
    const problem = await session.signIn(key);
    submit.disabled = false;
    submit.textContent = 'AKTIFKAN';
    if (problem) {
      error.textContent = problem;
      input.select();
      return;
    }
    error.textContent = '';
    Haptics.success();
    toast(`Kunci aktif di perangkat ini — ${session.plan.label}`, 'ok', 2400);
    render();
  };

  submit.addEventListener('click', () => void run());
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') void run();
  });

  const google = button('MASUK DENGAN GOOGLE', {
    tone: 'primary',
    block: true,
    onClick: () => session.signInGoogle(),
  });
  if (!session.state.google) {
    google.disabled = true;
    google.title = 'Login Google belum diaktifkan operator';
  }

  const priceBlock = el(
    'div',
    { class: 'price-hero' },
    el(
      'div',
      {},
      el('span', { class: 'price-hero__amount', text: PRO_PRICE }),
      el('span', { class: 'price-hero__cadence', text: `/ ${PRO_PASS_DAYS} hari` }),
    ),
    el('p', { class: 'price-hero__note', text: 'Sekali bayar. Tanpa langganan otomatis.' }),
  );

  const compareBlock = el(
    'div',
    { class: 'plan-compare' },
    ...(['free', 'pro'] as Tier[]).map((id) => {
      const plan = PLANS[id];
      return el(
        'div',
        { class: `plan-card ${id === 'pro' ? 'plan-card--pro' : ''}` },
        el(
          'div',
          { class: 'plan-card__head' },
          el('b', { text: plan.label }),
          el('span', { class: 'plan-card__price', text: plan.price }),
          el('span', { class: 'plan-card__cadence', text: plan.cadence }),
        ),
        el('ul', { class: 'perk-list' }, ...plan.perks.slice(0, 5).map((p) => el('li', {}, el('span', { text: p })))),
      );
    }),
  );

  append(host, [
    el(
      'div',
      { class: 'sheet__head' },
      el(
        'div',
        {},
        el('div', { class: 'sheet__kicker', text: account ? 'KUNCI' : 'AKUN' }),
        el(
          'h2',
          { id: 'sheet-title', class: 'sheet__title', text: !account ? 'MASUK' : opts.switching ? 'GANTI KUNCI' : 'AKTIFKAN PRO' },
        ),
      ),
      tierBadge('free'),
    ),
    !account
      ? el('p', {
          class: 'sheet__lede',
          text: 'Aegis Sound Lab memakai akun Google. Masuk sekali, lalu perangkat ini dikenali sampai kamu keluar.',
        })
      : el('p', {
          class: 'sheet__lede',
          text: `Akun ${session.state.email ?? 'Google'} sudah masuk. Tempel kunci PRO di bawah — kunci mengikat ke perangkat ini (${deviceShort()}).`,
        }),
    !account ? google : null,
    opts.switching || !account ? null : priceBlock,
    account ? el('div', { class: 'field' }, el('span', { class: 'label', text: 'KUNCI LISENSI' }), input) : null,
    account ? error : null,
    account ? submit : null,
    account && opts.switching
      ? button('BATAL', { tone: 'ghost', block: true, onClick: () => render() })
      : account
        ? el(
            'p',
            { class: 'sheet__note' },
            el('span', { text: 'Belum punya kunci? ' }),
            el('a', {
              attrs: { href: `https://t.me/${TELEGRAM_HANDLE}`, target: '_blank', rel: 'noopener noreferrer' },
              text: `Chat ${CONTACT_HANDLE}`,
            }),
            el('span', { text: `. ${PURCHASE_NOTE}` }),
          )
        : el(
            'div',
            {},
            el(
              'div',
              { class: 'sheet__actions' },
              button('BELI LEWAT TELEGRAM', {
                tone: 'primary',
                block: true,
                icon: 'bolt',
                onClick: () => openPurchase(),
              }),
            ),
            orderLine(),
            el('p', {
              class: 'sheet__note',
              text: `Chat langsung dengan ${CONTACT_HANDLE} di Telegram. ${PURCHASE_NOTE}`,
            }),
            compareBlock,
            el('p', {
              class: 'sheet__note',
              text: `Operator tidak pernah meminta kata sandi atau kode OTP. Pembelian hanya lewat t.me/${TELEGRAM_HANDLE}.`,
            }),
          ),
  ]);
}

function render(): void {
  if (!panel) return;
  panel.replaceChildren();
  panel.classList.toggle('sheet--narrow', false);

  if (session.state.status === 'loading') {
    panel.append(el('div', { class: 'sheet__loading' }, el('span', { class: 'spinner' }), el('span', { text: 'MEMUAT SESI…' })));
    return;
  }

  if (session.state.tier === 'free') renderSignedOut(panel);
  else renderSignedIn(panel);

  appendClose(panel);
}

function appendClose(host: HTMLElement): void {
  host.append(
    el(
      'button',
      {
        class: 'sheet__close',
        attrs: { type: 'button', 'aria-label': 'Tutup' },
        on: { click: close },
      },
      icon('close', 16),
    ),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function openAccount(trigger?: HTMLElement): void {
  lastFeature = null;
  open(trigger);
  render();
}

/** Paywall: the same sheet, focused on why the control is locked. */
export function openPaywall(reason: string, feature?: Feature, trigger?: HTMLElement): void {
  lastFeature = feature ?? null;
  open(trigger);

  if (!panel) return;
  if (session.state.tier !== 'free') {
    // Already paid: tell them what happened instead of selling again.
    panel.replaceChildren(
      el('div', { class: 'sheet__head' }, el('h2', { id: 'sheet-title', class: 'sheet__title', text: 'SUDAH TERBUKA' })),
      el('p', { class: 'sheet__lede', text: 'Paketmu sudah mencakup fitur ini.' }),
      button('TUTUP', { block: true, onClick: close }),
    );
    return;
  }

  panel.replaceChildren(
    el(
      'div',
      { class: 'sheet__head' },
      el('div', {}, el('div', { class: 'sheet__kicker', text: 'PRO' }), el('h2', { id: 'sheet-title', class: 'sheet__title', text: 'BUKA SEMUA' })),
      tierBadge('pro'),
    ),
    el('p', { class: 'sheet__lede', text: reason }),
    el(
      'div',
      { class: 'price-block' },
      el('span', { class: 'price-block__amount', text: PRICE_DISPLAY.price }),
      el('span', { class: 'price-block__cadence', text: PRICE_DISPLAY.cadence }),
    ),
    el('ul', { class: 'perk-list perk-list--tight' }, ...PRICE_DISPLAY.perks.map((p) => el('li', {}, el('span', { text: p })))),
    el(
      'div',
      { class: 'sheet__actions' },
      button('BELI LEWAT TELEGRAM', {
        tone: 'primary',
        block: true,
        icon: 'bolt',
        onClick: () => openPurchase(),
      }),
      button(session.signedIn ? 'PUNYA KUNCI? AKTIFKAN' : 'MASUK DENGAN GOOGLE', {
        tone: 'ghost',
        block: true,
        icon: 'check',
        onClick: () => {
          if (!session.signedIn) {
            session.signInGoogle();
            return;
          }
          render();
          const field = panel?.querySelector<HTMLInputElement>('.input--key');
          field?.focus();
        },
      }),
      button('NANTI', { tone: 'ghost', block: true, onClick: close }),
    ),
    el('p', { class: 'sheet__note', text: PURCHASE_NOTE }),
    el('button', {
      class: 'sheet__close',
      attrs: { type: 'button', 'aria-label': 'Tutup' },
      on: { click: close },
    }),
  );
  const closeBtn = panel.querySelector('.sheet__close');
  if (closeBtn) closeBtn.append(icon('close', 16));
  panel.dataset.feature = lastFeature ?? '';
}

export function accountButton(): HTMLButtonElement {
  const btn = el('button', {
    class: 'chip account-chip',
    attrs: { type: 'button', 'aria-label': 'Akun dan lisensi', title: 'Akun' },
    on: {
      click: () => openAccount(btn),
    },
  });

  const paint = (): void => {
    const tier = session.state.tier;
    btn.className = `chip account-chip account-chip--${tier}`;
    btn.replaceChildren(
      el('i', { class: 'account-chip__dot' }),
      el('b', { text: session.state.status === 'loading' ? '…' : tier.toUpperCase() }),
    );
  };

  session.subscribe(paint);
  paint();
  return btn;
}

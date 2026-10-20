/**
 * Where money changes hands.
 *
 * There is no checkout on purpose. At Rp 5.000 a payment gateway costs more in
 * fees and failed transactions than it earns, so the sale is a conversation:
 * the buyer opens Telegram, sends the prefilled order, pays, and the operator
 * replies with a licence key. The order code exists so ten simultaneous chats
 * never turn into a guessing game.
 */

import { PRO_PASS_DAYS, PRO_PRICE } from './tiers';

export const TELEGRAM_HANDLE = 'ElTzyy8';
const TELEGRAM_BASE = `https://t.me/${TELEGRAM_HANDLE}`;

const ORDER_KEY = 'aegis.order.code';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Short, human-readable code, stable for this browser session. */
export function orderCode(): string {
  try {
    const saved = sessionStorage.getItem(ORDER_KEY);
    if (saved) return saved;
  } catch {
    /* private mode */
  }
  let raw = '';
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(4));
    for (const byte of bytes) raw += ALPHABET[byte % ALPHABET.length];
  } else {
    for (let i = 0; i < 4; i += 1) raw += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  const code = `AEG-${raw}`;
  try {
    sessionStorage.setItem(ORDER_KEY, code);
  } catch {
    /* private mode */
  }
  return code;
}

function telegramLink(message: string): string {
  return `${TELEGRAM_BASE}?text=${encodeURIComponent(message)}`;
}

export function purchaseLink(code = orderCode()): string {
  return telegramLink(
    [
      `Halo, saya mau aktifkan AEGIS-M PRO Pass ${PRO_PASS_DAYS} hari (${PRO_PRICE}).`,
      '',
      `Kode pesanan: ${code}`,
      'Nama / panggilan: ',
      'Metode bayar: QRIS / e-wallet / transfer',
      '',
      'Sudah saya bayar — mohon dikirim kunci lisensinya di chat ini.',
    ].join('\n'),
  );
}

/** Renewal is a different conversation: the operator needs the serial. */
export function renewLink(serial: string): string {
  return telegramLink(
    [
      `Halo, saya mau perpanjang AEGIS-M PRO (${PRO_PRICE} / ${PRO_PASS_DAYS} hari).`,
      '',
      `Serial: ${serial}`,
      `Kode pesanan: ${orderCode()}`,
      '',
      'Mohon kunci barunya dikirim di chat ini.',
    ].join('\n'),
  );
}

export const PURCHASE_URL = telegramLink('Halo, saya mau aktifkan AEGIS-M PRO Pass.');

/** Shown next to the price so nobody expects an instant checkout. */
export const PURCHASE_NOTE =
  'Bayar lewat Telegram. Kunci dikirim manual setelah pembayaran dicek — biasanya beberapa menit.';

export const CONTACT_HANDLE = `@${TELEGRAM_HANDLE}`;

export function openPurchase(code = orderCode()): void {
  window.open(purchaseLink(code), '_blank', 'noopener,noreferrer');
}

export function openRenew(serial: string): void {
  window.open(renewLink(serial), '_blank', 'noopener,noreferrer');
}

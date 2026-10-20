/**
 * Where money changes hands.
 *
 * There is no payment provider wired into the app on purpose: a license is
 * issued by hand from the operator console, so the only thing the client needs
 * is a place to start the conversation. Swap this constant when a checkout
 * exists — nothing else references the channel.
 */
export const PURCHASE_URL =
  'https://github.com/Sanycorp/Sancorp-X-Aliongcorp/issues/new' +
  '?labels=license&title=' +
  encodeURIComponent('Permintaan lisensi PRO — AEGIS-M') +
  '&body=' +
  encodeURIComponent(
    [
      'Halo, saya ingin lisensi PRO AEGIS-M (Rp 79.000 / tahun).',
      '',
      'Nama / username:',
      'Email atau nomor untuk pengiriman kunci:',
      'Cara bayar yang diinginkan (transfer / e-wallet):',
      '',
      'Saya mengerti kunci dikirim manual oleh operator.',
    ].join('\n'),
  );

/** Copy shown next to the price so nobody expects an instant checkout. */
export const PURCHASE_NOTE = 'Kunci dikirim manual oleh operator setelah pembayaran dikonfirmasi.';

export function openPurchase(): void {
  window.open(PURCHASE_URL, '_blank', 'noopener,noreferrer');
}

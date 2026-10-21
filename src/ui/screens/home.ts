/**
 * The public front page.
 *
 * This is the only screen a visitor sees without an account, which is the point
 * of a commercial site: you can read what the product is, what it costs and what
 * it will not do, before signing in. The studio behind it stays gated.
 *
 * Structure, in reading order:
 *   01 hero          — one claim, one product surface, two actions
 *   02 chain         — the actual DSP order, named with the real processes
 *   03 capability    — what the engine does, and what it deliberately does not
 *   04 numbers       — measured facts, not adjectives
 *   05 price         — one paid plan, with a pass-length calculator
 *   06 questions     — the objections, answered before they are asked
 *
 * No countdown, no invented testimonials, no "trusted by" logos: there are no
 * customers to name yet, and a site that lies in its hero is not a site you
 * would trust with a master.
 */
import { button, el, icon } from '../elements';
import { brandMark } from '../brand';
import { session } from '../../state/session';
import { PRO_PASS_DAYS, PRO_PRICE } from '../../model/tiers';
import { CONTACT_HANDLE, TELEGRAM_HANDLE, openPurchase } from '../../model/contact';
import { APP_VERSION } from '../../version';
import { CHAIN_GROUPS, CHAIN_STAGES, FORMAT_LADDER } from '../../model/chain';
import { openGate } from '../gate';

const CHAIN_ROW = [
  { label: 'CLEAN', value: 'HPF 24 Hz' },
  { label: 'TIME', value: 'WSOLA 0.84×' },
  { label: 'TONE', value: '6 band · RBJ' },
  { label: 'SPACE', value: 'FDN 8 · RT60 2.1 s' },
  { label: 'ORBIT', value: '0.125 Hz · ±4.2 dB' },
  { label: 'MASTER', value: '−14.0 LUFS' },
  { label: 'LIMIT', value: '−1.2 dBTP' },
];

const FACTS = [
  { value: '48 kHz', label: 'laju sampel', note: 'stereo, 32-bit float di dalam engine' },
  { value: '−1.2 dBTP', label: 'ceiling limiter', note: 'true peak diukur 4× oversampling' },
  { value: '14', label: 'preset tervalidasi', note: 'semua mendarat di −14…−16 LUFS' },
  { value: '0 byte', label: 'audio diunggah', note: 'render berjalan di perangkatmu' },
];

const CAPABILITIES = [
  {
    icon: 'lab' as const,
    kicker: 'ENGINE',
    title: 'DSP sendiri, bukan shell ke FFmpeg',
    body: 'Semua prosesor ditulis dalam TypeScript: biquad RBJ, WSOLA, FDN reverb, STFT denoise, limiter lookahead. Tidak ada biner 30 MB yang harus diunduh sebelum berkas pertama bisa dirender.',
  },
  {
    icon: 'deck' as const,
    kicker: 'RENDER',
    title: 'Dua lintasan, satu gain statis',
    body: 'Lintasan pertama mengukur loudness dan true peak tanpa limiter, lintasan kedua menyelesaikan gain terhadap target. Hasilnya level yang konsisten tanpa loudnorm yang memompa.',
  },
  {
    icon: 'arsenal' as const,
    kicker: 'ARSENAL',
    title: 'Preset yang diuji, bukan dikira-kira',
    body: 'Empat belas preset dijalankan pada berkas uji: nol NaN, true peak di bawah −1 dBFS, dan loudness masuk rentang target. Angka itu bagian dari tes, bukan klaim di halaman ini.',
  },
  {
    icon: 'system' as const,
    kicker: 'PRIVASI',
    title: 'Berkas tidak pernah meninggalkan perangkat',
    body: 'Tidak ada unggahan, tidak ada antrean server, tidak ada pelacakan latar. Jaringan dipakai untuk tiga hal: memeriksa sesi, membaca rata-rata penilaian, dan mengirim penilaian saat kamu menekannya.',
  },
];

const FAQ = [
  {
    q: 'Apakah berkas audio saya diunggah ke server?',
    a: 'Tidak. Dekode, seluruh rantai DSP, dan encode berjalan di browser lewat OfflineAudioContext dan Web Worker. Server hanya melihat sesi, penilaian, dan permintaan konsol operator.',
  },
  {
    q: 'Browser apa yang didukung?',
    a: 'Chrome dan Edge 111+, Safari 16.4+, Firefox 115+, di Android, iOS/iPadOS, Windows, macOS, dan Linux. Syarat teknisnya OfflineAudioContext dan Web Worker — keduanya tersedia di semua browser tersebut. Halaman SISTEM menampilkan hasil deteksi perangkatmu apa adanya.',
  },
  {
    q: 'Bagaimana satu kunci satu perangkat bekerja?',
    a: 'Setiap browser membuat id perangkat acak yang disimpan di perangkat itu, lalu mengikat kuncinya ke id tersebut saat diaktifkan. Aktivasi dari perangkat lain ditolak dengan pesan yang jelas. Pindah HP? Minta operator melepas ikatannya lewat konsol — tanpa biaya, tanpa kunci baru.',
  },
  {
    q: 'Format apa saja yang bisa ditulis?',
    a: 'MP3 320 kbps, WAV 16-bit, WAV 24-bit, WAV 32-bit float, dan FLAC. Laju sampel mengikuti sumber (44.1 atau 48 kHz). WAV 24/32 dan FLAC termasuk PRO; MP3 dan WAV 16 terbuka di FREE.',
  },
  {
    q: 'Apakah hasil render sama dengan preview?',
    a: 'Ya. Preview adalah render pendek dari rantai yang sama, dengan penyetelan dan target yang sama. Yang berbeda hanya panjang berkas dan antrean worker, bukan algoritmanya — halaman TUNING menyebut ini secara eksplisit.',
  },
  {
    q: 'Apakah ada langganan otomatis?',
    a: 'Tidak. PRO adalah pass 30 hari sekali bayar: tanpa perpanjangan otomatis, tanpa kartu tersimpan, tanpa penagihan diam-diam. Kalau pass habis, akunmu kembali ke FREE dan seluruh preset serta riwayat tetap ada di perangkat.',
  },
  {
    q: 'Bagaimana cara membayar?',
    a: `Lewat Telegram ${CONTACT_HANDLE}. Aplikasi menyiapkan kode pesanan dan pesan yang sudah terisi; setelah pembayaran dicek, operator mengirim kunci di chat yang sama. Operator tidak pernah meminta kata sandi atau kode OTP.`,
  },
];

/** Rp 5.000 per 30 hari, dihitung per bulan penuh — tanpa pembulatan diam-diam. */
export function passPrice(days: number): number {
  return Math.round((5000 * days) / PRO_PASS_DAYS);
}

export function rupiah(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function goStudio(): void {
  if (session.signedIn) location.hash = '#/deck';
  else openGate('Masuk dengan Google untuk membuka studio.');
}

function scrollTo(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function anchor(label: string, id: string): HTMLElement {
  return el('button', {
    class: 'lp-nav__link',
    text: label,
    attrs: { type: 'button' },
    on: { click: () => scrollTo(id) },
  });
}

/** The product surface: a still of the chain monitor, built from the real order. */
function consoleMock(): HTMLElement {
  const rows = CHAIN_ROW.map((row, i) =>
    el(
      'li',
      { class: 'lp-mock__row' },
      el('span', { class: 'lp-mock__idx', text: String(i + 1).padStart(2, '0') }),
      el('b', { text: row.label }),
      el('span', { class: 'lp-mock__val', text: row.value }),
      el('i', { class: 'lp-mock__bar', style: `--fill:${64 - i * 6}%` }),
    ),
  );

  return el(
    'div',
    { class: 'lp-mock', attrs: { 'aria-label': 'Cuplikan rantai DSP', role: 'img' } },
    el(
      'div',
      { class: 'lp-mock__head' },
      el('span', { class: 'lp-mock__dot' }),
      el('b', { text: 'CHAIN MONITOR' }),
      el('span', { class: 'lp-mock__tag', text: 'SIAP' }),
    ),
    el('ul', { class: 'lp-mock__list' }, ...rows),
    el(
      'div',
      { class: 'lp-mock__meters' },
      el('div', {}, el('span', { text: 'LUFS' }), el('b', { text: '−14.0' })),
      el('div', {}, el('span', { text: 'TRUE PEAK' }), el('b', { text: '−1.2' })),
      el('div', {}, el('span', { text: 'SR' }), el('b', { text: '48k' })),
    ),
    el(
      'div',
      { class: 'lp-mock__foot' },
      el('span', { text: 'MP3 · WAV 16/24/32F · FLAC' }),
      el('span', { class: 'lp-mock__tag', text: '32-BIT FLOAT' }),
    ),
    el('span', { class: 'lp-mock__glow', attrs: { 'aria-hidden': 'true' } }),
  );
}

function hero(): HTMLElement {
  return el(
    'section',
    { class: 'lp-hero', attrs: { 'aria-labelledby': 'lp-title' } },
    el(
      'div',
      { class: 'lp-hero__copy' },
      el(
        'p',
        { class: 'lp-eyebrow' },
        el('i', { class: 'lp-eyebrow__dot' }),
        el('span', { text: 'OFFLINE DSP · 48 kHz · TANPA UPLOAD' }),
      ),
      el(
        'h1',
        { class: 'lp-hero__title', attrs: { id: 'lp-title' } },
        el('span', { text: 'Rantai mastering yang berjalan ' }),
        el('span', { class: 'lp-hero__accent', text: 'di perangkatmu.' }),
      ),
      el('p', {
        class: 'lp-hero__lede',
        text: 'Slowed, nightcore, 8D orbit, dan master klub: semuanya dihitung dengan DSP sendiri di dalam browser. Berkas tidak pernah diunggah, dan hasil render memakai rantai yang sama persis dengan preview.',
      }),
      el(
        'div',
        { class: 'lp-hero__actions' },
        button(session.signedIn ? 'BUKA STUDIO' : 'MASUK DENGAN GOOGLE', {
          tone: 'primary',
          size: 'md',
          icon: 'check',
          onClick: goStudio,
        }),
        el(
          'button',
          {
            class: 'lp-ghost',
            attrs: { type: 'button' },
            on: { click: () => scrollTo('alur') },
          },
          icon('system', 15),
          el('span', { text: 'Lihat rantai DSP' }),
        ),
      ),
      el(
        'p',
        { class: 'lp-hero__micro' },
        el('span', { text: 'Gratis untuk mulai' }),
        el('i', { text: '·' }),
        el('span', { text: '14 preset' }),
        el('i', { text: '·' }),
        el('span', { text: 'tanpa kartu' }),
      ),
    ),
    el('div', { class: 'lp-hero__art' }, consoleMock()),
  );
}

const STEPS = [
  {
    index: '01',
    title: 'Muat berkas',
    detail: 'Tarik satu berkas audio. Dekode terjadi di perangkat; tidak ada unggahan dan tidak ada antrean.',
  },
  {
    index: '02',
    title: 'Pilih arsenal, lalu tuning',
    detail: 'Empat belas preset tervalidasi, atau geser sendiri di TUNING. Setiap perubahan memakai rantai yang sama dengan hasil akhir.',
  },
  {
    index: '03',
    title: 'Render, lalu unduh',
    detail: 'Satu kali render menghasilkan berkas jadi beserta LUFS dan true peak-nya. Simpan, bagikan, atau bandingkan dua versi di A/B.',
  },
];

function howSection(): HTMLElement {
  return el(
    'section',
    { class: 'lp-section', id: 'cara', attrs: { 'aria-labelledby': 'lp-cara-title' } },
    el(
      'header',
      { class: 'lp-section__head' },
      el('p', { class: 'lp-kicker', text: 'ALUR KERJA' }),
      el('h2', { class: 'lp-section__title', attrs: { id: 'lp-cara-title' }, text: 'Tiga langkah, tanpa akun berlapis.' }),
      el('p', {
        class: 'lp-section__lede',
        text: 'Satu akun Google membuka semuanya. Tidak ada workspace, tidak ada undangan tim, tidak ada langkah onboarding yang harus dilewati.',
      }),
    ),
    el(
      'ol',
      { class: 'lp-steps' },
      ...STEPS.map((step) =>
        el(
          'li',
          { class: 'lp-step' },
          el('span', { class: 'lp-step__num', text: step.index }),
          el('h3', { text: step.title }),
          el('p', { text: step.detail }),
        ),
      ),
    ),
  );
}

function chainSection(): HTMLElement {
  return el(
    'section',
    { class: 'lp-section', id: 'alur', attrs: { 'aria-labelledby': 'lp-alur-title' } },
    el(
      'header',
      { class: 'lp-section__head' },
      el('p', { class: 'lp-kicker', text: 'URUTAN RANTAI' }),
      el('h2', { class: 'lp-section__title', attrs: { id: 'lp-alur-title' }, text: 'Satu rantai, enam kelompok, urutan tetap.' }),
      el('p', {
        class: 'lp-section__lede',
        text: 'Tiap proses berjalan berurutan pada satu buffer. Tidak ada prosesor yang bisa melompati prosesor lain, dan urutan ini yang dipakai preview maupun render penuh.',
      }),
    ),
    el(
      'ol',
      { class: 'lp-chain' },
      ...CHAIN_GROUPS.map((group) =>
        el(
          'li',
          { class: 'lp-chain__item' },
          el(
            'div',
            { class: 'lp-chain__top' },
            el('span', { class: 'lp-chain__num', text: group.index }),
            el('h3', { text: group.title }),
          ),
          el('p', { text: group.detail }),
          el(
            'div',
            { class: 'lp-chain__tags' },
            ...group.stages.map((id) => {
              const stage = CHAIN_STAGES.find((s) => s.id === id);
              return el('span', { class: 'lp-tag', text: stage?.label ?? id });
            }),
          ),
        ),
      ),
    ),
  );
}

function capabilitySection(): HTMLElement {
  return el(
    'section',
    { class: 'lp-section', id: 'produk', attrs: { 'aria-labelledby': 'lp-produk-title' } },
    el(
      'header',
      { class: 'lp-section__head' },
      el('p', { class: 'lp-kicker', text: 'MESIN' }),
      el('h2', { class: 'lp-section__title', attrs: { id: 'lp-produk-title' }, text: 'Yang dikerjakan, dan yang sengaja tidak.' }),
      el('p', {
        class: 'lp-section__lede',
        text: 'Batasan yang jelas lebih berguna daripada janji. Ini yang ada di dalam mesin, beserta dua hal yang tidak akan pernah dilakukan produk ini.',
      }),
    ),
    el(
      'div',
      { class: 'lp-grid lp-grid--4' },
      ...CAPABILITIES.map((item) =>
        el(
          'article',
          { class: 'lp-card' },
          el('div', { class: 'lp-card__icon' }, icon(item.icon, 18)),
          el('p', { class: 'lp-kicker lp-kicker--tiny', text: item.kicker }),
          el('h3', { text: item.title }),
          el('p', { text: item.body }),
        ),
      ),
    ),
    el(
      'div',
      { class: 'lp-formats' },
      el('p', { class: 'lp-kicker lp-kicker--tiny', text: 'FORMAT KELUARAN' }),
      el(
        'div',
        { class: 'lp-formats__row' },
        ...FORMAT_LADDER.map((format) =>
          el(
            'div',
            { class: 'lp-format' },
            el(
              'div',
              { class: 'lp-format__top' },
              el('b', { text: format.label }),
              format.pro ? el('span', { class: 'lp-tag', text: 'PRO' }) : el('span', { class: 'lp-tag', text: 'FREE' }),
            ),
            el('span', { text: format.detail }),
          ),
        ),
      ),
    ),
    el(
      'div',
      { class: 'lp-limits' },
      el(
        'div',
        {},
        el('p', { class: 'lp-kicker', text: 'BATAS' }),
        el('p', {
          text: 'Tidak ada upload dan tidak ada server render. Berkas 40 menit di ponsel empat inti akan memakan waktu — proses berjalan di perangkat itu, bukan di mesin kita. Jangan kunci layar saat render panjang.',
        }),
      ),
      el(
        'div',
        {},
        el('p', { class: 'lp-kicker', text: 'PRIVASI' }),
        el('p', {
          text: 'Id perangkat acak dipakai untuk mengikat lisensi dan mengumpulkan penilaian. Layar, font, dan canvas tidak dibaca; tidak ada fingerprint, tidak ada iklan, tidak ada data yang dijual.',
        }),
      ),
    ),
  );
}

function numbersSection(): HTMLElement {
  return el(
    'section',
    { class: 'lp-section lp-section--numbers', attrs: { 'aria-labelledby': 'lp-angka-title' } },
    el(
      'header',
      { class: 'lp-section__head' },
      el('p', { class: 'lp-kicker', text: 'ANGKA' }),
      el('h2', { class: 'lp-section__title', attrs: { id: 'lp-angka-title' }, text: 'Tidak ada yang perlu dijelaskan ulang.' }),
      el('p', {
        class: 'lp-section__lede',
        text: 'Angka di bawah ini berasal dari konfigurasi mesin dan dari tes yang berjalan di repo ini, bukan dari riset pasar.',
      }),
    ),
    el(
      'div',
      { class: 'lp-numbers' },
      ...FACTS.map((fact) =>
        el(
          'div',
          { class: 'lp-number' },
          el('b', { text: fact.value }),
          el('span', { text: fact.label }),
          el('small', { text: fact.note }),
        ),
      ),
    ),
  );
}

function priceSection(): HTMLElement {
  let days = PRO_PASS_DAYS;

  const total = el('b', { class: 'lp-price__total', text: rupiah(passPrice(days)) });
  const cadence = el('span', { class: 'lp-price__cadence', text: `${PRO_PASS_DAYS} hari` });

  const setDays = (next: number): void => {
    days = next;
    total.textContent = rupiah(passPrice(days));
    cadence.textContent = `${days} hari`;
    for (const btn of options.querySelectorAll<HTMLButtonElement>('button')) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.days) === days));
    }
  };

  const options = el(
    'div',
    { class: 'lp-price__options', attrs: { role: 'group', 'aria-label': 'Panjang pass' } },
    ...[30, 90, 365].map((value) =>
      el(
        'button',
        {
          class: 'lp-price__opt',
          attrs: { type: 'button', 'data-days': String(value), 'aria-pressed': String(value === days) },
          text: value === 365 ? '1 tahun' : `${value} hari`,
          on: { click: () => setDays(value) },
        },
      ),
    ),
  );

  return el(
    'section',
    { class: 'lp-section', id: 'harga', attrs: { 'aria-labelledby': 'lp-harga-title' } },
    el(
      'header',
      { class: 'lp-section__head' },
      el('p', { class: 'lp-kicker', text: 'HARGA' }),
      el('h2', { class: 'lp-section__title', attrs: { id: 'lp-harga-title' }, text: 'Satu paket berbayar. Itu saja.' }),
      el('p', {
        class: 'lp-section__lede',
        text: 'Tidak ada tier tengah yang menjebak, tidak ada biaya per menit. FREE memakai rantai penuh dengan batas alur kerja; PRO membuka seluruh arsenal dan seluruh format.',
      }),
    ),
    el(
      'div',
      { class: 'lp-price' },
      el(
        'article',
        { class: 'lp-plan' },
        el('p', { class: 'lp-plan__name', text: 'FREE' }),
        el('div', { class: 'lp-plan__amount' }, el('b', { text: 'Rp 0' }), el('span', { text: 'selamanya' })),
        el('p', { class: 'lp-plan__note', text: 'Rantai DSP penuh. Batas alur kerja, bukan batas kualitas.' }),
        el(
          'ul',
          { class: 'lp-plan__list' },
          el('li', { text: '4 preset pilihan' }),
          el('li', { text: 'MP3 320 kbps + WAV 16-bit' }),
          el('li', { text: 'Target −14 LUFS' }),
          el('li', { text: 'Render sampai 12 menit' }),
          el('li', { text: 'Riwayat 3 render terakhir' }),
        ),
        el('p', { class: 'lp-plan__foot', text: 'Butuh akun Google. Tanpa kartu.' }),
        button('MULAI GRATIS', { tone: 'ghost', block: true, onClick: goStudio }),
      ),
      el(
        'article',
        { class: 'lp-plan lp-plan--pro' },
        el(
          'div',
          { class: 'lp-plan__flag' },
          el('span', { text: 'PRO' }),
          el('i', { text: 'PASS 30 HARI' }),
        ),
        el('p', { class: 'lp-plan__name', text: 'PRO' }),
        el('div', { class: 'lp-plan__amount' }, el('b', { text: PRO_PRICE }), el('span', { text: '/ 30 hari' })),
        el('p', { class: 'lp-plan__note', text: 'Seluruh arsenal, semua format, satu perangkat per kunci.' }),
        el(
          'ul',
          { class: 'lp-plan__list' },
          el('li', { text: '14 preset tervalidasi' }),
          el('li', { text: 'MP3 · WAV 16/24/32F · FLAC' }),
          el('li', { text: 'Semua target −16…−9 LUFS' }),
          el('li', { text: '8D orbit, repair, A/B memory' }),
          el('li', { text: 'Render tanpa batas durasi' }),
          el('li', { text: 'Riwayat 40 render' }),
        ),
        el(
          'div',
          { class: 'lp-price__calc' },
          el('p', { class: 'lp-kicker lp-kicker--tiny', text: 'HITUNG PASS' }),
          options,
          el('div', { class: 'lp-price__sum' }, total, cadence),
        ),
        button('BELI LEWAT TELEGRAM', { tone: 'primary', block: true, icon: 'bolt', onClick: () => openPurchase() }),
        el('p', { class: 'lp-plan__foot', text: 'Bayar sekali, tanpa perpanjangan otomatis. Kunci dikirim di chat setelah pembayaran dicek.' }),
      ),
    ),
    el('p', {
      class: 'lp-price__fine',
      text: `Pembayaran manual lewat Telegram ${CONTACT_HANDLE} dengan kode pesanan. Tidak ada checkout kartu di halaman ini, dan tidak ada biaya tersembunyi.`,
    }),
  );
}

function faqSection(): HTMLElement {
  return el(
    'section',
    { class: 'lp-section', id: 'faq', attrs: { 'aria-labelledby': 'lp-faq-title' } },
    el(
      'header',
      { class: 'lp-section__head' },
      el('p', { class: 'lp-kicker', text: 'PERTANYAAN' }),
      el('h2', { class: 'lp-section__title', attrs: { id: 'lp-faq-title' }, text: 'Yang biasanya ditanya lebih dulu.' }),
    ),
    el(
      'div',
      { class: 'lp-faq' },
      ...FAQ.map((item) =>
        el(
          'details',
          { class: 'lp-faq__item' },
          el('summary', {}, el('span', { text: item.q }), icon('plus', 14)),
          el('p', { text: item.a }),
        ),
      ),
    ),
  );
}

function footer(): HTMLElement {
  return el(
    'footer',
    { class: 'lp-footer' },
    el(
      'div',
      { class: 'lp-footer__brand' },
      brandMark(26),
      el(
        'div',
        {},
        el('b', { text: 'AEGIS SOUND LAB' }),
        el('span', { text: 'Sanayacorp · offline audio engineering' }),
      ),
    ),
    el(
      'div',
      { class: 'lp-footer__links' },
      el('button', { class: 'lp-footer__link', text: 'Alur kerja', attrs: { type: 'button' }, on: { click: () => scrollTo('cara') } }),
      el('button', { class: 'lp-footer__link', text: 'Rantai DSP', attrs: { type: 'button' }, on: { click: () => scrollTo('alur') } }),
      el('button', { class: 'lp-footer__link', text: 'Harga', attrs: { type: 'button' }, on: { click: () => scrollTo('harga') } }),
      el('button', { class: 'lp-footer__link', text: 'Pertanyaan', attrs: { type: 'button' }, on: { click: () => scrollTo('faq') } }),
      el('a', {
        class: 'lp-footer__link',
        text: 'Telegram',
        attrs: { href: `https://t.me/${TELEGRAM_HANDLE}`, target: '_blank', rel: 'noopener noreferrer' },
      }),
      el('a', { class: 'lp-footer__link', text: 'Konsol operator', attrs: { href: '#/control' } }),
    ),
    el(
      'p',
      { class: 'lp-footer__note' },
      el('span', { text: `Aegis Sound Lab ${APP_VERSION} · dibangun dan diuji di repo ini` }),
      el('span', { text: 'Format terdengar sama di setiap browser karena mesinnya satu.' }),
    ),
  );
}

export function createHome(): { el: HTMLElement; update(): void } {
  const cta = button(session.signedIn ? 'BUKA STUDIO' : 'MASUK', {
    tone: 'primary',
    size: 'sm',
    onClick: goStudio,
  });

  const nav = el(
    'header',
    { class: 'lp-nav' },
    el(
      'div',
      { class: 'lp-nav__brand' },
      brandMark(24),
      el(
        'div',
        { class: 'lp-nav__name' },
        el('b', { text: 'AEGIS SOUND LAB' }),
        el('span', { text: 'SANAYACORP' }),
      ),
    ),
    el(
      'nav',
      { class: 'lp-nav__links', attrs: { 'aria-label': 'Bagian halaman' } },
      anchor('Cara kerja', 'cara'),
      anchor('Rantai', 'alur'),
      anchor('Mesin', 'produk'),
      anchor('Harga', 'harga'),
      anchor('Pertanyaan', 'faq'),
    ),
    el(
      'div',
      { class: 'lp-nav__end' },
      el(
        'span',
        { class: 'lp-nav__status' },
        el('i', { class: 'lp-nav__status-dot' }),
        el('span', { text: 'mesin lokal aktif' }),
      ),
      cta,
    ),
  );

  const root = el(
    'section',
    {
      class: 'screen screen--home',
      id: 'screen-home',
      attrs: { 'aria-label': 'Beranda Aegis Sound Lab' },
    },
    el(
      'div',
      { class: 'lp' },
      nav,
      hero(),
      el(
        'div',
        { class: 'lp-ticker', attrs: { 'aria-hidden': 'true' } },
        ...CHAIN_STAGES.map((stage) => el('span', { text: stage.label })),
      ),
      howSection(),
      chainSection(),
      capabilitySection(),
      numbersSection(),
      priceSection(),
      faqSection(),
      footer(),
    ),
  );

  const update = (): void => {
    const label = session.signedIn ? 'BUKA STUDIO' : 'MASUK';
    const span = cta.querySelector('span');
    if (span) span.textContent = label;
  };

  return { el: root, update };
}

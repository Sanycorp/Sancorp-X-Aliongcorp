import { button, el, sectionHead, toast } from './elements';
import { ratingBook, RATING_APP, MAX_NOTE } from '../state/rating';
import type { RatingSummary } from '../state/rating';
import { store } from '../state/store';
import { Haptics } from './haptics';
import { APP_VERSION } from '../version';

/**
 * The rating block in SYSTEM.
 *
 * Two targets, one voice: the product and the preset that is loaded right now.
 * A star is stored locally the instant it is tapped; sending is a separate
 * button, so "tersimpan" and "terkirim" can never be confused.
 */

interface Aggregate {
  summary: RatingSummary | null;
  state: 'idle' | 'loading' | 'ready' | 'offline';
}

interface StarRow {
  row: HTMLElement;
  target(): string;
  paint(): void;
}

export function createRatingGroup(): { el: HTMLElement; update: () => void; onEnter: () => void } {
  const aggregate: Aggregate = { summary: null, state: 'idle' };

  /** Which target the note and the send button act on. */
  let focused = RATING_APP;

  const noteInput = el('textarea', {
    class: 'rating__note',
    attrs: {
      maxlength: String(MAX_NOTE),
      rows: '2',
      placeholder: 'Catatan singkat (opsional)',
      'aria-label': 'Catatan penilaian',
    },
  });
  const noteCount = el('span', { class: 'rating__count mono', text: `0/${MAX_NOTE}` });
  const statusLine = el('p', { class: 'rating__status' });
  const aggregateLine = el('p', { class: 'rating__aggregate' });
  const sendBtn = button('KIRIM PENILAIAN', { tone: 'primary', size: 'sm', icon: 'check', block: true });

  const activePreset = (): string => store.edit.activePreset ?? '';

  function starRow(label: string, resolve: () => string, fallback: () => string): StarRow {
    const value = el('span', { class: 'rating__value mono', text: fallback() });
    const host = el('div', {
      class: 'rating__stars',
      attrs: { role: 'group', 'aria-label': `Nilai ${label.toLowerCase()}` },
    });

    for (let i = 1; i <= 5; i += 1) {
      host.appendChild(
        el(
          'button',
          {
            class: 'rating__star',
            attrs: {
              type: 'button',
              'data-value': String(i),
              'aria-label': `${i} bintang`,
              'aria-pressed': 'false',
            },
            on: {
              click: () => {
                const target = resolve();
                if (!target) {
                  toast('Pilih preset dulu untuk menilainya', 'info', 1800);
                  return;
                }
                const entry = ratingBook.rate(target, i, focused === target ? noteInput.value : '');
                if (!entry) return;
                focused = target;
                Haptics.tap();
                paint();
                toast(`Nilai ${i} bintang tersimpan`, 'ok', 1400);
              },
            },
          },
          el('span', { text: '★', attrs: { 'aria-hidden': 'true' } }),
        ),
      );
    }

    const row = el('div', { class: 'rating__row' }, el('span', { class: 'label', text: label }), value, host);

    return {
      row,
      target: resolve,
      paint(): void {
        const target = resolve();
        const entry = target ? ratingBook.get(target) : undefined;
        const stars = entry?.stars ?? 0;
        host.querySelectorAll<HTMLElement>('.rating__star').forEach((node) => {
          const n = Number(node.dataset.value);
          node.setAttribute('aria-pressed', String(n === stars));
          node.classList.toggle('is-on', n <= stars);
        });
        host.dataset.locked = target ? 'false' : 'true';
        value.textContent = entry ? `${stars}/5` : fallback();
      },
    };
  }

  const appRow = starRow('APLIKASI', () => RATING_APP, () => (ratingBook.get(RATING_APP) ? '' : 'belum dinilai'));
  const presetRow = starRow(
    'PRESET AKTIF',
    () => activePreset(),
    () => (activePreset() ? activePreset().replace(/-/g, ' ').toUpperCase() : 'belum ada preset'),
  );

  function paintAggregate(): void {
    if (aggregate.state === 'loading') {
      aggregateLine.textContent = 'Memuat penilaian terkumpul…';
      return;
    }
    if (aggregate.state === 'offline') {
      aggregateLine.textContent =
        'Penilaian terkumpul tidak terbaca sekarang — penilaianmu tetap tersimpan di perangkat.';
      return;
    }
    const summary = aggregate.summary;
    if (!summary || summary.count === 0) {
      aggregateLine.textContent = 'Belum ada penilaian terkumpul.';
      return;
    }
    aggregateLine.textContent = `Rata-rata ${summary.average.toFixed(1)} dari ${summary.count} penilaian · ${Math.round(
      summary.positive * 100,
    )}% memberi 4–5 bintang`;
  }

  function paintStatus(): void {
    const entry = ratingBook.get(focused);
    if (!entry) {
      statusLine.textContent = 'Belum kamu nilai. Ketuk bintang untuk memberi nilai.';
      return;
    }
    const when = new Date(entry.at).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    statusLine.textContent = entry.sent
      ? `Terkirim ke operator · ${when}`
      : `Tersimpan di perangkat · ${when} · belum terkirim`;
  }

  function paint(): void {
    appRow.paint();
    presetRow.paint();
    const entry = ratingBook.get(focused);
    if (document.activeElement !== noteInput) {
      noteInput.value = entry?.note ?? '';
      noteCount.textContent = `${noteInput.value.length}/${MAX_NOTE}`;
    }
    paintStatus();
    paintAggregate();
    sendBtn.disabled = !entry;
  }

  noteInput.addEventListener('input', () => {
    noteCount.textContent = `${noteInput.value.length}/${MAX_NOTE}`;
    const entry = ratingBook.get(focused);
    if (entry) ratingBook.rate(focused, entry.stars, noteInput.value);
  });

  async function send(): Promise<void> {
    const entry = ratingBook.get(focused);
    if (!entry) {
      toast('Beri bintang dulu sebelum mengirim', 'err', 1800);
      return;
    }
    sendBtn.disabled = true;
    try {
      const response = await fetch('/api/rating', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target: entry.target,
          stars: entry.stars,
          note: entry.note,
          device: ratingBook.device,
          app: APP_VERSION,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { sink?: boolean; stored?: boolean };
      if (response.ok && data.stored) {
        ratingBook.markSent(entry.target);
        toast('Penilaian terkirim — terima kasih', 'ok', 1800);
      } else if (response.status === 429) {
        toast('Terlalu sering. Coba lagi beberapa menit lagi.', 'err', 2200);
      } else if (response.ok && data.sink === false) {
        toast('Tersimpan di perangkat — kanal penilaian belum aktif', 'info', 2600);
      } else {
        toast('Belum bisa terkirim. Penilaian tetap tersimpan.', 'err', 2200);
      }
    } catch {
      toast('Tidak ada koneksi. Penilaian tetap tersimpan.', 'err', 2200);
    } finally {
      paint();
    }
  }

  sendBtn.addEventListener('click', () => {
    void send();
  });

  const group = el(
    'div',
    { class: 'plate settings-group rating' },
    sectionHead('05', 'RATING'),
    el(
      'p',
      { class: 'lab-group__note', style: 'margin-top:0' },
      'Nilai aplikasinya dan preset yang sedang dipakai. Satu nilai per target, bisa diubah kapan saja.',
    ),
    appRow.row,
    presetRow.row,
    el('div', { class: 'rating__note-wrap' }, noteInput, noteCount),
    el('div', { class: 'rating__actions' }, sendBtn),
    statusLine,
    aggregateLine,
    el('p', {
      class: 'rating__privacy',
      text: 'Yang dikirim hanya target, jumlah bintang, catatan, dan id perangkat acak. Tidak ada audio, nama file, atau kunci lisensi.',
    }),
  );

  let asked = false;

  async function loadSummary(): Promise<void> {
    aggregate.state = 'loading';
    paintAggregate();
    try {
      const response = await fetch('/api/rating', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { summary?: RatingSummary };
      aggregate.summary = data.summary ?? null;
      aggregate.state = 'ready';
    } catch {
      aggregate.state = 'offline';
    }
    paintAggregate();
  }

  store.subscribe(paint);
  paint();

  return {
    el: group,
    update: paint,
    onEnter: () => {
      if (asked) return;
      asked = true;
      void loadSummary();
    },
  };
}

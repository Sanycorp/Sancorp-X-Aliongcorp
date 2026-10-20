import { APP_DEFAULTS, FORMAT_META, TARGET_META } from '../../model/settings';
import type { FinishMode } from '../../model/settings';
import type { LoudnessTarget, OutputFormat } from '../../model/settings';
import { store } from '../../state/store';
import { Haptics } from '../haptics';
import {
  button,
  el,
  iconButton,
  sectionHead,
  segmented,
  select,
  toast,
  toggle,
} from '../elements';
import { clearSession } from '../../io/storage';
import { session } from '../../state/session';
import { PRO_PASS_DAYS, PRO_PRICE, planFor } from '../../model/tiers';
import { openAccount } from '../account';
import { createRatingGroup } from '../rating';
import { formatBytes, formatDuration } from '../../io/audioFile';
import type { Screen } from './deck';

import { APP_VERSION } from '../../version';
export { APP_VERSION };

export function createSystem(): Screen {
  // ------------------------------------------------------------- finish
  const finishSeg = segmented(
    [
      { value: 'auto', label: 'AUTO', sub: 'SYSTEM' },
      { value: 'armor', label: 'ARMOR', sub: 'WHITE' },
      { value: 'cockpit', label: 'COCKPIT', sub: 'BLACK' },
    ],
    store.settings.finish,
    (v) => {
      store.patchSettings({ finish: v as FinishMode });
      Haptics.tap();
    },
  );

  const motionToggle = toggle('REDUCE MOTION', store.settings.reduceMotion, (v) => {
    store.patchSettings({ reduceMotion: v });
  });
  const hapticToggle = toggle('HAPTICS', store.settings.haptics, (v) => {
    store.patchSettings({ haptics: v });
    if (v) Haptics.medium();
  });

  const uiGroup = el(
    'div',
    { class: 'plate settings-group' },
    sectionHead('01', 'INTERFACE'),
    el('div', { class: 'label', text: 'FINISH', style: 'margin-bottom:6px' }),
    finishSeg.wrap,
    el('div', { style: 'height:10px' }),
    motionToggle.wrap,
    hapticToggle.wrap,
  );

  // ------------------------------------------------------------- output
  const formatKeys = Object.keys(FORMAT_META) as OutputFormat[];
  const formatSelect = select(
    'FORMAT DEFAULT',
    formatKeys.map((k) => ({ value: k, label: `${FORMAT_META[k].label} · ${FORMAT_META[k].spec}` })),
    store.settings.format,
    (v) => {
      store.patchSettings({ format: v as OutputFormat });
      store.patchEdit({ format: v as OutputFormat });
      Haptics.tap();
      updateNote();
    },
  );

  const bitrateSeg = segmented(
    [128, 192, 256, 320].map((b) => ({ value: String(b), label: `${b}`, sub: 'KBPS' })),
    String(store.settings.bitrate),
    (v) => {
      store.patchSettings({ bitrate: Number(v) });
      store.patchEdit({ bitrate: Number(v) });
    },
  );

  const targetSelect = select(
    'TARGET LOUDNESS',
    (Object.keys(TARGET_META) as LoudnessTarget[]).map((k) => ({
      value: k,
      label: `${TARGET_META[k].label} · ${TARGET_META[k].hint}`,
    })),
    store.settings.target,
    (v) => {
      store.patchSettings({ target: v as LoudnessTarget });
      store.patchEdit({ target: v as LoudnessTarget });
      Haptics.tap();
      updateNote();
    },
  );

  const noteEl = el('div', { class: 'lab-group__note' });
  const updateNote = (): void => {
    const meta = FORMAT_META[store.settings.format];
    noteEl.textContent = `${meta.label}: ${meta.note} ${meta.lossy ? `Bitrate ${store.settings.bitrate} kbps.` : 'Lossless — bitrate tidak berlaku.'}`;
  };
  updateNote();

  const shareToggle = toggle('SHARE SHEET SETELAH EXPORT', store.settings.shareAfterExport, (v) => {
    store.patchSettings({ shareAfterExport: v });
  });
  const historyToggle = toggle('SIMPAN RIWAYAT', store.settings.keepHistory, (v) => {
    store.patchSettings({ keepHistory: v });
  });

  const outputGroup = el(
    'div',
    { class: 'plate settings-group' },
    sectionHead('02', 'OUTPUT'),
    formatSelect.wrap,
    el('div', { class: 'label', text: 'BITRATE (LOSSY)', style: 'margin-bottom:6px' }),
    bitrateSeg.wrap,
    el('div', { style: 'height:10px' }),
    targetSelect.wrap,
    noteEl,
    el('div', { style: 'height:10px' }),
    shareToggle.wrap,
    historyToggle.wrap,
  );

  // ------------------------------------------------------------- history
  const historyList = el('div', { class: 'history-list' });
  const emptyHistory = el('div', {
    class: 'lab-group__note',
    text: 'Belum ada export di perangkat ini. Hasil render akan muncul di sini beserta LUFS dan true peak-nya.',
  });

  const clearBtn = button('HAPUS SEMUA', {
    tone: 'ghost',
    size: 'sm',
    icon: 'trash',
    onClick: () => {
      store.clearHistory();
      toast('Riwayat dihapus', 'info', 1500);
    },
  });

  const historyGroup = el(
    'div',
    { class: 'plate settings-group' },
    el(
      'div',
      { class: 'row', style: 'align-items:center' },
      el('div', { style: 'flex:1;min-width:0' }, sectionHead('03', 'RIWAYAT EXPORT')),
      clearBtn,
    ),
    emptyHistory,
    historyList,
  );

  // ------------------------------------------------------------- account
  const accountChip = el('span', { class: 'chip', text: 'FREE' });
  const accountLine = el('p', { class: 'lab-group__note', style: 'margin-top:0' });
  const accountCta = el('div', { style: 'display:grid; gap:8px; margin-top:10px' });

  const accountGroup = el(
    'div',
    { class: 'plate settings-group' },
    el(
      'div',
      { class: 'row', style: 'align-items:center;gap:10px' },
      el('div', { style: 'flex:1;min-width:0' }, sectionHead('04', 'AKUN & LISENSI')),
      accountChip,
    ),
    accountLine,
    accountCta,
  );

  function renderAccount(): void {
    const tier = session.state.tier;
    const plan = planFor(tier);
    accountChip.className = `chip ${tier === 'free' ? '' : 'chip--live'}`;
    accountChip.textContent = plan.label;
    accountLine.textContent =
      tier === 'free'
        ? `Kamu di paket FREE: 4 preset, MP3/WAV 16, export sampai 12 menit. PRO ${PRO_PRICE} per ${PRO_PASS_DAYS} hari membuka seluruh arsenal, format lossless, dan export tanpa batas.`
        : `Aktif sampai ${session.state.exp ? new Date(session.state.exp).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'tanpa batas'} · serial ${session.state.subject ?? '—'}`;

    accountCta.replaceChildren(
      button(tier === 'free' ? 'AKTIFKAN LISENSI' : 'KELOLA AKUN', {
        tone: tier === 'free' ? 'primary' : 'ghost',
        size: 'sm',
        block: true,
        icon: 'check',
        onClick: () => openAccount(),
      }),
      tier === 'admin'
        ? button('BUKA AEGIS OPS', {
            tone: 'ghost',
            size: 'sm',
            block: true,
            icon: 'system',
            onClick: () => {
              location.hash = '#/control';
            },
          })
        : el('span'),
    );
  }

  // ------------------------------------------------------------- rating
  const ratingGroup = createRatingGroup();

  // ------------------------------------------------------------- about
  const aboutGroup = el(
    'div',
    { class: 'plate settings-group' },
    sectionHead('06', 'TENTANG'),
    el(
      'div',
      { class: 'about-grid' },
      infoCell('APP', 'AEGIS SOUND LAB'),
      infoCell('PERUSAHAAN', 'SANAYACORP'),
      infoCell('VERSI', APP_VERSION),
      infoCell('ENGINE', 'TS 7 · Vite 8'),
      infoCell('DSP', 'Murni TS · 32-bit'),
      infoCell('PLATFORM', 'Web / PWA'),
      infoCell('OUTPUT', '48 kHz stereo'),
    ),
    el('p', {
      class: 'lab-group__note',
      text: 'Seluruh pemrosesan audio berjalan lokal di perangkat — file tidak pernah diunggah. Jaringan hanya dipakai untuk tiga hal: memeriksa lisensi, membaca rata-rata penilaian, dan mengirim penilaian saat tombolnya kamu tekan sendiri. Tidak ada pelacakan latar. Loudness memakai BS.1770-4 dengan true peak 4× oversampling.',
    }),
    el(
      'div',
      { style: 'display:grid; gap:8px; margin-top:10px' },
      button('RESET SETELAN UI', {
        tone: 'ghost',
        size: 'sm',
        onClick: () => {
          store.patchSettings({ ...APP_DEFAULTS });
          toast('Setelan UI dikembalikan ke default', 'ok', 1600);
        },
      }),
      button('HAPUS SESI TERSIMPAN', {
        tone: 'ghost',
        size: 'sm',
        icon: 'trash',
        onClick: () => {
          clearSession();
          store.wipeSession();
          toast('Sesi dibersihkan — chain kembali netral', 'info', 2000);
        },
      }),
    ),
  );

  function infoCell(label: string, value: string): HTMLElement {
    return el('div', {}, el('span', { text: label }), el('b', { text: value }));
  }

  const screen = el(
    'section',
    { class: 'screen', id: 'screen-system', attrs: { 'aria-label': 'System settings' } },
    el(
      'div',
      { class: 'screen__intro' },
      el(
        'div',
        {},
        el('div', { class: 'screen__kicker', text: 'AEGIS SOUND LAB / CONTROL ROOM' }),
        el('h1', { class: 'screen__title', html: 'SYSTEM <em>CONTROL</em>' }),
      ),
      el('div', { class: 'header__meta' }, el('span', { class: 'chip' }, el('b', { text: 'OFFLINE' }))),
    ),
    el(
      'div',
      { class: 'grid grid--lab' },
      uiGroup,
      outputGroup,
      historyGroup,
      accountGroup,
      ratingGroup.el,
      aboutGroup,
    ),
    el('div', { class: 'footnote', text: `Aegis Sound Lab ${APP_VERSION} · Sanayacorp · dibuat untuk dipakai, bukan untuk di-upload` }),
  );

  function renderHistory(): void {
    historyList.replaceChildren();
    const has = store.history.length > 0 && store.settings.keepHistory;
    emptyHistory.classList.toggle('hidden', has);
    historyList.classList.toggle('hidden', !has);
    if (!has) return;
    const rows = store.history.slice(0, store.historyCap()).map((rec) => {
      const date = new Date(rec.createdAt);
      const stamp = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      return el(
        'div',
        { class: 'history-row' },
        el('div', { class: 'history-row__name', text: rec.name }),
        iconButton('trash', 'Hapus entri', () => store.removeHistory(rec.id)),
        el('div', {
          class: 'history-row__meta',
          text: `${stamp} · ${rec.format} · ${formatDuration(rec.duration, true)} · ${formatBytes(rec.bytes)} · ${rec.lufs == null ? '—' : `${rec.lufs.toFixed(1)} LUFS`} · TP ${rec.truePeak.toFixed(1)}`,
        }),
      );
    });
    historyList.append(...rows);
  }

  function update(): void {
    finishSeg.set(store.settings.finish);
    motionToggle.set(store.settings.reduceMotion);
    hapticToggle.set(store.settings.haptics);
    shareToggle.set(store.settings.shareAfterExport);
    historyToggle.set(store.settings.keepHistory);
    formatSelect.select.value = store.settings.format;
    bitrateSeg.set(String(store.settings.bitrate));
    targetSelect.select.value = store.settings.target;
    updateNote();
    renderHistory();
    renderAccount();
  }

  store.subscribe(update);
  session.subscribe(() => {
    store.trimHistory();
    renderAccount();
  });
  store.trimHistory();
  update();

  return {
    el: screen,
    update,
    onEnter: () => {
      ratingGroup.onEnter();
      ratingGroup.update();
    },
  };
}

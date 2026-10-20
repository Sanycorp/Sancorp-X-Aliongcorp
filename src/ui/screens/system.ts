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
import { postureOnce, postureVerdict } from '../../security/posture';
import { isNativeApp } from '../../security/platform';
import type { Posture, PostureState } from '../../security/posture';
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

  // ------------------------------------------------------------- security
  const secChip = el('span', { class: 'chip', text: 'MEMINDAI' });
  const secList = el('div', { class: 'posture-list' });
  const native = isNativeApp();
  const secNote = el('p', {
    class: 'lab-group__note',
    text: native
      ? 'APK tidak punya server, jadi tidak ada header HTTP di sini. Yang diperiksa: sandbox WebView, Trusted Types, SRI, manifest anti-cleartext, larangan navigasi keluar, dan backup yang diblokir.'
      : 'Edisi web: status dibaca langsung dari respons server — header CSP, enforcement Trusted Types, SRI, isolasi lintas-origin, dan cache shell.',
  });

  const securityGroup = el(
    'div',
    { class: 'plate settings-group' },
    el(
      'div',
      { class: 'row', style: 'align-items:center;gap:10px' },
      el(
        'div',
        { style: 'flex:1;min-width:0' },
        sectionHead('05', native ? 'SECURITY · APP' : 'SECURITY · WEB'),
      ),
      secChip,
    ),
    secList,
    secNote,
  );

  const STATE_LABEL: Record<PostureState, string> = { on: 'ON', partial: 'PART', off: 'OFF' };

  function renderPosture(p: Posture): void {
    secChip.className = `chip ${p.score === p.total ? 'chip--live' : ''}`;
    secChip.textContent = `${postureVerdict(p)} ${p.score}/${p.total}`;
    const rows = p.items.map((item) =>
      el(
        'div',
        { class: 'posture-row', dataset: { state: item.state } },
        el('span', { class: 'posture-dot' }),
        el(
          'div',
          { class: 'posture-copy' },
          el('b', { text: item.label }),
          el('span', { text: item.detail }),
        ),
        el('span', { class: 'posture-state', text: STATE_LABEL[item.state] }),
      ),
    );
    secList.replaceChildren(...rows);
  }

  async function refreshPosture(): Promise<void> {
    try {
      renderPosture(await postureOnce(true));
    } catch {
      secChip.textContent = 'TIDAK TERBACA';
      secList.replaceChildren(
        el('div', { class: 'posture-row', dataset: { state: 'off' } },
          el('span', { class: 'posture-dot' }),
          el('div', { class: 'posture-copy' }, el('b', { text: 'POSTURE' }), el('span', { text: 'gagal membaca status platform' })),
          el('span', { class: 'posture-state', text: 'OFF' }),
        ),
      );
    }
  }

  // ------------------------------------------------------------- about
  const aboutGroup = el(
    'div',
    { class: 'plate settings-group' },
    sectionHead('04', 'TENTANG'),
    el(
      'div',
      { class: 'about-grid' },
      infoCell('APP', 'EL TZY AEGIS-M'),
      infoCell('VERSI', APP_VERSION),
      infoCell('ENGINE', 'TS 7 · Vite 8'),
      infoCell('DSP', 'WebAudio-free · 32-bit'),
      infoCell('SHELL', 'Capacitor 8'),
      infoCell('OUTPUT', '48 kHz stereo'),
    ),
    el('p', {
      class: 'lab-group__note',
      text: 'Seluruh pemrosesan berjalan lokal di perangkat. Tidak ada upload, tidak ada server, tidak ada telemetry. Loudness memakai BS.1770-4 dengan true peak 4× oversampling.',
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
        el('div', { class: 'screen__kicker', text: 'AEGIS-M / CONTROL ROOM' }),
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
      securityGroup,
      aboutGroup,
    ),
    el('div', { class: 'footnote', text: `EL TZY AEGIS-M ${APP_VERSION} · dibuat untuk dipakai, bukan untuk di-upload` }),
  );

  function renderHistory(): void {
    historyList.replaceChildren();
    const has = store.history.length > 0 && store.settings.keepHistory;
    emptyHistory.classList.toggle('hidden', has);
    historyList.classList.toggle('hidden', !has);
    if (!has) return;
    const rows = store.history.slice(0, 12).map((rec) => {
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
  }

  store.subscribe(update);
  update();
  void refreshPosture();

  return { el: screen, update, onEnter: () => void refreshPosture() };
}

import { PRESETS, presetById } from '../../model/presets';
import { CHAIN_GROUPS, CHAIN_STAGES, stageGroupIndex } from '../../model/chain';
import type { ChainStage } from '../../model/chain';
import { FORMAT_META, SPEED_MODE_META, TARGET_META, SPACE_META } from '../../model/settings';
import type { SourceInfo } from '../../model/settings';
import { store } from '../../state/store';
import { forgeExport, getPreviewStats, loadSource, renderPreview, shareLast } from '../../state/forge';
import { formatBytes, formatDuration, formatRate } from '../../io/audioFile';
import { PreviewPlayer } from '../../io/player';
import { Haptics } from '../haptics';
import { session } from '../../state/session';
import type { LoudnessTarget, OutputFormat } from '../../model/settings';
import { formatAllowed, isPro, planFor, presetAllowed, targetAllowed, upgradeHint } from '../../model/tiers';
import { formatChoices } from '../../model/entitlements';
import { presetLocked } from '../../model/entitlements';
import { openPaywall } from '../account';
import {
  button,
  el,
  icon,
  iconButton,
  sectionHead,
  segmented,
  toast,
} from '../elements';
import { createWaveform } from '../waveform';
import { createScope } from '../scope';
import { animateValue, burst, scramble } from '../motion';
import { setHtml } from '../../security/sanitize';

const STAGE_ORDER = CHAIN_GROUPS.map((g) => g.id);

export interface Screen {
  el: HTMLElement;
  /** Fixed chrome outside the scroll container (mobile action dock). */
  overlay?: HTMLElement;
  update(): void;
  onEnter?(): void;
  /** Optional teardown for screens that own timers. */
  destroy?(): void;
}

export function createDeck(): Screen {
  const player = new PreviewPlayer();
  player.setVolume(1);

  // ---------------------------------------------------------------- source
  const fileInput = el('input', {
    class: 'hidden',
    attrs: { type: 'file', accept: 'audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.opus,.aiff,.aif' },
  });

  const drop = el(
    'div',
    { class: 'drop', attrs: { role: 'button', tabindex: '0', 'aria-label': 'Muat file audio' } },
    el('div', { class: 'drop__icon', html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>` }),
    el('div', { class: 'drop__title', text: 'PILIH LAGU' }),
    el('div', {
      class: 'drop__hint',
      html: 'MP3 · WAV · FLAC · OGG · M4A/AAC · OPUS<br/><b>Diproses di HP ini. Tidak ada yang diunggah.</b>',
    }),
    button('BUKA FILE', { tone: 'primary', size: 'sm', onClick: () => fileInput.click() }),
  );

  const wave = createWaveform(store, () => {
    store.persist();
    store.previewReady = false;
    store.emit();
  });

  const playBtn = iconButton('play', 'Putar hasil', () => void togglePlay());
  playBtn.classList.add('play-btn');
  const timeLabel = el('span', { class: 'transport__time mono', text: '0:00 / 0:00' });
  const scrubFill = el('i');
  const scrub = el('div', {
    class: 'transport__scrub',
    attrs: { role: 'slider', 'aria-label': 'Posisi preview', tabindex: '0' },
  }, scrubFill);
  const sourceName = el('strong', { text: '' });
  const sourceMeta = el('span', { class: 'loaded-head__meta mono', text: '' });

  const loaded = el(
    'div',
    { class: 'hidden' },
    el(
      'div',
      { class: 'loaded-head' },
      el('div', { class: 'brand__mark', html: '<span>WAV</span>' }),
      el('div', { class: 'loaded-head__name' }, sourceName, sourceMeta),
      iconButton('reset', 'Ganti sumber', () => store.clearSource()),
    ),
    wave.el,
    el(
      'div',
      { class: 'transport' },
      playBtn,
      timeLabel,
      scrub,
    ),
  );

  const skeleton = el(
    'div',
    { class: 'skeleton', attrs: { hidden: true, role: 'status', 'aria-live': 'polite' } },
    el(
      'div',
      { class: 'skeleton__bars', attrs: { 'aria-hidden': 'true' } },
      el('i'),
      el('i'),
      el('i'),
      el('i'),
      el('i'),
    ),
    el('span', { class: 'skeleton__label', text: 'MEMBACA AUDIO' }),
  );

  const sourcePlate = el(
    'div',
    { class: 'plate bracket bracket--lg source-plate' },
    el('div', { class: 'rivets' }),
    drop,
    loaded,
    fileInput,
    skeleton,
  );

  const handleFiles = async (files: FileList | null): Promise<void> => {
    const file = files?.[0];
    if (!file) return;
    const t = toast('Membaca audio…', 'info', 6000);
    try {
      player.reset();
      wave.setPlayhead(null);
      await loadSource(file);
      t?.remove();
      toast(`Sumber siap · ${file.name}`, 'ok');
      update();
    } catch {
      t?.remove();
      toast(store.status.error ?? 'Gagal membaca file', 'err', 4200);
    }
  };

  drop.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('button')) return;
    fileInput.click();
  });
  drop.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', () => void handleFiles(fileInput.files));

  ['dragenter', 'dragover'].forEach((type) =>
    window.addEventListener(type, (ev) => {
      ev.preventDefault();
      drop.classList.add('is-over');
    }),
  );
  ['dragleave', 'drop'].forEach((type) =>
    window.addEventListener(type, (ev) => {
      ev.preventDefault();
      if (type === 'drop' || ev.target === document.documentElement) drop.classList.remove('is-over');
    }),
  );
  window.addEventListener('drop', (ev) => {
    ev.preventDefault();
    drop.classList.remove('is-over');
    const dt = (ev as DragEvent).dataTransfer;
    if (dt?.files?.length) void handleFiles(dt.files);
  });

  // ---------------------------------------------------------------- presets
  const makeChip = (preset: (typeof PRESETS)[number]) => {
    const chip = el(
      'button',
      {
        class: `preset-chip preset-chip--${preset.accent}`,
        attrs: { type: 'button', 'aria-pressed': 'false', title: preset.detail },
        on: {
          click: () => {
            if (!presetAllowed(session.tier, preset.id)) {
              openPaywall(upgradeHint('preset'), 'allPresets', chip);
              return;
            }
            store.applyPreset(preset.id, preset.apply);
            Haptics.medium();
            toast(`${preset.name} · ${preset.tagline}`, 'ok');
            update();
          },
        },
      },
      el('span', { class: 'preset-chip__tag', text: preset.tag }),
      el('span', { class: 'preset-chip__name', text: preset.name }),
      el('span', { class: 'preset-chip__sub', text: preset.tagline }),
      el('i', { class: 'lock', text: 'PRO', attrs: { 'aria-hidden': 'true' } }),
    );
    chip.dataset.preset = preset.id;
    return chip;
  };

  const ownerChips = PRESETS.filter((p) => p.owner).map(makeChip);
  const classicChips = PRESETS.filter((p) => !p.owner).map(makeChip);
  const chips = [...ownerChips, ...classicChips];

  /** Locks follow the session, so signing in unlocks without a reload. */
  function paintLocks(): void {
    const pro = isPro(session.tier);
    for (const chip of chips) {
      const locked = !pro && !planFor(session.tier).presets.includes(chip.dataset.preset ?? '');
      chip.classList.toggle('is-locked', locked);
      chip.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
    targetSeg.lock((v) => !targetAllowed(session.tier, v as LoudnessTarget));
    formatSeg.lock((v) => !formatAllowed(session.tier, v as OutputFormat));
  }

  const railLabel = (text: string, count: number): HTMLElement =>
    el(
      'div',
      { class: 'rail-label mono' },
      el('span', { text }),
      el('b', { text: String(count).padStart(2, '0') }),
    );

  // The owner edition is the first thing in reach; the 14 classics stay one
  // swipe below so muscle memory still works.
  const rail = el(
    'div',
    { class: 'rail-stack' },
    railLabel('EDISI OWNER', ownerChips.length),
    el('div', { class: 'rail' }, ownerChips),
    railLabel('KLASIK', classicChips.length),
    el('div', { class: 'rail' }, classicChips),
  );

  const chainTags = el('div', { class: 'chain-tags' });

  const presetPlate = el(
    'div',
    { class: 'plate source-plate' },
    sectionHead('01', 'ARSENAL CEPAT'),
    rail,
    chainTags,
    el(
      'div',
      { class: 'row', style: 'gap:8px' },
      button('TUNING LANJUT', {
        tone: 'ghost',
        size: 'sm',
        onClick: () => {
          window.location.hash = '#/lab';
        },
      }),
      button('SEMUA PRESET', {
        tone: 'ghost',
        size: 'sm',
        onClick: () => {
          window.location.hash = '#/arsenal';
        },
      }),
      el('span', { class: 'spacer' }),
      button('RESET', {
        tone: 'ghost',
        size: 'sm',
        icon: 'reset',
        onClick: () => {
          store.resetChain();
          update();
          toast('Rantai di-reset ke netral', 'info');
        },
      }),
    ),
  );

  // ---------------------------------------------------------------- master + render
  const targetSeg = segmented(
    (Object.keys(TARGET_META) as (keyof typeof TARGET_META)[]).map((k) => ({
      value: k,
      label: TARGET_META[k].label,
      sub: TARGET_META[k].lufs ? `${TARGET_META[k].lufs} LUFS` : 'BYPASS',
      locked: !targetAllowed(session.tier, k),
    })),
    store.edit.target,
    (v) => {
      store.setOutput({ target: v as typeof store.edit.target });
      Haptics.tap();
      update();
    },
    () => openPaywall(upgradeHint('target'), 'clubTarget'),
  );

  // Every format SYSTEM offers, in the same order, with the same locks. The old
  // row had three chips and drew WAV 16 as WAV 24, so a free user could pick a
  // legal format and see a paid one highlighted here.
  const formatSeg = segmented(
    formatChoices(session.tier).map((c) => ({
      value: c.value,
      label: c.label,
      locked: c.locked,
    })),
    store.edit.format,
    (v) => {
      store.setOutput({ format: v as OutputFormat });
      Haptics.tap();
      update();
    },
    () => openPaywall(upgradeHint('format'), 'lossless'),
  );

  formatSeg.wrap.dataset.role = 'format';
  targetSeg.wrap.dataset.role = 'target';

  const masterStrip = el(
    'div',
    { class: 'master-strip' },
    cell('TARGET', TARGET_META[store.edit.target].lufs ? `${TARGET_META[store.edit.target].lufs}` : 'OFF', 'LUFS'),
    cell('SPEED', store.edit.speed.toFixed(2), '×'),
    cell('SPACE', store.edit.reverbEnabled ? SPACE_META[store.edit.reverbType].label : 'DRY', ''),
  );

  function cell(label: string, value: string, unit: string): HTMLElement {
    return el(
      'div',
      { class: 'master-cell' },
      el('span', { class: 'label', text: label }),
      el('span', { class: 'value' }, el('b', { text: value }), unit ? el('small', { text: ` ${unit}` }) : null),
    );
  }

  /**
   * Free tier caps export length. Checked before the render starts so the user
   * is told immediately rather than after two minutes of DSP.
   */
  /**
   * A stored preset from a PRO session must not survive a downgrade into a free
   * export. The chips already show the lock; this is the door.
   */
  /**
   * The last door. It reads `store.edit` — the same object `forgeExport()` hands
   * to the encoder — not `settings`. The old check looked at settings, so after
   * a downgrade reset one and not the other, the gate passed and FLAC shipped.
   */
  function formatBlocked(): boolean {
    if (formatAllowed(session.tier, store.edit.format)) return false;
    openPaywall(
      `Format ${FORMAT_META[store.edit.format].label} termasuk PRO. Versi gratis memakai MP3 320 kbps dan WAV 16-bit.`,
      'lossless',
    );
    return true;
  }

  /** Loudness targets are paid above -14 LUFS; SYSTEM used to let them through. */
  function targetBlocked(): boolean {
    if (targetAllowed(session.tier, store.edit.target)) return false;
    openPaywall(
      `Target ${TARGET_META[store.edit.target].label} LUFS termasuk PRO. Versi gratis memakai OFF atau −14 LUFS.`,
      'clubTarget',
    );
    return true;
  }

  /** One guard for both RENDER buttons (plate and mobile dock). */
  function exportBlocked(): boolean {
    return presetBlocked() || formatBlocked() || targetBlocked() || durationBlocked();
  }

  function presetBlocked(): boolean {
    const active = store.edit.activePreset ?? '';
    if (!active || !presetLocked(session.tier, active)) return false;
    openPaywall(
      `Preset aktif termasuk arsenal PRO. Pilih satu dari empat preset gratis, atau buka PRO untuk memakai seluruh arsenal.`,
      'allPresets',
    );
    return true;
  }

  function durationBlocked(): boolean {
    const plan = planFor(session.tier);
    if (!store.source) return false;
    if (plan.limits.maxMinutes === Infinity) return false;
    const end = store.edit.trimEnd > 0 ? store.edit.trimEnd : store.source.duration;
    const seconds = end - store.edit.trimStart;
    if (seconds <= plan.limits.maxMinutes * 60) return false;
    openPaywall(
      `Versi gratis dibatasi ${plan.limits.maxMinutes} menit per render. Rekam ini ${(seconds / 60).toFixed(1)} menit — PRO membuka durasi penuh.`,
      'batchQueue',
    );
    return true;
  }

  const forgingLabel = el('span', { class: 'forge__go', text: 'RENDER →' });
  const forgeSub = el('span', { class: 'forge__sub', text: 'SIAP' });
  const forgeBtn = el(
    'button',
    {
      class: 'forge',
      attrs: { type: 'button' },
      on: {
        click: () => {
          if (exportBlocked()) return;
          Haptics.heavy();
          void forgeExport().then(() => update());
        },
      },
    },
    el('span', { class: 'forge__icon', html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>` }),
    el('span', { class: 'forge__body' }, el('span', { class: 'forge__title', text: 'RENDER' }), forgeSub),
    forgingLabel,
  );

  const forgePlate = el(
    'div',
    { class: 'plate bracket source-plate' },
    sectionHead('02', 'MASTER & OUTPUT'),
    el('div', { class: 'label', text: 'TARGET LOUDNESS', style: 'margin-bottom:6px' }),
    targetSeg.wrap,
    el('div', { class: 'label', text: 'FORMAT', style: 'margin:12px 0 6px' }),
    formatSeg.wrap,
    el('div', { style: 'height:12px' }),
    masterStrip,
    el('div', { style: 'height:12px' }),
    forgeBtn,
    el('div', {
      class: 'footnote',
      style: 'margin-top:8px;text-align:left',
      text: 'Trim gain statis + limiter true-peak −1.2 dB. Tidak ada loudnorm dinamis.',
    }),
  );

  // ---------------------------------------------------------------- progress
  const stagePips = STAGE_ORDER.map((_, i) => {
    const pip = el('div', { class: 'stage-pip' });
    pip.style.setProperty('--i', String(i));
    return pip;
  });
  const progressFill = el('div', { class: 'meter__fill' });
  const progressStage = el('span', { class: 'progress-plate__stage', text: 'IDLE' });
  const progressPct = el('span', { class: 'progress-plate__pct', text: '0%' });
  const progressNote = el('div', {
    class: 'progress-plate__note',
    text: 'Proses berjalan di perangkat — jangan kunci layar untuk hasil tercepat.',
  });
  const progressPlate = el(
    'div',
    { class: 'progress-plate hidden', attrs: { 'aria-live': 'polite' } },
    el('div', { class: 'progress-plate__head' }, progressStage, progressPct),
    el('div', { class: 'meter' }, progressFill),
    el('div', { class: 'stages' }, stagePips),
    progressNote,
  );

  // ---------------------------------------------------------------- report
  const reportHost = el('div', { class: 'stack' });
  let reportRef: unknown = null;

  // ---------------------------------------------------------------- scope + pipeline rail
  const scope = createScope();
  const scopeTelemetry = el('div', { class: 'telemetry' });

  const lufsValue = el('b', { text: '—' });
  const lufsFill = el('div', { class: 'lufs-meter__fill' });
  const lufsTarget = el('div', { class: 'lufs-meter__target' });
  const lufsMeter = el(
    'div',
    { class: 'lufs-meter', attrs: { 'aria-label': 'Loudness preview' } },
    el(
      'div',
      { class: 'lufs-meter__head' },
      el('span', { text: 'LUFS · PREVIEW' }),
      lufsValue,
    ),
    el('div', { class: 'lufs-meter__track' }, lufsFill, lufsTarget),
    el(
      'div',
      { class: 'lufs-meter__scale' },
      el('span', { text: '−36' }),
      el('span', { text: '−21' }),
      el('span', { text: '−14' }),
      el('span', { text: '−6' }),
    ),
  );

  const scopePlate = el(
    'div',
    { class: 'plate source-plate' },
    sectionHead('03', 'SIGNAL SCOPE'),
    scope.el,
    lufsMeter,
    el('div', { style: 'height:10px' }),
    scopeTelemetry,
  );

  /** Maps LUFS onto the meter's −36…−6 window. */
  function updateLoudness(): void {
    const stats = getPreviewStats();
    const target = TARGET_META[store.edit.target].lufs;
    const pctOf = (lufs: number): number => Math.max(0, Math.min(100, ((lufs + 36) / 30) * 100));
    lufsTarget.style.left = target == null ? '66.6%' : `${pctOf(target)}%`;
    lufsMeter.dataset.stale = String(!store.previewReady);
    if (!stats || stats.lufs == null) {
      lufsValue.textContent = '—';
      lufsFill.style.width = '0%';
      lufsMeter.dataset.state = 'idle';
      return;
    }
    const pct = pctOf(stats.lufs);
    lufsFill.style.width = `${pct}%`;
    animateValue(
      lufsValue,
      stats.lufs,
      (n) => `${n.toFixed(1)} LUFS · TP ${stats.truePeak.toFixed(1)}`,
    );
    lufsMeter.dataset.state = target != null && stats.lufs > target + 1 ? 'over' : 'ok';
  }

  const pipelineList = el('div', { class: 'pipeline' });
  const hashLine = el('div', { class: 'report__hash', text: 'HASH —' });
  const pipelinePlate = el(
    'div',
    { class: 'plate source-plate' },
    sectionHead('04', 'PIPELINE'),
    pipelineList,
    hashLine,
  );

  const quickPlate = el(
    'div',
    { class: 'plate source-plate' },
    sectionHead('05', 'SESI'),
    el('div', { class: 'master-strip' },
      cell('DURASI', '—', ''),
      cell('SUMBER', '—', ''),
      cell('PREVIEW', 'STALE', ''),
    ),
  );
  const sessionStrip = quickPlate.querySelector('.master-strip') as HTMLElement;

  // ---------------------------------------------------------------- mobile dock
  const dockRingHost = document.createElement('div');
  dockRingHost.className = 'ring';
  dockRingHost.setAttribute('aria-hidden', 'true');
  setHtml(
    dockRingHost,
    '<svg viewBox="0 0 44 44"><circle class="ring__track" cx="22" cy="22" r="18"/><circle class="ring__value" cx="22" cy="22" r="18"/></svg>',
  );
  const ringValue = dockRingHost.querySelector('.ring__value') as SVGCircleElement;
  const ringPct = el('span', { class: 'ring__pct', text: 'GO' });
  dockRingHost.appendChild(ringPct);

  const dockPreset = el('span', { class: 'dock__preset', text: 'RANTAI KUSTOM' });
  const dockMeta = el('span', { class: 'dock__meta', text: 'SIAP' });
  const dockBtn = el(
    'button',
    {
      class: 'dock__btn',
      attrs: { type: 'button', 'aria-label': 'Render hasil' },
      on: {
        click: () => {
          if (exportBlocked()) return;
          Haptics.heavy();
          void forgeExport().then(() => update());
        },
      },
    },
    dockRingHost,
    el('span', { text: 'RENDER' }),
  );

  const dock = el(
    'div',
    { class: 'dock', attrs: { role: 'region', 'aria-label': 'Aksi cepat' } },
    el('div', { class: 'dock__info' }, dockPreset, dockMeta),
    dockBtn,
  );

  // ---------------------------------------------------------------- screen
  const screen = el(
    'section',
    { class: 'screen', id: 'screen-deck', attrs: { 'aria-label': 'Render audio' } },
    el(
      'div',
      { class: 'screen__intro' },
      el(
        'div',
        {},
        el('div', { class: 'screen__kicker', text: 'AEGIS SOUND LAB · RENDER' }),
        el('h1', { class: 'screen__title', html: 'OLAH <em>LAGU</em>' }),
      ),
      el('div', { class: 'header__meta' },
        el('span', { class: 'chip' }, el('b', { text: '48 kHz · 32-BIT FLOAT' })),
      ),
    ),
    el(
      'div',
      { class: 'grid grid--deck' },
      el(
        'div',
        { class: 'stack' },
        sourcePlate,
        presetPlate,
        forgePlate,
        progressPlate,
        reportHost,
      ),
      el('div', { class: 'stack' }, scopePlate, pipelinePlate, quickPlate),
    ),
  );

  // ---------------------------------------------------------------- behaviour
  async function togglePlay(): Promise<void> {
    if (!store.source) {
      toast('Muat audio dulu', 'err');
      return;
    }
    if (player.playing) {
      player.pause();
      updateTransport();
      return;
    }
    if (!store.previewReady) {
      toast('Merender preview…', 'info', 1800);
      const t0 = performance.now();
      const audio = await renderPreview();
      if (!audio) {
        toast('Preview gagal dirender', 'err');
        return;
      }
      player.load(audio);
      scope.setData(audio.left, audio.right, audio.sampleRate);
      toast(`Preview siap · ${Math.round(performance.now() - t0)} ms`, 'ok', 1600);
      updateScopeTelemetry(audio);
    }
    void player.play(player.duration > 0 ? Math.min(player.position, player.duration - 0.05) : 0);
    updateTransport();
  }

  player.onTick = (t) => {
    wave.setPlayhead(t);
    const total = player.duration;
    timeLabel.textContent = `${formatDuration(t, true)} / ${formatDuration(total, true)}`;
    scrubFill.style.width = `${total > 0 ? (t / total) * 100 : 0}%`;
  };
  player.onEnd = () => {
    wave.setPlayhead(null);
    updateTransport();
  };

  scrub.addEventListener('click', (ev) => {
    if (!player.duration) return;
    const rect = scrub.getBoundingClientRect();
    player.seek(((ev.clientX - rect.left) / rect.width) * player.duration);
  });

  function updateTransport(): void {
    setHtml(
      playBtn,
      `<span class="ico-inline">${
        player.playing
          ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'
          : '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5l11 7-11 7z"/></svg>'
      }</span>`,
    );
    playBtn.setAttribute('aria-label', player.playing ? 'Jeda preview' : 'Putar hasil');
    wave.el.classList.toggle('is-playing', player.playing);
    if (!player.playing) {
      const total = player.duration;
      timeLabel.textContent = `${formatDuration(player.position, true)} / ${formatDuration(total, true)}`;
    }
  }

  function updateScopeTelemetry(audio: { left: Float32Array; right: Float32Array; sampleRate: number }): void {
    let peak = 0;
    const step = Math.max(1, Math.floor(audio.left.length / 20000));
    for (let i = 0; i < audio.left.length; i += step) {
      const v = Math.max(Math.abs(audio.left[i]), Math.abs(audio.right[i]));
      if (v > peak) peak = v;
    }
    const tp = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    setHtml(
      scopeTelemetry,
      `
      <span class="dot"></span>
      <span>SR <b>${(audio.sampleRate / 1000).toFixed(1)}k</b></span>
      <span>CH <b>2</b></span>
      <span>LEN <b>${formatDuration(audio.left.length / audio.sampleRate)}</b></span>
      <span>TP <b>${Number.isFinite(tp) ? tp.toFixed(1) : '−∞'} dB</b></span>`,
    );
  }

  function tag(label: string, value: string, on = true): HTMLElement {
    return el(
      'span',
      { class: `tag${on ? ' tag--on' : ''}` },
      el('span', { text: label }),
      el('b', { text: value }),
    );
  }

  function pipelineRow(label: string, value: string, active: boolean): HTMLElement {
    return el(
      'div',
      { class: 'pipe-row' },
      el('span', { class: `pipe-dot${active ? ' is-on' : ''}` }),
      el('span', { class: 'pipe-label', text: label }),
      el('span', { class: 'pipe-value mono', text: value }),
    );
  }

  /**
   * One row per chain stage, in engine order. The labels come from `chain.ts`,
   * so the rail and the landing page cannot name the same process differently.
   */
  function stageRow(stage: ChainStage): HTMLElement {
    const s = store.edit;
    const dur = store.source?.duration ?? 0;
    const end = s.trimEnd > 0 ? s.trimEnd : dur;
    const trimmed = s.trimStart > 0.01 || (dur > 0 && end < dur - 0.01);
    const timeOn = Math.abs(s.speed - 1) > 0.001;
    switch (stage.id) {
      case 'clean':
        return pipelineRow(stage.label, 'HPF 24 Hz', true);
      case 'repair':
        return pipelineRow(
          stage.label,
          s.voiceMode ? 'VOICE FOCUS' : s.denoise ? `DENOISE ${Math.round(s.denoiseAmount * 100)}%` : 'OFF',
          s.denoise || s.voiceMode,
        );
      case 'trim':
        return pipelineRow(stage.label, trimmed ? `${formatDuration(s.trimStart)}–${formatDuration(end)}` : 'PENUH', trimmed);
      case 'time':
        return pipelineRow(
          stage.label,
          timeOn ? `${s.speed.toFixed(2)}× ${SPEED_MODE_META[s.speedMode].label}` : 'BYPASS',
          timeOn,
        );
      case 'tone':
        return pipelineRow(stage.label, toneSummary(), toneActive());
      case 'space':
        return pipelineRow(
          stage.label,
          s.reverbEnabled ? `${SPACE_META[s.reverbType].label} ${Math.round(s.reverbLevel * 100)}%` : 'DRY',
          s.reverbEnabled,
        );
      case 'orbit':
        return pipelineRow(
          stage.label,
          s.spatial8d ? `${s.spinRate.toFixed(2)} Hz · ${Math.round(s.depth * 100)}%` : 'OFF',
          s.spatial8d,
        );
      case 'warmth':
        return pipelineRow(stage.label, s.warmth > 0.02 ? `TAPE ${Math.round(s.warmth * 100)}%` : 'CLEAN', s.warmth > 0.02);
      case 'mono':
        return pipelineRow(stage.label, s.monoBass ? '≤ 120 Hz' : 'OFF', s.monoBass);
      case 'deess':
        return pipelineRow(stage.label, s.deEsser ? '5–9 kHz' : 'OFF', s.deEsser);
      case 'master':
        return pipelineRow(
          stage.label,
          s.target === 'off' ? 'PEAK ONLY' : `${TARGET_META[s.target].label} LUFS`,
          true,
        );
      default:
        return pipelineRow(stage.label, '−1.2 dBTP', true);
    }
  }

  function updatePipeline(): void {
    const rows = CHAIN_STAGES.map(stageRow);
    const pipeSig = rows.map((r) => r.textContent).join('|');
    if (pipeSig !== lastPipeSig) {
      lastPipeSig = pipeSig;
      rows.forEach((row, i) => row.style.setProperty('--i', String(i)));
      pipelineList.replaceChildren(...rows);
    }
  }

  function toneActive(): boolean {
    const s = store.edit;
    return s.bass > 0.01 || s.sub > 0.01 || s.clarity > 0.01 || s.presence > 0.01 || s.air > 0.01 || s.lowpass > 0.01;
  }

  function toneSummary(): string {
    const s = store.edit;
    const parts: string[] = [];
    if (s.bass > 0.01) parts.push(`BASS +${Math.round(s.bass * 100)}`);
    if (s.sub > 0.01) parts.push(`SUB +${Math.round(s.sub * 100)}`);
    if (s.clarity > 0.01) parts.push(`CLR +${Math.round(s.clarity * 100)}`);
    if (s.presence > 0.01) parts.push(`PRS +${Math.round(s.presence * 100)}`);
    if (s.air > 0.01) parts.push(`AIR +${Math.round(s.air * 100)}`);
    if (s.lowpass > 0.01) parts.push(`LP ${Math.round(s.lowpass * 100)}`);
    return parts.length ? parts.join(' · ') : 'FLAT';
  }

  function updateReport(): void {
    const status = store.status;
    progressPlate.classList.toggle('hidden', !status.active);
    if (status.active) {
      progressStage.textContent = status.stage;
      progressPct.textContent = `${Math.round(status.progress * 100)}%`;
      progressFill.style.width = `${status.progress * 100}%`;
      // The chain has six groups and thirteen possible reports; map them in
      // chain.ts so the bar cannot freeze on a stage the list forgot.
      const idx = stageGroupIndex(status.stage);
      const last = STAGE_ORDER.length - 1;
      stagePips.forEach((pip, i) =>
        pip.classList.toggle('is-done', idx >= 0 ? i <= Math.min(idx, last) : status.progress > 0.7),
      );
      forgeBtn.setAttribute('disabled', 'true');
      forgeBtn.dataset.busy = 'true';
      forgeSub.textContent = `${status.stage} · ${Math.round(status.progress * 100)}%`;
      forgingLabel.textContent = 'PROCESSING';
    } else {
      forgeBtn.removeAttribute('disabled');
      forgeBtn.dataset.busy = 'false';
      forgeSub.textContent = store.source
        ? `${FORMAT_META[store.edit.format].label}${FORMAT_META[store.edit.format].lossy ? ` · ${store.edit.bitrate}K` : ''} · ${TARGET_META[store.edit.target].label}${TARGET_META[store.edit.target].lufs ? ' LUFS' : ''}`
        : 'MUAT AUDIO DULU';
      forgingLabel.textContent = 'RENDER →';
    }

    const report = status.report;
    if (!report) {
      if (status.error) {
        reportHost.replaceChildren(
          el(
            'div',
            { class: 'plate source-plate', style: 'border-color:var(--crimson)' },
            sectionHead('!', 'RENDER GAGAL'),
            el('p', { class: 'lab-group__note', text: status.error }),
          ),
        );
        reportRef = status;
      } else {
        reportHost.replaceChildren();
        reportRef = null;
      }
      return;
    }
    if (reportRef === report) return;
    const firstReport = reportRef === null;
    reportRef = report;

    if (firstReport) {
      const anchor = dockBtn.getBoundingClientRect();
      const anchorVisible = anchor.width > 0 && anchor.bottom > 0 && anchor.top < window.innerHeight;
      const rect = anchorVisible ? anchor : forgeBtn.getBoundingClientRect();
      burst(rect.left + rect.width / 2, rect.top + rect.height / 2, 40);
      scramble(dockPreset, 'RENDER READY', 520);
    }

    const card = el(
      'div',
      { class: 'plate bracket report' },
      el(
        'div',
        { class: 'report__head' },
        el('span', { class: 'badge badge--signal' }, icon('check', 10), el('span', { text: 'SELESAI' })),
        el('strong', { class: 'report__title', text: 'MANIFEST' }),
        el('span', { class: 'spacer' }),
        el('span', { class: 'badge', text: report.format }),
      ),
      el(
        'div',
        { class: 'report__grid' },
        reportCell('LOUDNESS', report.lufs == null ? '—' : `${report.lufs.toFixed(1)} LUFS`),
        reportCell('TRUE PEAK', `${report.truePeak.toFixed(1)} dB`),
        reportCell('TRIM', `${report.trimDb >= 0 ? '+' : ''}${report.trimDb.toFixed(2)} dB`),
        reportCell('DURASI', formatDuration(report.duration, true)),
        reportCell('UKURAN', formatBytes(report.bytes)),
        reportCell('SIMPAN', report.where === 'documents' ? 'DOKUMEN' : 'DOWNLOAD'),
      ),
      el('div', { class: 'report__hash', text: `FINGERPRINT ${report.hash}` }),
      el(
        'div',
        { class: 'report__actions' },
        button('BAGIKAN', {
          tone: 'primary',
          icon: 'share',
          onClick: () => {
            void shareLast().then((ok) => {
              toast(ok ? 'Share sheet dibuka' : 'Share tidak tersedia di perangkat ini', ok ? 'ok' : 'err');
            });
          },
        }),
        button('SALIN NAMA', {
          tone: 'ghost',
          icon: 'copy',
          onClick: () => {
            void navigator.clipboard?.writeText(report.name).then(
              () => toast('Nama file disalin', 'ok', 1500),
              () => toast('Clipboard ditolak', 'err', 2000),
            );
          },
        }),
      ),
    );
    reportHost.replaceChildren(card);
  }

  function reportCell(label: string, value: string): HTMLElement {
    return el('div', {}, el('span', { text: label }), el('b', { text: value }));
  }

  let lastSourceRef: SourceInfo | null = null;
  let lastPreset: string | null = null;
  let lastTagSig = '';
  let lastPipeSig = '';

  function update(): void {
    const hasSource = !!store.source;
    drop.classList.toggle('hidden', hasSource);
    loaded.classList.toggle('hidden', !hasSource);

    if (store.source && lastSourceRef !== store.source) {
      lastSourceRef = store.source;
      sourceName.textContent = store.source.name;
      sourceName.title = store.source.name;
      sourceMeta.textContent = `${formatDuration(store.source.duration, true)} · ${formatRate(store.source.sampleRate)} · ${store.source.channels === 1 ? 'MONO' : 'STEREO'} · ${formatBytes(store.source.size)}`;
      wave.redraw();
    }
    if (!store.source) {
      lastSourceRef = null;
      sourceName.textContent = '';
      sourceMeta.textContent = '';
    }

    if (lastPreset !== store.edit.activePreset) {
      lastPreset = store.edit.activePreset;
      const activeName = presetById(store.edit.activePreset)?.name;
      for (const chip of chips) {
        const name = chip.querySelector('.preset-chip__name')?.textContent ?? '';
        chip.setAttribute('aria-pressed', String(name === activeName));
      }
      if (activeName) {
        const active = chips.find((c) => c.getAttribute('aria-pressed') === 'true');
        active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      }
    }

    const tagSig = [
      store.edit.speed, store.edit.speedMode, store.edit.reverbEnabled, store.edit.reverbType,
      store.edit.spatial8d, store.edit.bass, store.edit.sub, store.edit.air, store.edit.warmth,
      store.edit.denoiseAmount, store.edit.denoise, store.edit.voiceMode, store.edit.deEsser,
      store.edit.monoBass, store.edit.fadeIn, store.edit.fadeOut, store.edit.finalGain,
    ].join(':');

    const tags: HTMLElement[] = [];
    if (Math.abs(store.edit.speed - 1) > 0.001) {
      tags.push(tag('TIME', `${store.edit.speed.toFixed(2)}× ${store.edit.speedMode === 'retro' ? 'R' : 'M'}`));
    }
    if (store.edit.reverbEnabled) tags.push(tag('SPACE', `${SPACE_META[store.edit.reverbType].label} ${Math.round(store.edit.reverbLevel * 100)}%`));
    if (store.edit.spatial8d) tags.push(tag('8D', `${store.edit.spinRate.toFixed(2)}Hz`));
    if (toneActive()) tags.push(tag('TONE', toneSummary()));
    if (store.edit.warmth > 0.02) tags.push(tag('WARMTH', `${Math.round(store.edit.warmth * 100)}%`));
    if (store.edit.deEsser) tags.push(tag('DE-ESS', 'ON'));
    if (store.edit.monoBass) tags.push(tag('MONO', '<120Hz'));
    if (store.edit.denoise) tags.push(tag('REPAIR', `${Math.round(store.edit.denoiseAmount * 100)}%`));
    if (store.edit.voiceMode) tags.push(tag('VOICE', 'FOCUS'));
    if (store.edit.fadeIn > 0.05 || store.edit.fadeOut > 0.05) tags.push(tag('FADE', `${store.edit.fadeIn.toFixed(1)}/${store.edit.fadeOut.toFixed(1)}s`));
    if (Math.abs(store.edit.finalGain - 1) > 0.01) tags.push(tag('GAIN', `${(20 * Math.log10(store.edit.finalGain)).toFixed(1)}dB`));
    if (store.edit.denoise && store.edit.voiceMode) tags.push(tag('REPAIR', 'VOICE MODE'));
    if (tags.length === 0) tags.push(el('span', { class: 'tag', text: 'RANTAI NETRAL' }));
    if (tagSig !== lastTagSig) {
      lastTagSig = tagSig;
      tags.forEach((node, i) => node.style.setProperty('--i', String(i)));
      chainTags.replaceChildren(...tags);
    }

    targetSeg.set(store.edit.target);
    formatSeg.set(store.edit.format);

    const cells = masterStrip.querySelectorAll('.master-cell');
    setCell(cells[0], TARGET_META[store.edit.target].lufs ? `${TARGET_META[store.edit.target].lufs}` : 'OFF', TARGET_META[store.edit.target].lufs ? 'LUFS' : '');
    setCell(cells[1], store.edit.speed.toFixed(2), '×');
    setCell(cells[2], store.edit.reverbEnabled ? SPACE_META[store.edit.reverbType].label : 'DRY', store.edit.reverbEnabled ? `${Math.round(store.edit.reverbLevel * 100)}%` : '');

    const sessionCells = sessionStrip.querySelectorAll('.master-cell');
    setCell(sessionCells[0], store.source ? formatDuration(processedLength()) : '—', '');
    setCell(sessionCells[1], store.source ? `${(store.source.sampleRate / 1000).toFixed(1)}k` : '—', 'Hz');
    setCell(sessionCells[2], store.previewReady ? 'FRESH' : store.previewBusy ? 'BUSY' : 'STALE', '');

    const lossy = FORMAT_META[store.edit.format].lossy;
    hashLine.textContent = `PREVIEW ${store.previewReady ? 'READY' : store.previewBusy ? 'RENDERING' : 'STALE'} · ${Math.round(store.edit.speed * 100)}% · ${FORMAT_META[store.edit.format].label}${lossy ? ` ${store.edit.bitrate}K` : ''}`;

    // decoding skeleton
    skeleton.hidden = !(store.status.stage === 'DECODE' && !store.source);

    // mobile dock mirrors the deck state
    const active = store.status.active;
    const presetName = presetById(store.edit.activePreset)?.name ?? 'CUSTOM CHAIN';
    if (dockPreset.dataset.value !== presetName) {
      dockPreset.dataset.value = presetName;
      scramble(dockPreset, presetName, 480);
    }
    dockMeta.textContent = active
      ? `${store.status.stage} · ${Math.round(store.status.progress * 100)}%`
      : `${store.edit.speed.toFixed(2)}× · ${FORMAT_META[store.edit.format].label} · ${TARGET_META[store.edit.target].lufs ?? 'OFF'} LUFS`;
    const pct = active ? Math.max(0, Math.min(1, store.status.progress)) : 0;
    ringValue.style.strokeDashoffset = String(113.1 * (1 - pct));
    if (active) {
      animateValue(ringPct, pct * 100, (n) => `${Math.round(n)}%`, { duration: 260 });
    } else if (ringPct.textContent !== 'GO') {
      ringPct.textContent = 'GO';
    }
    dockBtn.toggleAttribute('disabled', !store.source || active);
    dockBtn.setAttribute('aria-busy', String(active));
    dock.classList.toggle('is-busy', active);

    updateLoudness();
    wave.redraw();
    updatePipeline();
    updateReport();
    updateTransport();
  }

  function processedLength(): number {
    if (!store.source) return 0;
    const end = store.edit.trimEnd > 0 ? Math.min(store.edit.trimEnd, store.source.duration) : store.source.duration;
    const window = Math.max(0, end - store.edit.trimStart) / Math.max(0.01, store.edit.speed);
    return window;
  }

  function setCell(cell: Element | undefined, value: string, unit: string): void {
    if (!cell) return;
    const v = cell.querySelector('.value');
    if (!v) return;
    const numeric = Number(value);
    if (value.trim() !== '' && Number.isFinite(numeric)) {
      // Keep the trailing unit node, tween only the number.
      let target = v.querySelector('b') as HTMLElement | null;
      if (!target) {
        v.replaceChildren();
        target = document.createElement('b');
        v.append(target);
        if (unit) {
          const small = document.createElement('small');
          small.textContent = ` ${unit}`;
          v.append(small);
        }
      }
      animateValue(target, numeric, (n) => {
        const digits = Math.abs(n) >= 100 ? 0 : String(value).includes('.') ? 2 : 0;
        return digits === 0 ? String(Math.round(n)) : n.toFixed(digits);
      });
      target.classList.remove('is-ticking');
      void target.offsetWidth;
      target.classList.add('is-ticking');
      return;
    }
    v.replaceChildren();
    v.append(document.createTextNode(value));
    if (unit) {
      const small = document.createElement('small');
      small.textContent = ` ${unit}`;
      v.append(small);
    }
  }

  store.subscribe(update);
  session.subscribe(() => {
    paintLocks();
    update();
  });
  paintLocks();
  update();

  return {
    el: screen,
    overlay: dock,
    update,
    onEnter: () => {
      wave.redraw();
      updateLoudness();
      update();
    },
  };
}

import { PRESETS, presetById } from '../../model/presets';
import { FORMAT_META, SPEED_MODE_META, TARGET_META, SPACE_META } from '../../model/settings';
import type { SourceInfo } from '../../model/settings';
import { store } from '../../state/store';
import { forgeExport, loadSource, renderPreview, shareLast } from '../../state/forge';
import { formatBytes, formatDuration, formatRate } from '../../io/audioFile';
import { PreviewPlayer } from '../../io/player';
import { Haptics } from '../haptics';
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

const STAGE_ORDER = ['CLEAN', 'TONE', 'SPACE', 'WARMTH', 'MASTER', 'LIMIT'];

export interface Screen {
  el: HTMLElement;
  update(): void;
  onEnter?(): void;
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
    el('div', { class: 'drop__title', text: 'DROP AUDIO' }),
    el('div', {
      class: 'drop__hint',
      html: 'MP3 · WAV · FLAC · OGG · M4A/AAC · OPUS<br/><b>Semua diproses di perangkat. Nol upload.</b>',
    }),
    button('PILIH FILE', { tone: 'primary', size: 'sm', onClick: () => fileInput.click() }),
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

  const sourcePlate = el(
    'div',
    { class: 'plate bracket bracket--lg source-plate' },
    el('div', { class: 'rivets' }),
    drop,
    loaded,
    fileInput,
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
  const chips = PRESETS.map((preset) =>
    el(
      'button',
      {
        class: `preset-chip preset-chip--${preset.accent}`,
        attrs: { type: 'button', 'aria-pressed': 'false', title: preset.detail },
        on: {
          click: () => {
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
    ),
  );

  const rail = el('div', { class: 'rail' }, chips);

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
          toast('Chain di-reset ke netral', 'info');
        },
      }),
    ),
  );

  // ---------------------------------------------------------------- master + forge
  const targetSeg = segmented(
    (Object.keys(TARGET_META) as (keyof typeof TARGET_META)[]).map((k) => ({
      value: k,
      label: TARGET_META[k].label,
      sub: TARGET_META[k].lufs ? `${TARGET_META[k].lufs} LUFS` : 'BYPASS',
    })),
    store.edit.target,
    (v) => {
      store.patchEdit({ target: v as typeof store.edit.target });
      Haptics.tap();
      update();
    },
  );

  const formatSeg = segmented(
    (['mp3', 'wav24', 'flac'] as const).map((f) => ({
      value: f,
      label: FORMAT_META[f].label,
      sub: FORMAT_META[f].spec,
    })),
    store.edit.format === 'wav16' || store.edit.format === 'wav32' ? 'wav24' : store.edit.format,
    (v) => {
      store.patchEdit({ format: v as typeof store.edit.format });
      store.patchSettings({ format: v as typeof store.edit.format });
      Haptics.tap();
      update();
    },
  );

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

  const forgingLabel = el('span', { class: 'forge__go', text: 'RENDER →' });
  const forgeSub = el('span', { class: 'forge__sub', text: 'SIAP' });
  const forgeBtn = el(
    'button',
    {
      class: 'forge',
      attrs: { type: 'button' },
      on: {
        click: () => {
          Haptics.heavy();
          void forgeExport().then(() => update());
        },
      },
    },
    el('span', { class: 'forge__icon', html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>` }),
    el('span', { class: 'forge__body' }, el('span', { class: 'forge__title', text: 'FORGE' }), forgeSub),
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
  const stagePips = STAGE_ORDER.map(() => el('div', { class: 'stage-pip' }));
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

  const scopePlate = el(
    'div',
    { class: 'plate source-plate' },
    sectionHead('03', 'SIGNAL SCOPE'),
    scope.el,
    el('div', { style: 'height:10px' }),
    scopeTelemetry,
  );

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

  // ---------------------------------------------------------------- screen
  const screen = el(
    'section',
    { class: 'screen', id: 'screen-deck', attrs: { 'aria-label': 'Forge deck' } },
    el(
      'div',
      { class: 'screen__intro' },
      el(
        'div',
        {},
        el('div', { class: 'screen__kicker', text: 'AEGIS-M / FORGE DECK' }),
        el('h1', { class: 'screen__title', html: 'FORGE <em>DECK</em>' }),
      ),
      el('div', { class: 'header__meta' },
        el('span', { class: 'chip chip--live' }, el('b', { text: 'OFFLINE DSP' })),
      ),
    ),
    el(
      'div',
      { class: 'grid grid--deck' },
      el(
        'div',
        { class: 'stack stagger' },
        sourcePlate,
        presetPlate,
        forgePlate,
        progressPlate,
        reportHost,
      ),
      el('div', { class: 'stack stagger' }, scopePlate, pipelinePlate, quickPlate),
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
    playBtn.innerHTML = `<span style="display:inline-flex">${
      player.playing
        ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5l11 7-11 7z"/></svg>'
    }</span>`;
    playBtn.setAttribute('aria-label', player.playing ? 'Jeda preview' : 'Putar hasil');
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
    scopeTelemetry.innerHTML = `
      <span class="dot"></span>
      <span>SR <b>${(audio.sampleRate / 1000).toFixed(1)}k</b></span>
      <span>CH <b>2</b></span>
      <span>LEN <b>${formatDuration(audio.left.length / audio.sampleRate)}</b></span>
      <span>TP <b>${Number.isFinite(tp) ? tp.toFixed(1) : '−∞'} dB</b></span>`;
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

  function updatePipeline(): void {
    const s = store.edit;
    const rows = [
      pipelineRow('TIME', Math.abs(s.speed - 1) > 0.001 ? `${s.speed.toFixed(2)}× ${SPEED_MODE_META[s.speedMode].label}` : 'BYPASS', Math.abs(s.speed - 1) > 0.001),
      pipelineRow('SPACE', s.reverbEnabled ? `${SPACE_META[s.reverbType].label} ${Math.round(s.reverbLevel * 100)}%` : 'DRY', s.reverbEnabled),
      pipelineRow('ORBIT', s.spatial8d ? `${s.spinRate.toFixed(2)} Hz · ${Math.round(s.depth * 100)}%` : 'OFF', s.spatial8d),
      pipelineRow('TONE', toneSummary(), toneActive()),
      pipelineRow('REPAIR', s.voiceMode ? 'VOICE FOCUS' : s.denoise ? `DENOISE ${Math.round(s.denoiseAmount * 100)}%` : 'OFF', s.denoise || s.voiceMode),
      pipelineRow('DYNAMICS', s.warmth > 0.02 ? `TAPE ${Math.round(s.warmth * 100)}%` : s.deEsser ? 'DE-ESS' : 'CLEAN', s.warmth > 0.02 || s.deEsser || s.monoBass),
      pipelineRow('MASTER', s.target === 'off' ? 'PEAK ONLY' : `${TARGET_META[s.target].label} LUFS`, true),
      pipelineRow('LIMIT', '−1.2 dBTP', true),
    ];
    pipelineList.replaceChildren(...rows);
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
      const idx = STAGE_ORDER.indexOf(status.stage);
      stagePips.forEach((pip, i) => pip.classList.toggle('is-done', idx >= 0 ? i <= idx : status.progress > 0.7));
      forgeBtn.setAttribute('disabled', 'true');
      forgeSub.textContent = `${status.stage} · ${Math.round(status.progress * 100)}%`;
      forgingLabel.textContent = 'PROCESSING';
    } else {
      forgeBtn.removeAttribute('disabled');
      forgeSub.textContent = store.source
        ? `${FORMAT_META[store.edit.format].label} · ${store.edit.bitrate}K · ${TARGET_META[store.edit.target].label}${TARGET_META[store.edit.target].lufs ? ' LUFS' : ''}`
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
    reportRef = report;

    const card = el(
      'div',
      { class: 'plate bracket report' },
      el(
        'div',
        { class: 'report__head' },
        el('span', { class: 'badge badge--signal' }, icon('check', 10), el('span', { text: 'FORGED' })),
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

  function update(): void {
    const hasSource = !!store.source;
    drop.classList.toggle('hidden', hasSource);
    loaded.classList.toggle('hidden', !hasSource);

    if (store.source && lastSourceRef !== store.source) {
      lastSourceRef = store.source;
      sourceName.textContent = store.source.name;
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
    if (tags.length === 0) tags.push(el('span', { class: 'tag', text: 'CHAIN NETRAL' }));
    chainTags.replaceChildren(...tags);

    targetSeg.set(store.edit.target);
    formatSeg.set(store.edit.format === 'wav16' || store.edit.format === 'wav32' ? 'wav24' : store.edit.format);

    const cells = masterStrip.querySelectorAll('.master-cell');
    setCell(cells[0], TARGET_META[store.edit.target].lufs ? `${TARGET_META[store.edit.target].lufs}` : 'OFF', TARGET_META[store.edit.target].lufs ? 'LUFS' : '');
    setCell(cells[1], store.edit.speed.toFixed(2), '×');
    setCell(cells[2], store.edit.reverbEnabled ? SPACE_META[store.edit.reverbType].label : 'DRY', store.edit.reverbEnabled ? `${Math.round(store.edit.reverbLevel * 100)}%` : '');

    const sessionCells = sessionStrip.querySelectorAll('.master-cell');
    setCell(sessionCells[0], store.source ? formatDuration(processedLength()) : '—', '');
    setCell(sessionCells[1], store.source ? `${(store.source.sampleRate / 1000).toFixed(1)}k` : '—', 'Hz');
    setCell(sessionCells[2], store.previewReady ? 'FRESH' : store.previewBusy ? 'BUSY' : 'STALE', '');

    hashLine.textContent = `PREVIEW ${store.previewReady ? 'READY' : store.previewBusy ? 'RENDERING' : 'STALE'} · ${Math.round(store.edit.speed * 100)}% · ${FORMAT_META[store.edit.format].label} ${store.edit.bitrate}K`;

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
    v.innerHTML = '';
    v.append(document.createTextNode(value));
    if (unit) {
      const small = document.createElement('small');
      small.textContent = ` ${unit}`;
      v.append(small);
    }
  }

  store.subscribe(update);
  update();

  return {
    el: screen,
    update,
    onEnter: () => {
      wave.redraw();
      update();
    },
  };
}

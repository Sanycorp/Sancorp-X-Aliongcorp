import { SPEED_MODE_META, SPACE_META, NEUTRAL } from '../../model/settings';
import type { EditSettings, ReverbType, SpeedMode } from '../../model/settings';
import { store } from '../../state/store';
import { Haptics } from '../haptics';
import { session } from '../../state/session';
import { can, upgradeHint } from '../../model/tiers';
import { openPaywall } from '../account';
import { button, el, fader, icon, sectionHead, segmented, toast, toggle } from '../elements';
import { HELP, SECTION_HELP } from '../../model/help';
import type { HelpKey } from '../../model/help';
import type { Screen } from './deck';

type NumericKey = {
  [K in keyof EditSettings]: EditSettings[K] extends number ? K : never;
}[keyof EditSettings];

interface FaderBinding {
  set: (v: number) => void;
  key: NumericKey;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const mult = (v: number): string => `${v.toFixed(2)}×`;
const secs = (v: number): string => (v < 0.05 ? 'OFF' : `${v.toFixed(1)}s`);
const db = (v: number): string => {
  const d = 20 * Math.log10(Math.max(0.001, v));
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)} dB`;
};
const hz = (v: number): string => (v < 1 ? `${v.toFixed(3)} Hz` : `${v.toFixed(2)} Hz`);

export function createLab(): Screen {
  const bindings: FaderBinding[] = [];
  const syncers: (() => void)[] = [];
  let pending: Partial<EditSettings> = {};

  const commit = (): void => {
    if (Object.keys(pending).length === 0) return;
    store.patchEdit(pending);
    pending = {};
    Haptics.tap();
  };

  /**
   * One section: a number, a plain-language heading, a reset of exactly this
   * group, the controls, and a folded guide that explains each control in the
   * same words the fader already uses.
   */
  function group(opts: {
    index: string;
    id: string;
    title: string;
    body: HTMLElement;
    resetKeys: (keyof EditSettings)[];
    helpKeys: HelpKey[];
  }): HTMLElement {
    const help = SECTION_HELP[opts.id];

    const reset = el(
      'button',
      {
        class: 'lab-reset',
        attrs: { type: 'button', 'aria-label': `Reset ${opts.title} ke setelan awal`, title: `Reset ${opts.title}` },
        on: {
          click: () => {
            store.resetSection(opts.resetKeys);
            Haptics.tap();
            toast(`${opts.title} dikembalikan ke awal`, 'info', 1500);
          },
        },
      },
      icon('reset', 13),
      el('span', { text: 'RESET' }),
    );

    const guide = el(
      'details',
      { class: 'lab-guide' },
      el('summary', {}, icon('help', 13), el('span', { text: 'Apa maksud kontrol di bagian ini?' })),
      help ? el('p', { class: 'lab-guide__when', text: help.when }) : null,
      el(
        'dl',
        { class: 'lab-guide__list' },
        ...opts.helpKeys.flatMap((key) => {
          const entry = HELP[key];
          return [
            el('dt', { text: entry.term }),
            el(
              'dd',
              {},
              el('p', { text: entry.what }),
              el('p', { class: 'lab-guide__more', text: entry.more }),
              el('p', { class: 'lab-guide__tip', text: `Mulai dari: ${entry.tip}` }),
            ),
          ];
        }),
      ),
    );

    const plate = el(
      'div',
      { class: 'plate lab-group', attrs: { id: `tune-${opts.id}` } },
      el('div', { class: 'lab-group__top' }, sectionHead(opts.index, opts.title), reset),
      el('p', { class: 'lab-group__plain', text: help ? help.plain : '' }),
      opts.body,
      guide,
    );
    plate.dataset.section = opts.id;
    return plate;
  }

  function addFader(
    parent: HTMLElement,
    key: NumericKey,
    label: string,
    opts: {
      min: number;
      max: number;
      step: number;
      format: (v: number) => string;
      hint?: string;
      bipolar?: boolean;
      detent?: number;
    },
  ): void {
    const f = fader({
      label,
      min: opts.min,
      max: opts.max,
      step: opts.step,
      value: store.edit[key],
      format: opts.format,
      hint: opts.hint,
      bipolar: opts.bipolar,
      // Every control now has a neutral value, so a double tap on the slider
      // returns it to where the preset engine starts. This is the "reset per
      // control" the panel promised, without a second button per fader.
      detent: opts.detent ?? (NEUTRAL[key] as number),
      onInput: (v) => {
        (store.edit as unknown as Record<string, number>)[key] = v;
        pending[key] = v as never;
      },
      onChange: commit,
    });
    bindings.push({ key, set: (v) => f.set(v) });
    parent.appendChild(f.wrap);
  }

  // ------------------------------------------------------------------ TIME
  const timeInner = el('div', { class: 'lab-group__body' });
  const timeGroup = group({
    index: '01',
    id: 'time',
    title: 'WAKTU',
    body: timeInner,
    resetKeys: ['speed', 'speedMode', 'fadeIn', 'fadeOut'],
    helpKeys: ['speed', 'speedMode', 'fadeIn', 'fadeOut'],
  });

  addFader(timeInner, 'speed', 'KECEPATAN', {
    min: 0.5,
    max: 2,
    step: 0.01,
    format: mult,
    hint: HELP.speed.what,
  });
  addFader(timeInner, 'fadeIn', 'FADE MASUK', {
    min: 0,
    max: 8,
    step: 0.1,
    format: secs,
    hint: HELP.fadeIn.what,
  });
  addFader(timeInner, 'fadeOut', 'FADE KELUAR', {
    min: 0,
    max: 12,
    step: 0.1,
    format: secs,
    hint: HELP.fadeOut.what,
  });

  const modeSeg = segmented(
    (Object.keys(SPEED_MODE_META) as SpeedMode[]).map((k) => ({
      value: k,
      label: k === 'modern' ? 'NADA TETAP' : 'NADA IKUT TURUN',
    })),
    store.edit.speedMode,
    (v) => {
      store.patchEdit({ speedMode: v as SpeedMode });
      Haptics.tap();
    },
  );
  timeInner.appendChild(
    el(
      'div',
      { class: 'lab-field' },
      el('span', { class: 'lab-field__label', text: 'CARA MEMPERLAMBAT' }),
      modeSeg.wrap,
      el('span', { class: 'lab-field__hint', text: HELP.speedMode.what }),
    ),
  );

  // ----------------------------------------------------------------- SPACE
  const spaceInner = el('div', { class: 'lab-group__body' });
  const spaceGroup = group({
    index: '02',
    id: 'space',
    title: 'RUANG',
    body: spaceInner,
    resetKeys: ['reverbEnabled', 'reverbType', 'reverbLevel', 'reverbRoom', 'reverbDamp'],
    helpKeys: ['reverbEnabled', 'reverbType', 'reverbLevel', 'reverbRoom', 'reverbDamp'],
  });

  const reverbToggle = toggle('GEMA', store.edit.reverbEnabled, (v) => {
    store.patchEdit({ reverbEnabled: v });
    Haptics.tap();
  });
  spaceInner.appendChild(
    el(
      'div',
      { class: 'lab-field' },
      reverbToggle.wrap,
      el('span', { class: 'lab-field__hint', text: HELP.reverbEnabled.what }),
    ),
  );

  const spaceSeg = segmented(
    (Object.keys(SPACE_META) as ReverbType[]).map((k) => ({ value: k, label: SPACE_META[k].label })),
    store.edit.reverbType,
    (v) => {
      store.patchEdit({ reverbType: v as ReverbType });
      Haptics.tap();
    },
  );
  spaceInner.appendChild(
    el(
      'div',
      { class: 'lab-field' },
      el('span', { class: 'lab-field__label', text: 'JENIS RUANGAN' }),
      spaceSeg.wrap,
      el('span', { class: 'lab-field__hint', text: HELP.reverbType.what }),
    ),
  );

  addFader(spaceInner, 'reverbLevel', 'SEND · BANYAK GEMA', {
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
    hint: HELP.reverbLevel.what,
  });
  addFader(spaceInner, 'reverbRoom', 'RUANG · BESARNYA', {
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
    hint: HELP.reverbRoom.what,
  });
  addFader(spaceInner, 'reverbDamp', 'REDAM · KEGELAPAN', {
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
    hint: HELP.reverbDamp.what,
  });

  // ----------------------------------------------------------------- ORBIT
  const orbitInner = el('div', { class: 'lab-group__body' });
  const orbitGroup = group({
    index: '03',
    id: 'orbit',
    title: 'GERAK 8D',
    body: orbitInner,
    resetKeys: ['spatial8d', 'spinRate', 'depth', 'width'],
    helpKeys: ['spatial8d', 'spinRate', 'depth', 'width'],
  });

  const orbitToggle = toggle('PUTARAN 8D', store.edit.spatial8d, (v) => {
    if (v && !can(session.tier, 'orbit8d')) {
      orbitToggle.set(false);
      openPaywall(upgradeHint('orbit8d'), 'orbit8d');
      return;
    }
    store.patchEdit({ spatial8d: v });
    Haptics.tap();
  });
  orbitInner.appendChild(
    el(
      'div',
      { class: 'lab-field' },
      orbitToggle.wrap,
      el('span', { class: 'lab-field__hint', text: HELP.spatial8d.what }),
    ),
  );

  addFader(orbitInner, 'spinRate', 'KECEPATAN PUTAR', {
    min: 0.02,
    max: 0.5,
    step: 0.005,
    format: hz,
    hint: HELP.spinRate.what,
  });
  addFader(orbitInner, 'depth', 'JARAK AYUNAN', { min: 0, max: 1, step: 0.01, format: pct, hint: HELP.depth.what });
  addFader(orbitInner, 'width', 'LEBAR STEREO', {
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
    bipolar: true,
    detent: 0.5,
    hint: HELP.width.what,
  });

  // ------------------------------------------------------------------ TONE
  const toneInner = el('div', { class: 'lab-group__body' });
  const toneGroup = group({
    index: '04',
    id: 'tone',
    title: 'NADA',
    body: toneInner,
    resetKeys: ['bass', 'bassFreq', 'sub', 'clarity', 'presence', 'air', 'lowpass'],
    helpKeys: ['bass', 'bassFreq', 'sub', 'clarity', 'presence', 'air', 'lowpass'],
  });

  addFader(toneInner, 'bass', 'BASS · TEBAL', { min: 0, max: 1, step: 0.01, format: pct, hint: HELP.bass.what });
  addFader(toneInner, 'bassFreq', 'TITIK BASS', {
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => `${Math.round(80 + 120 * v)} Hz`,
    hint: HELP.bassFreq.what,
  });
  addFader(toneInner, 'sub', 'SUB · PALING RENDAH', { min: 0, max: 1, step: 0.01, format: pct, hint: HELP.sub.what });
  addFader(toneInner, 'clarity', 'KEJERNIHAN', { min: 0, max: 1, step: 0.01, format: pct, hint: HELP.clarity.what });
  addFader(toneInner, 'presence', 'KEHADIRAN', { min: 0, max: 1, step: 0.01, format: pct, hint: HELP.presence.what });
  addFader(toneInner, 'air', 'UDARA', { min: 0, max: 1, step: 0.01, format: pct, hint: HELP.air.what });
  addFader(toneInner, 'lowpass', 'POTONG TREBLE', { min: 0, max: 1, step: 0.01, format: pct, hint: HELP.lowpass.what });

  // -------------------------------------------------------------- DYNAMICS
  const dynInner = el('div', { class: 'lab-group__body' });
  const dynGroup = group({
    index: '05',
    id: 'dynamics',
    title: 'KARAKTER',
    body: dynInner,
    resetKeys: ['warmth', 'finalGain', 'deEsser', 'monoBass'],
    helpKeys: ['warmth', 'finalGain', 'deEsser', 'monoBass'],
  });

  addFader(dynInner, 'warmth', 'KEHANGATAN', { min: 0, max: 1, step: 0.01, format: pct, hint: HELP.warmth.what });
  addFader(dynInner, 'finalGain', 'VOLUME AKHIR', {
    min: 0.25,
    max: 4,
    step: 0.01,
    format: db,
    detent: 1,
    hint: HELP.finalGain.what,
  });

  const deEssToggle = toggle('PEREDAM "S"', store.edit.deEsser, (v) => {
    store.patchEdit({ deEsser: v });
    Haptics.tap();
  });
  dynInner.appendChild(
    el(
      'div',
      { class: 'lab-field' },
      deEssToggle.wrap,
      el('span', { class: 'lab-field__hint', text: HELP.deEsser.what }),
    ),
  );

  const monoToggle = toggle('BASS MONO', store.edit.monoBass, (v) => {
    store.patchEdit({ monoBass: v });
    Haptics.tap();
  });
  dynInner.appendChild(
    el(
      'div',
      { class: 'lab-field' },
      monoToggle.wrap,
      el('span', { class: 'lab-field__hint', text: HELP.monoBass.what }),
    ),
  );

  // ---------------------------------------------------------------- REPAIR
  const repairInner = el('div', { class: 'lab-group__body' });
  const repairGroup = group({
    index: '06',
    id: 'repair',
    title: 'PERBAIKAN',
    body: repairInner,
    resetKeys: ['denoise', 'denoiseAmount', 'voiceMode', 'normalizeInput'],
    helpKeys: ['denoise', 'denoiseAmount', 'voiceMode', 'normalizeInput'],
  });

  const denoiseToggle = toggle('PEMBERSIH DESIS', store.edit.denoise, (v) => {
    if (v && !can(session.tier, 'repair')) {
      denoiseToggle.set(false);
      openPaywall(upgradeHint('repair'), 'repair');
      return;
    }
    store.patchEdit({ denoise: v });
    Haptics.tap();
  });
  repairInner.appendChild(
    el(
      'div',
      { class: 'lab-field' },
      denoiseToggle.wrap,
      el('span', { class: 'lab-field__hint', text: HELP.denoise.what }),
    ),
  );
  addFader(repairInner, 'denoiseAmount', 'KEKUATAN BERSIH', {
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
    hint: HELP.denoiseAmount.what,
  });

  const voiceToggle = toggle('FOKUS VOKAL', store.edit.voiceMode, (v) => {
    if (v && !can(session.tier, 'repair')) {
      voiceToggle.set(false);
      openPaywall(upgradeHint('repair'), 'repair');
      return;
    }
    store.patchEdit({ voiceMode: v });
    Haptics.tap();
  });
  repairInner.appendChild(
    el(
      'div',
      { class: 'lab-field' },
      voiceToggle.wrap,
      el('span', { class: 'lab-field__hint', text: HELP.voiceMode.what }),
    ),
  );

  const normToggle = toggle('SAMAKAN VOLUME AWAL', store.edit.normalizeInput, (v) => {
    store.patchEdit({ normalizeInput: v });
    Haptics.tap();
  });
  repairInner.appendChild(
    el(
      'div',
      { class: 'lab-field' },
      normToggle.wrap,
      el('span', { class: 'lab-field__hint', text: HELP.normalizeInput.what }),
    ),
  );

  // ---------------------------------------------------------------- A / B
  const abNote = el('div', {
    class: 'lab-group__note',
    text: 'B: dengarkan bedanya tanpa kehilangan yang sudah kamu buat. A = pegangan awal, B = percobaan.',
  });
  const slotALabel = el('span', { text: store.slotA ? 'TERISI' : 'KOSONG' });
  const slotBLabel = el('span', { text: store.slotB ? 'TERISI' : 'KOSONG' });

  const slotA = el(
    'button',
    {
      class: 'ab-slot',
      attrs: { type: 'button' },
      on: {
        click: () => {
          if (!can(session.tier, 'abMemory')) {
            openPaywall(upgradeHint('abMemory'), 'abMemory');
            return;
          }
          if (store.slotA) {
            store.recallSlot('A');
            toast('Versi A dipanggil', 'ok', 1400);
            Haptics.tap();
          } else {
            store.storeSlot('A');
            slotALabel.textContent = 'TERISI';
            toast('Setelan disimpan ke A', 'ok', 1400);
            Haptics.tap();
          }
        },
      },
    },
    el('b', { text: store.slotA ? 'PAKAI A' : 'SIMPAN A' }),
    slotALabel,
  );
  const slotB = el(
    'button',
    {
      class: 'ab-slot',
      attrs: { type: 'button' },
      on: {
        click: () => {
          if (!can(session.tier, 'abMemory')) {
            openPaywall(upgradeHint('abMemory'), 'abMemory');
            return;
          }
          if (store.slotB) {
            store.recallSlot('B');
            toast('Versi B dipanggil', 'ok', 1400);
            Haptics.tap();
          } else {
            store.storeSlot('B');
            slotBLabel.textContent = 'TERISI';
            toast('Setelan disimpan ke B', 'ok', 1400);
            Haptics.tap();
          }
        },
      },
    },
    el('b', { text: store.slotB ? 'PAKAI B' : 'SIMPAN B' }),
    slotBLabel,
  );

  const abReset = el(
    'button',
    {
      class: 'lab-reset',
      attrs: { type: 'button', 'aria-label': 'Kosongkan simpanan A dan B', title: 'Kosongkan simpanan A dan B' },
      on: {
        click: () => {
          store.clearSlots();
          slotALabel.textContent = 'KOSONG';
          slotBLabel.textContent = 'KOSONG';
          Haptics.tap();
          toast('Simpanan A dan B dikosongkan', 'info', 1500);
        },
      },
    },
    icon('reset', 13),
    el('span', { text: 'RESET' }),
  );

  const abGroup = el(
    'div',
    { class: 'plate lab-group', attrs: { id: 'tune-ab' } },
    el('div', { class: 'lab-group__top' }, sectionHead('07', 'BANDINGKAN'), abReset),
    el('p', { class: 'lab-group__plain', text: 'Simpan dua versi, lalu pilih mana yang lebih enak didengar.' }),
    el('div', { class: 'ab-row' }, slotA, slotB),
    abNote,
    el(
      'div',
      { class: 'ab-actions' },
      button('SIMPAN ULANG A', {
        tone: 'ghost',
        size: 'sm',
        onClick: () => {
          store.storeSlot('A');
          slotALabel.textContent = 'TERISI';
          toast('Setelan disimpan ke A', 'ok', 1400);
        },
      }),
      button('SIMPAN ULANG B', {
        tone: 'ghost',
        size: 'sm',
        onClick: () => {
          store.storeSlot('B');
          slotBLabel.textContent = 'TERISI';
          toast('Setelan disimpan ke B', 'ok', 1400);
        },
      }),
    ),
  );

  // ---------------------------------------------------------------- screen
  const jump = el(
    'nav',
    { class: 'lab-jump', attrs: { 'aria-label': 'Lompat ke bagian' } },
    ...[
      ['time', 'Waktu'],
      ['space', 'Ruang'],
      ['orbit', '8D'],
      ['tone', 'Nada'],
      ['dynamics', 'Karakter'],
      ['repair', 'Perbaikan'],
      ['ab', 'Bandingkan'],
    ].map(([id, label]) =>
      el('button', {
        class: 'lab-jump__btn',
        text: label,
        attrs: { type: 'button' },
        on: {
          click: () => {
            document.getElementById(`tune-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            Haptics.tap();
          },
        },
      }),
    ),
  );

  const guideToggle = toggle('TAMPILKAN PENJELASAN', true, (v) => {
    screen.classList.toggle('lab--tersembunyi', !v);
  });

  const screen = el(
    'section',
    { class: 'screen', id: 'screen-lab', attrs: { 'aria-label': 'Tuning rantai' } },
    el(
      'div',
      { class: 'screen__intro' },
      el(
        'div',
        {},
        el('div', { class: 'screen__kicker', text: 'AEGIS SOUND LAB · TUNING' }),
        el('h1', { class: 'screen__title', html: 'ATUR <em>SUARA</em>' }),
      ),
      el('div', { class: 'header__meta' }, el('span', { class: 'chip', text: 'PREVIEW = HASIL' })),
    ),
    el('p', {
      class: 'screen__desc',
      text: 'Geser apa pun di sini dan hasil akhirnya sama persis dengan yang kamu dengar saat menekan play. Tidak perlu paham istilah teknis: setiap kontrol punya penjelasan satu baris, dan setiap bagian punya tombol RESET.',
    }),
    el('div', { class: 'lab-toolbar' }, guideToggle.wrap),
    jump,
    el(
      'div',
      { class: 'grid grid--lab' },
      timeGroup,
      spaceGroup,
      orbitGroup,
      toneGroup,
      dynGroup,
      repairGroup,
      abGroup,
    ),
    el('div', { class: 'footnote', text: 'Ketuk dua kali sebuah slider untuk mengembalikannya ke setelan awal.' }),
  );

  const syncToggles = (): void => {
    reverbToggle.set(store.edit.reverbEnabled);
    orbitToggle.set(store.edit.spatial8d);
    deEssToggle.set(store.edit.deEsser);
    monoToggle.set(store.edit.monoBass);
    denoiseToggle.set(store.edit.denoise);
    voiceToggle.set(store.edit.voiceMode);
    normToggle.set(store.edit.normalizeInput);
    spaceSeg.set(store.edit.reverbType);
    modeSeg.set(store.edit.speedMode);
    slotALabel.textContent = store.slotA ? 'TERISI' : 'KOSONG';
    slotBLabel.textContent = store.slotB ? 'TERISI' : 'KOSONG';
    (slotA.querySelector('b') as HTMLElement).textContent = store.slotA ? 'PAKAI A' : 'SIMPAN A';
    (slotB.querySelector('b') as HTMLElement).textContent = store.slotB ? 'PAKAI B' : 'SIMPAN B';
  };
  syncers.push(syncToggles);

  function update(): void {
    for (const b of bindings) b.set(store.edit[b.key]);
    syncToggles();
  }

  const paintLabLocks = (): void => {
    const pro = session.tier !== 'free';
    for (const node of [orbitToggle.wrap, denoiseToggle.wrap, voiceToggle.wrap, abGroup]) {
      node.classList.toggle('is-locked', !pro);
      node.setAttribute('aria-disabled', pro ? 'false' : 'true');
    }
  };
  session.subscribe(paintLabLocks);
  paintLabLocks();

  store.subscribe(update);
  update();

  return { el: screen, update };
}

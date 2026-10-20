import { SPEED_MODE_META, SPACE_META } from '../../model/settings';
import type { EditSettings, ReverbType, SpeedMode } from '../../model/settings';
import { store } from '../../state/store';
import { Haptics } from '../haptics';
import { button, el, fader, sectionHead, segmented, toast, toggle } from '../elements';
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

  function group(index: string, title: string, note: string, body: (HTMLElement | null)[]): HTMLElement {
    return el(
      'div',
      { class: 'plate lab-group' },
      sectionHead(index, title),
      el('div', { class: 'lab-group__body' }, body),
      el('div', { class: 'lab-group__note', text: note }),
    );
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
      detent: opts.detent,
      onInput: (v) => {
        (store.edit as unknown as Record<string, number>)[key] = v;
        pending[key] = v as never;
      },
      onChange: commit,
    });
    bindings.push({
      key,
      set: (v) => f.set(v),
    });
    parent.appendChild(f.wrap);
  }

  // ------------------------------------------------------------------ TIME
  const timeBody: HTMLElement[] = [];
  const timeGroup = group(
    '01',
    'TIME',
    'RETRO ikat pitch ke tempo (tape). MODERN pakai WSOLA — pitch tetap.',
    timeBody,
  );

  addFader(timeGroup.querySelector('.lab-group__body') as HTMLElement, 'speed', 'SPEED', {
    min: 0.5,
    max: 2,
    step: 0.01,
    format: mult,
    detent: 1,
    hint: '0.50× −12 st · 1.00× original · 2.00× +12 st',
  });
  addFader(timeGroup.querySelector('.lab-group__body') as HTMLElement, 'fadeIn', 'FADE IN', {
    min: 0,
    max: 8,
    step: 0.1,
    format: secs,
  });
  addFader(timeGroup.querySelector('.lab-group__body') as HTMLElement, 'fadeOut', 'FADE OUT', {
    min: 0,
    max: 12,
    step: 0.1,
    format: secs,
  });

  const modeSeg = segmented(
    (Object.keys(SPEED_MODE_META) as SpeedMode[]).map((k) => ({
      value: k,
      label: SPEED_MODE_META[k].label,
    })),
    store.edit.speedMode,
    (v) => {
      store.patchEdit({ speedMode: v as SpeedMode });
      Haptics.tap();
    },
  );
  (timeGroup.querySelector('.lab-group__body') as HTMLElement).appendChild(modeSeg.wrap);

  // ----------------------------------------------------------------- SPACE
  const spaceBody: HTMLElement[] = [];
  const spaceGroup = group(
    '02',
    'SPACE',
    'FDN 8-line · Hadamard feedback · RT60 dipetakan ke room size.',
    spaceBody,
  );
  const spaceInner = spaceGroup.querySelector('.lab-group__body') as HTMLElement;

  const reverbToggle = toggle('REVERB', store.edit.reverbEnabled, (v) => {
    store.patchEdit({ reverbEnabled: v });
    Haptics.tap();
  });
  spaceInner.appendChild(reverbToggle.wrap);

  const spaceSeg = segmented(
    (Object.keys(SPACE_META) as ReverbType[]).map((k) => ({ value: k, label: SPACE_META[k].label })),
    store.edit.reverbType,
    (v) => {
      store.patchEdit({ reverbType: v as ReverbType });
      Haptics.tap();
    },
  );
  spaceInner.appendChild(spaceSeg.wrap);

  addFader(spaceInner, 'reverbLevel', 'SEND', { min: 0, max: 1, step: 0.01, format: pct });
  addFader(spaceInner, 'reverbRoom', 'ROOM', { min: 0, max: 1, step: 0.01, format: pct });
  addFader(spaceInner, 'reverbDamp', 'DAMP', { min: 0, max: 1, step: 0.01, format: pct });

  // ----------------------------------------------------------------- ORBIT
  const orbitBody: HTMLElement[] = [];
  const orbitGroup = group('03', 'ORBIT', 'Rotasi stereo dengan kompensasi level ±4.2 dB.', orbitBody);
  const orbitInner = orbitGroup.querySelector('.lab-group__body') as HTMLElement;

  const orbitToggle = toggle('8D ORBIT', store.edit.spatial8d, (v) => {
    store.patchEdit({ spatial8d: v });
    Haptics.tap();
  });
  orbitInner.appendChild(orbitToggle.wrap);

  addFader(orbitInner, 'spinRate', 'RATE', { min: 0.02, max: 0.5, step: 0.005, format: hz });
  addFader(orbitInner, 'depth', 'DEPTH', { min: 0, max: 1, step: 0.01, format: pct });
  addFader(orbitInner, 'width', 'WIDTH', { min: 0, max: 1, step: 0.01, format: pct, bipolar: true, detent: 0.5 });

  // ------------------------------------------------------------------ TONE
  const toneBody: HTMLElement[] = [];
  const toneGroup = group('04', 'TONE', 'Semua filter RBJ biquad, diproses in-place per blok.', toneBody);
  const toneInner = toneGroup.querySelector('.lab-group__body') as HTMLElement;

  addFader(toneInner, 'bass', 'BASS', { min: 0, max: 1, step: 0.01, format: pct, hint: 'Lowshelf 80–200 Hz' });
  addFader(toneInner, 'bassFreq', 'BASS FREQ', { min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(80 + 120 * v)} Hz` });
  addFader(toneInner, 'sub', 'SUB', { min: 0, max: 1, step: 0.01, format: pct, hint: 'Lowshelf 55 Hz' });
  addFader(toneInner, 'clarity', 'CLARITY', { min: 0, max: 1, step: 0.01, format: pct, hint: 'Cut 680 Hz — buka ruang mid' });
  addFader(toneInner, 'presence', 'PRESENCE', { min: 0, max: 1, step: 0.01, format: pct, hint: 'Peaking 2.8 kHz' });
  addFader(toneInner, 'air', 'AIR', { min: 0, max: 1, step: 0.01, format: pct, hint: 'Highshelf 8 kHz' });
  addFader(toneInner, 'lowpass', 'LOW PASS', { min: 0, max: 1, step: 0.01, format: pct, hint: '20 kHz → 120 Hz' });

  // -------------------------------------------------------------- DYNAMICS
  const dynBody: HTMLElement[] = [];
  const dynGroup = group('05', 'DYNAMICS', 'Saturasi soft-knee, mono bass < 120 Hz, de-esser 5–9 kHz.', dynBody);
  const dynInner = dynGroup.querySelector('.lab-group__body') as HTMLElement;

  addFader(dynInner, 'warmth', 'WARMTH', { min: 0, max: 1, step: 0.01, format: pct });
  addFader(dynInner, 'finalGain', 'OUT GAIN', { min: 0.25, max: 4, step: 0.01, format: db, detent: 1 });

  const deEssToggle = toggle('DE-ESSER', store.edit.deEsser, (v) => {
    store.patchEdit({ deEsser: v });
    Haptics.tap();
  });
  dynInner.appendChild(deEssToggle.wrap);

  const monoToggle = toggle('MONO BASS', store.edit.monoBass, (v) => {
    store.patchEdit({ monoBass: v });
    Haptics.tap();
  });
  dynInner.appendChild(monoToggle.wrap);

  // ---------------------------------------------------------------- REPAIR
  const repairBody: HTMLElement[] = [];
  const repairGroup = group(
    '06',
    'REPAIR',
    'Denoise STFT 1024/256 dengan Wiener mask. Voice focus = band-limit + de-noise ringan.',
    repairBody,
  );
  const repairInner = repairGroup.querySelector('.lab-group__body') as HTMLElement;

  const denoiseToggle = toggle('DENOISE', store.edit.denoise, (v) => {
    store.patchEdit({ denoise: v });
    Haptics.tap();
  });
  repairInner.appendChild(denoiseToggle.wrap);
  addFader(repairInner, 'denoiseAmount', 'AMOUNT', { min: 0, max: 1, step: 0.01, format: pct });

  const voiceToggle = toggle('VOICE FOCUS', store.edit.voiceMode, (v) => {
    store.patchEdit({ voiceMode: v });
    Haptics.tap();
  });
  repairInner.appendChild(voiceToggle.wrap);

  const normToggle = toggle('NORMALIZE INPUT', store.edit.normalizeInput, (v) => {
    store.patchEdit({ normalizeInput: v });
    Haptics.tap();
  });
  repairInner.appendChild(normToggle.wrap);

  // ---------------------------------------------------------------- A / B
  const abNote = el('div', { class: 'lab-group__note', text: 'Simpan dua versi chain lalu bandingkan tanpa kehilangan setelan.' });
  const slotALabel = el('span', { text: store.slotA ? 'TERISI' : 'KOSONG' });
  const slotBLabel = el('span', { text: store.slotB ? 'TERISI' : 'KOSONG' });

  const slotA = el(
    'button',
    {
      class: 'ab-slot',
      attrs: { type: 'button' },
      on: {
        click: () => {
          if (store.slotA) {
            store.recallSlot('A');
            toast('Slot A dipanggil', 'ok', 1400);
            Haptics.tap();
          } else {
            store.storeSlot('A');
            slotALabel.textContent = 'TERISI';
            toast('Chain disimpan ke A', 'ok', 1400);
            Haptics.tap();
          }
        },
      },
    },
    el('b', { text: store.slotA ? 'RECALL A' : 'STORE A' }),
    slotALabel,
  );
  const slotB = el(
    'button',
    {
      class: 'ab-slot',
      attrs: { type: 'button' },
      on: {
        click: () => {
          if (store.slotB) {
            store.recallSlot('B');
            toast('Slot B dipanggil', 'ok', 1400);
            Haptics.tap();
          } else {
            store.storeSlot('B');
            slotBLabel.textContent = 'TERISI';
            toast('Chain disimpan ke B', 'ok', 1400);
            Haptics.tap();
          }
        },
      },
    },
    el('b', { text: store.slotB ? 'RECALL B' : 'STORE B' }),
    slotBLabel,
  );

  const abGroup = el(
    'div',
    { class: 'plate lab-group' },
    sectionHead('07', 'A / B MEMORY'),
    el('div', { class: 'ab-row' }, slotA, slotB),
    abNote,
    el(
      'div',
      { style: 'display:grid; gap:8px; margin-top:10px' },
      button('SIMPAN ULANG A', { tone: 'ghost', size: 'sm', onClick: () => {
        store.storeSlot('A');
        slotALabel.textContent = 'TERISI';
        toast('Chain disimpan ke A', 'ok', 1400);
      } }),
      button('SIMPAN ULANG B', { tone: 'ghost', size: 'sm', onClick: () => {
        store.storeSlot('B');
        slotBLabel.textContent = 'TERISI';
        toast('Chain disimpan ke B', 'ok', 1400);
      } }),
      button('RESET CHAIN', { tone: 'ghost', size: 'sm', icon: 'reset', onClick: () => {
        store.resetChain();
        toast('Chain di-reset', 'info', 1400);
      } }),
    ),
  );

  const screen = el(
    'section',
    { class: 'screen', id: 'screen-lab', attrs: { 'aria-label': 'Lab tuning' } },
    el(
      'div',
      { class: 'screen__intro' },
      el(
        'div',
        {},
        el('div', { class: 'screen__kicker', text: 'AEGIS-M / ENGINEERING BAY' }),
        el('h1', { class: 'screen__title', html: 'TUNING <em>LAB</em>' }),
      ),
      el('div', { class: 'header__meta' }, el('span', { class: 'chip', text: 'SAME DSP AS EXPORT' })),
    ),
    el(
      'p',
      { class: 'screen__desc', style: 'margin-bottom:14px' },
      'Setiap perubahan di sini memakai rantai DSP yang sama persis dengan hasil export. Geser → preview dihitung ulang saat kamu menekan play.',
    ),
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
    el('div', { class: 'footnote', text: 'DSP 32-bit float · 48 kHz · limiter true-peak −1.2 dBTP · trim statis' }),
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
    (slotA.querySelector('b') as HTMLElement).textContent = store.slotA ? 'RECALL A' : 'STORE A';
    (slotB.querySelector('b') as HTMLElement).textContent = store.slotB ? 'RECALL B' : 'STORE B';
  };
  syncers.push(syncToggles);

  function update(): void {
    for (const b of bindings) b.set(store.edit[b.key]);
    syncToggles();
  }

  store.subscribe(update);
  update();

  return { el: screen, update };
}

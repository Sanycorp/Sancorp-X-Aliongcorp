import { PRESETS, presetById } from '../../model/presets';
import type { Preset, PresetTag } from '../../model/presets';
import { NEUTRAL, SPACE_META, TARGET_META } from '../../model/settings';
import { store } from '../../state/store';
import { Haptics } from '../haptics';
import { session } from '../../state/session';
import { presetAllowed, upgradeHint } from '../../model/tiers';
import { openPaywall } from '../account';
import { el, sectionHead, toast } from '../elements';
import type { Screen } from './deck';

const TAGS: (PresetTag | 'ALL')[] = ['ALL', 'SLOW', 'FAST', 'BASS', 'SPACE', 'REPAIR', 'SIGNATURE'];

/** One-line description of what a preset actually does to the chain. */
function summarize(preset: Preset): string {
  const s = { ...NEUTRAL };
  preset.apply(s);
  const parts: string[] = [];
  if (Math.abs(s.speed - 1) > 0.001) parts.push(`${s.speed.toFixed(2)}×`);
  if (s.speedMode === 'modern') parts.push('PITCH-LOCK');
  if (s.reverbEnabled) {
    parts.push(`${SPACE_META[s.reverbType].label} ${Math.round(s.reverbLevel * 100)}%`);
  }
  if (s.spatial8d) parts.push('8D');
  if (s.bass > 0.05) parts.push('BASS');
  if (s.sub > 0.05) parts.push('SUB');
  if (s.clarity > 0.05) parts.push('CLARITY');
  if (s.air > 0.05) parts.push('AIR');
  if (s.lowpass > 0.05) parts.push('LO-FI');
  if (s.warmth > 0.05) parts.push('WARMTH');
  if (s.denoise) parts.push(`DENOISE ${Math.round(s.denoiseAmount * 100)}%`);
  if (s.deEsser) parts.push('DE-ESS');
  if (s.target !== 'streaming') parts.push(`${TARGET_META[s.target].label} LUFS`);
  return parts.join(' · ') || 'NEUTRAL';
}

export function createArsenal(): Screen {
  let filter: PresetTag | 'ALL' = 'ALL';
  const cards = new Map<string, HTMLElement>();

  const filterRow = el(
    'div',
    { class: 'rail', style: 'padding-bottom:6px' },
    ...TAGS.map((tag) =>
      el(
        'button',
        {
          class: 'badge',
          style: 'cursor:pointer;padding:6px 10px;font-size:9px',
          attrs: { type: 'button', 'data-filter': tag, 'aria-pressed': String(tag === 'ALL') },
          on: {
            click: (ev) => {
              filter = tag;
              const row = (ev.currentTarget as HTMLElement).parentElement;
              row?.querySelectorAll('[data-filter]').forEach((n) => n.setAttribute('aria-pressed', String(n === ev.currentTarget)));
              Haptics.tap();
              applyFilter();
            },
          },
        },
        el('span', { text: tag }),
      ),
    ),
  );

  filterRow.querySelectorAll<HTMLElement>('[data-filter]').forEach((btn) => {
    const tag = btn.dataset.filter as PresetTag | 'ALL';
    if (tag === 'ALL') {
      btn.style.borderColor = 'var(--cobalt)';
      btn.style.color = 'var(--cobalt)';
      btn.style.background = 'color-mix(in srgb, var(--cobalt) 8%, var(--panel))';
    }
  });

  function applyFilter(): void {
    for (const [id, card] of cards) {
      const preset = presetById(id);
      if (!preset) continue;
      card.classList.toggle('hidden', filter !== 'ALL' && preset.tag !== filter);
    }
  }

  const grid = el('div', { class: 'arsenal-grid' });

  PRESETS.forEach((preset, index) => {
    const card = el(
      'button',
      {
        class: 'preset-card',
        attrs: { type: 'button', 'data-active': String(store.edit.activePreset === preset.name) },
        on: {
          click: () => {
            if (!presetAllowed(session.tier, preset.id)) {
              openPaywall(upgradeHint('preset'), 'allPresets', card);
              return;
            }
            store.applyPreset(preset.id, preset.apply);
            Haptics.medium();
            toast(`${preset.name} dimuat · ${preset.tagline}`, 'ok', 2000);
          },
        },
      },
      el(
        'div',
        { class: 'preset-card__top' },
        el('span', { class: 'preset-card__idx mono', text: String(index + 1).padStart(2, '0') }),
        el('span', { class: 'preset-card__name', text: preset.name }),
        el('span', { class: `preset-card__tag badge badge--${preset.accent === 'ink' ? 'cobalt' : preset.accent}`.replace('badge--signal', 'badge--signal'), text: preset.tag }),
      ),
      el('p', { class: 'preset-card__detail', text: preset.detail }),
      el('div', { class: 'preset-card__foot', text: summarize(preset) }),
      el('i', { class: 'lock lock--card', text: 'PRO', attrs: { 'aria-hidden': 'true' } }),
    );
    cards.set(preset.id, card);
    grid.appendChild(card);
  });

  const activeNote = el('div', { class: 'lab-group__note mono', text: 'ACTIVE —' });

  const screen = el(
    'section',
    { class: 'screen', id: 'screen-arsenal', attrs: { 'aria-label': 'Preset arsenal' } },
    el(
      'div',
      { class: 'screen__intro' },
      el(
        'div',
        {},
        el('div', { class: 'screen__kicker', text: 'AEGIS-M / LOADOUT' }),
        el('h1', { class: 'screen__title', html: 'PRESET <em>ARSENAL</em>' }),
      ),
      el('div', { class: 'header__meta' }, el('span', { class: 'chip' }, el('b', { text: '14' }), el('span', { text: 'VALIDATED' }))),
    ),
    el(
      'p',
      { class: 'screen__desc', style: 'margin-bottom:12px' },
      'Empat belas loadout yang sudah diuji: semuanya mendarat di −14…−16 LUFS dengan true peak ≤ −1 dBFS dan nol NaN. Pilih satu, lalu tuning di lab.',
    ),
    filterRow,
    grid,
    el('div', { style: 'height:6px' }),
    sectionHead('··', 'STATUS'),
    activeNote,
  );

  function paintLocks(): void {
    for (const [id, card] of cards) {
      const locked = !presetAllowed(session.tier, id);
      card.classList.toggle('is-locked', locked);
      card.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
  }

  function update(): void {
    paintLocks();
    const active = store.edit.activePreset;
    for (const [id, card] of cards) {
      card.setAttribute('data-active', String(presetById(id)?.name === active));
    }
    activeNote.textContent = active
      ? `ACTIVE — ${active} · SPEED ${store.edit.speed.toFixed(2)}× · ${store.edit.reverbEnabled ? `${SPACE_META[store.edit.reverbType].label} ${Math.round(store.edit.reverbLevel * 100)}%` : 'DRY'} · ${store.edit.spatial8d ? '8D' : 'NO 8D'}`
      : 'ACTIVE — CUSTOM / NEUTRAL';
  }

  store.subscribe(update);
  session.subscribe(() => {
    paintLocks();
    update();
  });
  update();
  applyFilter();

  return { el: screen, update };
}

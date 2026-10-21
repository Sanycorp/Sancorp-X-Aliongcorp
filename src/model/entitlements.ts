/**
 * What a tier is allowed to keep.
 *
 * The paid decision is one decision, not two. `settings` holds the operator's
 * default (the FORMAT DEFAULT row in SYSTEM) and `edit` holds what the encoder
 * actually reads; both used to be written separately, which is how a free
 * session could show MP3 in one place and export FLAC in the other. Everything
 * that writes them goes through `store.setOutput()`, and everything that
 * downgrades goes through the clamp below, so the two copies cannot disagree.
 *
 * Gating in the UI is a courtesy; this is the rule. Stored settings survive a
 * sign-out and can be edited by an old build, a shared device or a dev console,
 * so every entry point that matters runs the same clamp:
 *
 *   - boot and every session change (main.ts),
 *   - recalling an A/B slot or applying a preset (store.ts),
 *   - the moment RENDER is pressed (deck.ts and forge.ts, which re-clamps
 *     before the encoder is reached).
 *
 * Anything PRO-only is switched off rather than ignored, so the UI cannot show a
 * toggle that is on while the engine quietly skips it.
 */
import { formatAllowed, planFor, targetAllowed } from './tiers';
import type { Tier } from './tiers';
import { FORMAT_META, TARGET_META } from './settings';
import type { AppSettings, EditSettings, LoudnessTarget, OutputFormat } from './settings';

export interface Clamp {
  settings: Partial<AppSettings>;
  edit: Partial<EditSettings>;
}

/** The format this tier may actually export, given what was asked for. */
export function effectiveFormat(tier: Tier, wanted: OutputFormat): OutputFormat {
  return formatAllowed(tier, wanted) ? wanted : 'mp3';
}

/** The loudness target this tier may actually render, given what was asked for. */
export function effectiveTarget(tier: Tier, wanted: LoudnessTarget): LoudnessTarget {
  return targetAllowed(tier, wanted) ? wanted : 'streaming';
}

export function clampForTier(tier: Tier, settings: AppSettings, edit: EditSettings): Clamp {
  const out: Clamp = { settings: {}, edit: {} };
  if (tier === 'pro' || tier === 'admin') return out;

  if (edit.spatial8d) out.edit.spatial8d = false;
  if (edit.denoise) out.edit.denoise = false;
  if (edit.voiceMode) out.edit.voiceMode = false;

  // One output decision, mirrored into both copies. A disallowed value is
  // rewritten on both sides, so the gate and the encoder always agree.
  const format = effectiveFormat(tier, settings.format);
  if (format !== settings.format) out.settings.format = format;
  if (format !== edit.format) out.edit.format = format;

  const target = effectiveTarget(tier, settings.target);
  if (target !== settings.target) out.settings.target = target;
  if (target !== edit.target) out.edit.target = target;

  return out;
}

/** True when the chosen preset is paid and the tier is not. */
export function presetLocked(tier: Tier, presetId: string): boolean {
  return !planFor(tier).presets.includes(presetId);
}

/** Formats this tier may export, straight from the plan matrix. */
export function exportableFormats(tier: Tier): OutputFormat[] {
  return planFor(tier).formats;
}

export interface FormatChoice {
  value: OutputFormat;
  label: string;
  spec: string;
  locked: boolean;
}

/**
 * The format list both screens render. Deck and SYSTEM used to build their own
 * lists — deck offered three and quietly mapped WAV 16 onto WAV 24 — so a free
 * user could pick a legal format and see a paid one highlighted. One list now.
 */
export function formatChoices(tier: Tier): FormatChoice[] {
  return (Object.keys(FORMAT_META) as OutputFormat[]).map((value) => ({
    value,
    label: FORMAT_META[value].label,
    spec: FORMAT_META[value].spec,
    locked: !formatAllowed(tier, value),
  }));
}

export interface TargetChoice {
  value: LoudnessTarget;
  label: string;
  hint: string;
  locked: boolean;
}

export function targetChoices(tier: Tier): TargetChoice[] {
  return (Object.keys(TARGET_META) as LoudnessTarget[]).map((value) => ({
    value,
    label: TARGET_META[value].label,
    hint: TARGET_META[value].hint,
    locked: !targetAllowed(tier, value),
  }));
}

/** The render path asks this before it starts; false means "do not render". */
export function mayExport(tier: Tier, format: OutputFormat, presetId: string): boolean {
  return formatAllowed(tier, format) && !presetLocked(tier, presetId);
}

/** Every paid door checked at once, against the settings the encoder will use. */
export function mayRender(tier: Tier, edit: EditSettings): boolean {
  if (!formatAllowed(tier, edit.format)) return false;
  // A custom chain has no preset to gate; a named one has to be on the plan.
  if (edit.activePreset && presetLocked(tier, edit.activePreset)) return false;
  if (!targetAllowed(tier, edit.target)) return false;
  if (tier === 'free' && (edit.spatial8d || edit.denoise || edit.voiceMode)) return false;
  return true;
}

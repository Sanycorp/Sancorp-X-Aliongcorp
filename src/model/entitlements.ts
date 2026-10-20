/**
 * What a tier is allowed to keep.
 *
 * Gating in the UI is a courtesy; this is the rule. Stored settings survive a
 * sign-out and can be edited by an old build, a shared device or a dev console,
 * so every entry point that matters runs the same clamp:
 *
 *   - boot and every session change (main.ts),
 *   - the moment RENDER is pressed (deck.ts),
 *   - the encoder's format choice (encode path reads the clamped settings).
 *
 * Anything PRO-only is switched off rather than ignored, so the UI cannot show a
 * toggle that is on while the engine quietly skips it.
 */
import { formatAllowed, planFor, targetAllowed } from './tiers';
import type { Tier } from './tiers';
import type { AppSettings, EditSettings, OutputFormat } from './settings';

export interface Clamp {
  settings: Partial<AppSettings>;
  edit: Partial<EditSettings>;
}

export function clampForTier(tier: Tier, settings: AppSettings, edit: EditSettings): Clamp {
  const out: Clamp = { settings: {}, edit: {} };
  if (tier === 'pro' || tier === 'admin') return out;

  if (edit.spatial8d) out.edit.spatial8d = false;
  if (edit.denoise) out.edit.denoise = false;
  if (edit.voiceMode) out.edit.voiceMode = false;

  if (!formatAllowed(tier, settings.format)) out.settings.format = 'mp3';
  if (!targetAllowed(tier, settings.target)) out.settings.target = 'streaming';

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

/** The render path asks this before it starts; false means "do not render". */
export function mayExport(tier: Tier, format: OutputFormat, presetId: string): boolean {
  return formatAllowed(tier, format) && !presetLocked(tier, presetId);
}

import type { Stereo } from '../dsp/buffer';
import { peaksFrom } from '../io/audioFile';
import type { AppSettings, EditSettings, LoudnessTarget, OutputFormat, SourceInfo } from '../model/settings';
import { APP_DEFAULTS, FORMAT_META, NEUTRAL, SPACE_META, TARGET_META, cloneSettings } from '../model/settings';
import { loadSession, saveSession } from '../io/storage';
import { planFor } from '../model/tiers';
import type { Tier } from '../model/tiers';
import { clampForTier } from '../model/entitlements';
import { session } from './session';

/** The delivery decision. One object, mirrored into settings and edit. */
export interface OutputPatch {
  format?: OutputFormat;
  bitrate?: number;
  target?: LoudnessTarget;
}

export interface ExportRecord {
  id: string;
  name: string;
  format: string;
  preset: string;
  duration: number;
  bytes: number;
  lufs: number | null;
  truePeak: number;
  trimDb: number;
  hash: string;
  createdAt: number;
  where: string;
}

export interface RenderStatus {
  active: boolean;
  progress: number;
  stage: string;
  error: string | null;
  report: {
    name: string;
    duration: number;
    bytes: number;
    lufs: number | null;
    truePeak: number;
    trimDb: number;
    hash: string;
    format: string;
    where: string;
  } | null;
}

type Listener = () => void;

/**
 * A tiny observable store — no framework, no re-render diffing, < 1 kB.
 * Views subscribe and read immutable-ish snapshots.
 */
export class Store {
  settings: AppSettings = { ...APP_DEFAULTS };
  edit: EditSettings = { ...NEUTRAL };
  source: SourceInfo | null = null;
  peaks: Float32Array | null = null;
  audio: Stereo | null = null;

  history: ExportRecord[] = [];
  slotA: EditSettings | null = null;
  slotB: EditSettings | null = null;

  status: RenderStatus = {
    active: false,
    progress: 0,
    stage: 'IDLE',
    error: null,
    report: null,
  };

  previewReady = false;
  previewBusy = false;

  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    for (const fn of this.listeners) fn();
  }

  // ---------------------------------------------------------------------
  // Source
  // ---------------------------------------------------------------------

  setSource(audio: Stereo, info: SourceInfo): void {
    this.audio = audio;
    this.source = info;
    this.peaks = peaksFrom(audio, 480);
    this.edit = {
      ...this.edit,
      trimStart: 0,
      trimEnd: 0,
      activePreset: null,
    };
    this.previewReady = false;
    this.persist();
    this.emit();
  }

  clearSource(): void {
    this.audio = null;
    this.source = null;
    this.peaks = null;
    this.previewReady = false;
    this.edit = { ...this.edit, trimStart: 0, trimEnd: 0, activePreset: null };
    this.emit();
  }

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------

  patchEdit(patch: Partial<EditSettings>, markDirty = true): void {
    this.edit = { ...this.edit, ...patch };
    if (markDirty) this.previewReady = false;
    this.persist();
    this.emit();
  }

  patchSettings(patch: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.persist();
    this.emit();
  }

  /**
   * The only writer for format/bitrate/target.
   *
   * They live in two shapes because the encoder reads `edit` while SYSTEM edits
   * `settings`. Writing both in one transaction is what stops a free session
   * from showing MP3 in one screen and exporting FLAC from the other.
   */
  setOutput(patch: OutputPatch): void {
    this.settings = { ...this.settings, ...patch };
    this.edit = {
      ...this.edit,
      format: this.settings.format,
      bitrate: this.settings.bitrate,
      target: this.settings.target,
    };
    this.previewReady = false;
    this.persist();
    this.emit();
  }

  /**
   * Strips everything the tier cannot use, in one pass: the chain, the delivery
   * decision, and both A/B slots. Called on every session change and again right
   * before a render, so no stored value can outlive the tier that allowed it.
   * Returns true when something had to change.
   */
  clampToTier(tier: Tier): boolean {
    const clamp = clampForTier(tier, this.settings, this.edit);
    let changed = Object.keys(clamp.settings).length > 0 || Object.keys(clamp.edit).length > 0;
    if (changed) {
      this.settings = { ...this.settings, ...clamp.settings };
      this.edit = { ...this.edit, ...clamp.edit };
    }
    for (const slot of ['A', 'B'] as const) {
      const stored = slot === 'A' ? this.slotA : this.slotB;
      if (!stored) continue;
      const fix = clampForTier(tier, this.settings, stored).edit;
      if (Object.keys(fix).length === 0) continue;
      const next = { ...stored, ...fix };
      if (slot === 'A') this.slotA = next;
      else this.slotB = next;
      changed = true;
    }
    if (changed) {
      this.previewReady = false;
      this.persist();
      this.emit();
    }
    return changed;
  }

  /** The tier the server confirmed, or null while loading / after an outage. */
  private confirmedTier(): Tier | null {
    return session.state.status === 'ready' ? session.tier : null;
  }

  applyPreset(name: string, apply: (s: EditSettings) => void): void {
    const next = cloneSettings(NEUTRAL);
    // Preserve the engineer's output decisions across preset changes.
    next.target = this.settings.target;
    next.format = this.settings.format;
    next.bitrate = this.settings.bitrate;
    apply(next);
    next.activePreset = name;
    this.edit = next;
    this.clampToTier(this.confirmedTier() ?? 'pro');
    this.previewReady = false;
    this.persist();
    this.emit();
  }

  /**
   * Reset one section of the chain back to neutral.
   *
   * The lab's reset buttons call this with a list of keys, so "reset reverb"
   * can never leave the room size behind — the whole group moves together, and
   * tier clamps still apply afterwards.
   */
  resetSection(keys: (keyof EditSettings)[]): void {
    const base = cloneSettings(NEUTRAL) as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of keys) patch[key as string] = base[key as string];
    this.edit = { ...this.edit, ...(patch as Partial<EditSettings>) };
    this.clampToTier(this.confirmedTier() ?? 'pro');
    this.previewReady = false;
    this.persist();
    this.emit();
  }

  resetChain(): void {
    const next = cloneSettings(NEUTRAL);
    next.target = this.settings.target;
    next.format = this.settings.format;
    next.bitrate = this.settings.bitrate;
    this.edit = next;
    this.clampToTier(this.confirmedTier() ?? 'pro');
    this.previewReady = false;
    this.persist();
    this.emit();
  }

  /** Empties the two comparison slots. The live settings are left alone. */
  clearSlots(): void {
    this.slotA = null;
    this.slotB = null;
    this.persist();
    this.emit();
  }

  storeSlot(slot: 'A' | 'B'): void {
    if (slot === 'A') this.slotA = cloneSettings(this.edit);
    else this.slotB = cloneSettings(this.edit);
    this.emit();
  }

  /**
   * A/B compares the chain, never the delivery decision: recalling a slot must
   * not silently switch the export format, and a slot saved during a PRO month
   * must not carry its paid engines past a downgrade.
   */
  recallSlot(slot: 'A' | 'B'): void {
    const stored = slot === 'A' ? this.slotA : this.slotB;
    if (!stored) return;
    this.edit = {
      ...cloneSettings(stored),
      format: this.settings.format,
      bitrate: this.settings.bitrate,
      target: this.settings.target,
    };
    this.clampToTier(this.confirmedTier() ?? 'pro');
    this.previewReady = false;
    this.persist();
    this.emit();
  }

  // ---------------------------------------------------------------------
  // Status + history
  // ---------------------------------------------------------------------

  setStatus(patch: Partial<RenderStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit();
  }

  /** Free keeps the last three renders; PRO keeps the full log. */
  historyCap(): number {
    return planFor(session.tier).limits.history;
  }

  addHistory(record: ExportRecord): void {
    if (!this.settings.keepHistory) return;
    this.history = [record, ...this.history.filter((r) => r.id !== record.id)].slice(0, this.historyCap());
    this.persist();
    this.emit();
  }

  /** Called when the session changes so a downgrade cannot keep PRO history. */
  trimHistory(): void {
    const cap = this.historyCap();
    if (this.history.length <= cap) return;
    this.history = this.history.slice(0, cap);
    this.persist();
    this.emit();
  }

  removeHistory(id: string): void {
    this.history = this.history.filter((r) => r.id !== id);
    this.persist();
    this.emit();
  }

  clearHistory(): void {
    this.history = [];
    this.persist();
    this.emit();
  }

  /** Full wipe: chain, UI preferences, history and A/B slots. */
  wipeSession(): void {
    this.edit = { ...NEUTRAL };
    this.settings = { ...APP_DEFAULTS };
    this.history = [];
    this.slotA = null;
    this.slotB = null;
    this.previewReady = false;
    this.persist();
    this.emit();
  }

  // ---------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------

  persist(): void {
    saveSession({
      edit: this.edit,
      settings: this.settings,
      history: this.history,
      slotA: this.slotA,
      slotB: this.slotB,
    });
  }

  restore(): void {
    const data = loadSession();
    if (!data) return;
    if (data.edit && typeof data.edit === 'object') {
      this.edit = sanitizeEdit({ ...NEUTRAL, ...(data.edit as EditSettings) });
    }
    if (data.settings && typeof data.settings === 'object') {
      this.settings = sanitizeSettings({ ...APP_DEFAULTS, ...(data.settings as AppSettings) });
    }
    // The delivery decision is one value stored in two shapes. SYSTEM owns it,
    // so it wins on load; the deck follows instead of drifting.
    this.edit = {
      ...this.edit,
      format: this.settings.format,
      bitrate: this.settings.bitrate,
      target: this.settings.target,
    };
    if (Array.isArray(data.history)) this.history = data.history as ExportRecord[];
    this.slotA = (data.slotA as EditSettings | null) ?? null;
    this.slotB = (data.slotB as EditSettings | null) ?? null;
  }
}

/**
 * Sessions can outlive an enum change (formats or targets removed between
 * versions). Coerce anything unknown back to a safe default instead of
 * crashing the deck on boot.
 */
/** Same guard for the SYSTEM defaults, which are also restored from disk. */
function sanitizeSettings(settings: AppSettings): AppSettings {
  const safe = { ...settings };
  if (!FORMAT_META[safe.format]) safe.format = 'mp3';
  if (!(safe.target in TARGET_META)) safe.target = 'streaming';
  if (!['auto', 'armor', 'cockpit'].includes(safe.finish)) safe.finish = 'auto';
  if (![128, 192, 256, 320].includes(safe.bitrate)) safe.bitrate = 320;
  return safe;
}

function sanitizeEdit(edit: EditSettings): EditSettings {
  const safe = { ...edit };
  if (!FORMAT_META[safe.format]) safe.format = 'mp3';
  if (!(safe.target in TARGET_META)) safe.target = 'streaming';
  if (!(safe.reverbType in SPACE_META)) safe.reverbType = 'hall';
  if (!['retro', 'modern'].includes(safe.speedMode)) safe.speedMode = 'retro';
  if (!Number.isFinite(safe.speed)) safe.speed = 1;
  safe.speed = Math.min(2, Math.max(0.5, safe.speed));
  if (![128, 192, 256, 320].includes(safe.bitrate)) safe.bitrate = 320;
  return safe;
}

export const store = new Store();

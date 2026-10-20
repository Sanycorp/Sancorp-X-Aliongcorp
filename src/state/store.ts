import type { Stereo } from '../dsp/buffer';
import { peaksFrom } from '../io/audioFile';
import type { AppSettings, EditSettings, SourceInfo } from '../model/settings';
import { APP_DEFAULTS, FORMAT_META, NEUTRAL, SPACE_META, TARGET_META, cloneSettings } from '../model/settings';
import { loadSession, saveSession } from '../io/storage';
import { planFor } from '../model/tiers';
import { session } from './session';

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

  applyPreset(name: string, apply: (s: EditSettings) => void): void {
    const next = cloneSettings(NEUTRAL);
    // Preserve the engineer's output decisions across preset changes.
    next.target = this.edit.target;
    next.format = this.edit.format;
    next.bitrate = this.edit.bitrate;
    apply(next);
    next.activePreset = name;
    this.edit = next;
    this.previewReady = false;
    this.persist();
    this.emit();
  }

  resetChain(): void {
    const next = cloneSettings(NEUTRAL);
    next.target = this.edit.target;
    next.format = this.edit.format;
    next.bitrate = this.edit.bitrate;
    this.edit = next;
    this.previewReady = false;
    this.persist();
    this.emit();
  }

  storeSlot(slot: 'A' | 'B'): void {
    if (slot === 'A') this.slotA = cloneSettings(this.edit);
    else this.slotB = cloneSettings(this.edit);
    this.emit();
  }

  recallSlot(slot: 'A' | 'B'): void {
    const stored = slot === 'A' ? this.slotA : this.slotB;
    if (!stored) return;
    this.edit = cloneSettings(stored);
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
      this.settings = { ...APP_DEFAULTS, ...(data.settings as AppSettings) };
    }
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

/**
 * Ratings — the only user data Aegis Sound Lab accepts.
 *
 * Three principles, in order:
 *  1. The star is a local fact first. A rating is written to this device the
 *     moment it is given, so a flaky network can never lose it.
 *  2. Sending is a separate, visible act. The submitted payload is a target, a
 *     number of stars, an optional note and a random device id. No audio, no
 *     file names, no licence key, no IP-adjacent identifiers beyond what the
 *     server already sees.
 *  3. The operator reads aggregates, not people. Everything below can be
 *     computed from the array alone, which is what makes it testable.
 */

export const RATING_KEY = 'aegis.rating.v1';
export const REMOTE_KEY = 'aegis.rating.remote.v1';

/** `app` is the product itself; any other string is a preset id. */
export const RATING_APP = 'app';

export const MAX_NOTE = 140;
export const MAX_STARS = 5;

export interface Rating {
  /** `target` — one rating per target per device. */
  id: string;
  target: string;
  stars: number;
  note: string;
  at: number;
  /** Accepted by the server sink. Local-only ratings stay false. */
  sent: boolean;
}

export interface RatingSummary {
  count: number;
  /** Mean stars, 0 when there is nothing to average. */
  average: number;
  /** Index 0..4 → one to five stars. */
  distribution: [number, number, number, number, number];
  /** Share of 4–5 star ratings, 0..1. */
  positive: number;
}

export interface TargetScore {
  target: string;
  summary: RatingSummary;
}

export interface TrendPoint {
  /** `YYYY-MM-DD` in local time. */
  day: string;
  count: number;
  average: number;
}

const DAY = 86_400_000;
const TARGET_PATTERN = /^[a-z0-9-]{1,40}$/;

/** Rounds to the nearest whole star and clamps to 1..5. Anything else is 0. */
export function clampStars(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  if (rounded < 1) return 0;
  return rounded > MAX_STARS ? MAX_STARS : rounded;
}

/** One line, no control characters, no links, capped at MAX_NOTE. */
export function cleanNote(value: unknown): string {
  if (typeof value !== 'string') return '';
  const flat = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > MAX_NOTE ? flat.slice(0, MAX_NOTE).trim() : flat;
}

export function isTarget(value: unknown): value is string {
  return typeof value === 'string' && TARGET_PATTERN.test(value);
}

export function isRating(value: unknown): value is Rating {
  const r = value as Partial<Rating>;
  return Boolean(
    r &&
      typeof r.id === 'string' &&
      isTarget(r.target) &&
      typeof r.stars === 'number' &&
      r.stars >= 1 &&
      r.stars <= MAX_STARS &&
      typeof r.at === 'number',
  );
}

export function emptySummary(): RatingSummary {
  return { count: 0, average: 0, distribution: [0, 0, 0, 0, 0], positive: 0 };
}

export function summarize(ratings: Rating[]): RatingSummary {
  if (ratings.length === 0) return emptySummary();
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const rating of ratings) {
    const stars = clampStars(rating.stars);
    if (!stars) continue;
    distribution[stars - 1] += 1;
    total += stars;
  }
  const count = distribution.reduce((sum, n) => sum + n, 0);
  if (count === 0) return emptySummary();
  return {
    count,
    average: Math.round((total / count) * 100) / 100,
    distribution,
    positive: Math.round(((distribution[3] + distribution[4]) / count) * 100) / 100,
  };
}

export function rankByTarget(ratings: Rating[], minimum = 1): TargetScore[] {
  const groups = new Map<string, Rating[]>();
  for (const rating of ratings) {
    const list = groups.get(rating.target);
    if (list) list.push(rating);
    else groups.set(rating.target, [rating]);
  }
  return [...groups.entries()]
    .map(([target, list]) => ({ target, summary: summarize(list) }))
    .filter((row) => row.summary.count >= minimum)
    .sort((a, b) => b.summary.average - a.summary.average || b.summary.count - a.summary.count);
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Oldest → newest, so a sparkline reads left to right. */
export function trendOf(ratings: Rating[], days = 7, now = Date.now()): TrendPoint[] {
  const span = Math.max(1, Math.min(90, Math.round(days)));
  const buckets = new Map<string, { total: number; count: number }>();
  for (const rating of ratings) {
    const key = dayKey(rating.at);
    const bucket = buckets.get(key) ?? { total: 0, count: 0 };
    bucket.total += clampStars(rating.stars);
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  const out: TrendPoint[] = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (let i = span - 1; i >= 0; i -= 1) {
    const key = dayKey(start.getTime() - i * DAY);
    const bucket = buckets.get(key);
    out.push({
      day: key,
      count: bucket?.count ?? 0,
      average: bucket && bucket.count > 0 ? Math.round((bucket.total / bucket.count) * 100) / 100 : 0,
    });
  }
  return out;
}

/** Drops duplicates by id, newest wins, newest first. */
export function dedupe(ratings: Rating[]): Rating[] {
  const byId = new Map<string, Rating>();
  for (const rating of ratings) {
    if (!isRating(rating)) continue;
    const seen = byId.get(rating.id);
    if (!seen || rating.at >= seen.at) byId.set(rating.id, rating);
  }
  return [...byId.values()].sort((a, b) => b.at - a.at);
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function randomId(): string {
  try {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(16).slice(2, 14).padEnd(12, '0');
  }
}

/**
 * The device's own ratings. One vote per target — rating again replaces the
 * previous stars instead of stuffing the ballot, which is also what keeps the
 * aggregate honest when the same person changes their mind.
 */
export class RatingBook {
  private items: Rating[] = [];
  private deviceId = '';

  constructor(private readonly storage: Storage | null = safeStorage()) {
    this.reload();
  }

  private reload(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(RATING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      const data = parsed as { device?: string; entries?: unknown };
      if (typeof data?.device === 'string' && /^[0-9a-f]{8,16}$/.test(data.device)) this.deviceId = data.device;
      if (Array.isArray(data?.entries)) this.items = dedupe(data.entries as Rating[]);
    } catch {
      this.items = [];
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(
        RATING_KEY,
        JSON.stringify({ version: 1, device: this.device, entries: this.items }),
      );
    } catch {
      /* storage full or blocked — the rating still lives in memory */
    }
  }

  get device(): string {
    if (!this.deviceId) {
      this.deviceId = randomId();
      this.persist();
    }
    return this.deviceId;
  }

  all(): Rating[] {
    return [...this.items].sort((a, b) => b.at - a.at);
  }

  get(target: string): Rating | undefined {
    return this.items.find((r) => r.target === target);
  }

  /** Returns null when the stars are out of range — the UI never sends that. */
  rate(target: string, stars: number, note = '', at = Date.now()): Rating | null {
    const value = clampStars(stars);
    if (!isTarget(target) || !value) return null;
    const entry: Rating = {
      id: `${target}:${this.device}`,
      target,
      stars: value,
      note: cleanNote(note),
      at,
      sent: false,
    };
    this.items = [entry, ...this.items.filter((r) => r.target !== target)];
    this.persist();
    return { ...entry };
  }

  markSent(target: string): void {
    const entry = this.items.find((r) => r.target === target);
    if (!entry) return;
    entry.sent = true;
    this.persist();
  }

  remove(target: string): void {
    this.items = this.items.filter((r) => r.target !== target);
    this.persist();
  }

  clear(): void {
    this.items = [];
    this.persist();
  }

  summary(target?: string): RatingSummary {
    return summarize(target ? this.items.filter((r) => r.target === target) : this.items);
  }

  exportJson(): string {
    return JSON.stringify({ version: 1, device: this.device, entries: this.items }, null, 2);
  }
}

/**
 * Cache of what the server has collected, so the console still shows numbers
 * when GitHub is slow or the operator is on a phone with no signal.
 */
export class RemoteRatings {
  private items: Rating[] = [];
  private stamp = 0;

  constructor(private readonly storage: Storage | null = safeStorage()) {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(REMOTE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { entries?: unknown; updatedAt?: unknown };
      if (Array.isArray(parsed?.entries)) this.items = dedupe(parsed.entries as Rating[]);
      if (typeof parsed?.updatedAt === 'number') this.stamp = parsed.updatedAt;
    } catch {
      this.items = [];
    }
  }

  all(): Rating[] {
    return [...this.items];
  }

  updatedAt(): number {
    return this.stamp;
  }

  /** Replace-with-newest merge; ids that collide are resolved by timestamp. */
  merge(incoming: Rating[]): number {
    const before = this.items.length;
    this.items = dedupe([...this.items, ...incoming]);
    this.stamp = Date.now();
    try {
      this.storage?.setItem(REMOTE_KEY, JSON.stringify({ version: 1, updatedAt: this.stamp, entries: this.items }));
    } catch {
      /* ignore */
    }
    return this.items.length - before;
  }

  clear(): void {
    this.items = [];
    this.stamp = 0;
    try {
      this.storage?.removeItem(REMOTE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const ratingBook = new RatingBook();
export const remoteRatings = new RemoteRatings();

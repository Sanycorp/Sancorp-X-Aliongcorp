import { describe, expect, it } from 'vitest';
import {
  MAX_NOTE,
  RATING_APP,
  RatingBook,
  RemoteRatings,
  clampStars,
  cleanNote,
  dedupe,
  rankByTarget,
  summarize,
  trendOf,
} from '../src/state/rating';
import type { Rating } from '../src/state/rating';

/** Minimal in-memory Storage so the book can be tested without a browser. */
class Memory implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function entry(target: string, stars: number, at = Date.now(), note = ''): Rating {
  return { id: `${target}:t`, target, stars, note, at, sent: false };
}

describe('star arithmetic', () => {
  it('rounds to whole stars and clamps to the 1..5 scale', () => {
    expect(clampStars(4.4)).toBe(4);
    expect(clampStars(4.6)).toBe(5);
    expect(clampStars(9)).toBe(5);
    expect(clampStars(0.2)).toBe(0);
    expect(clampStars(-3)).toBe(0);
    expect(clampStars(Number.NaN)).toBe(0);
    expect(clampStars('3')).toBe(3);
  });

  it('flattens notes: no links, no line breaks, capped length', () => {
    expect(cleanNote('  bass\nnya   mantap  ')).toBe('bass nya mantap');
    expect(cleanNote('coba https://example.com/jahat dulu')).toBe('coba dulu');
    expect(cleanNote('x'.repeat(400)).length).toBe(MAX_NOTE);
    expect(cleanNote(undefined)).toBe('');
  });
});

describe('summarize', () => {
  it('returns an empty summary instead of dividing by zero', () => {
    const summary = summarize([]);
    expect(summary).toEqual({ count: 0, average: 0, distribution: [0, 0, 0, 0, 0], positive: 0 });
  });

  it('counts a distribution and the share of 4–5 star ratings', () => {
    const summary = summarize([entry('app', 5), entry('app', 4), entry('app', 1), entry('app', 5)]);
    expect(summary.count).toBe(4);
    expect(summary.distribution).toEqual([1, 0, 0, 1, 2]);
    expect(summary.average).toBe(3.75);
    expect(summary.positive).toBeCloseTo(0.75, 2);
  });

  it('ignores entries with impossible stars instead of skewing the mean', () => {
    const dirty = [entry('app', 5), { ...entry('app', 0), id: 'zero' } as Rating];
    expect(summarize(dirty).count).toBe(1);
  });
});

describe('ranking and trend', () => {
  it('orders presets by average, then by how many people voted', () => {
    const rows = [
      entry('deep-orbit', 5),
      entry('deep-orbit', 5),
      entry('night-shift', 5),
      entry('night-shift', 4),
      entry('night-shift', 4),
    ];
    const ranking = rankByTarget(rows);
    expect(ranking.map((row) => row.target)).toEqual(['deep-orbit', 'night-shift']);
    expect(rankByTarget(rows, 3).map((row) => row.target)).toEqual(['night-shift']);
  });

  it('buckets the last seven days oldest first and leaves empty days at zero', () => {
    const now = new Date('2026-10-20T12:00:00Z').getTime();
    const points = trendOf([entry('app', 4, now), entry('app', 5, now - 2 * 86_400_000)], 7, now);
    expect(points).toHaveLength(7);
    expect(points[6].count).toBe(1);
    expect(points[6].average).toBe(4);
    expect(points[4].count).toBe(1);
    expect(points[0].count).toBe(0);
    expect(points[6].day > points[5].day).toBe(true);
  });

  it('keeps the newest copy when ids collide', () => {
    const older = entry('app', 2, 1000);
    const newer = { ...entry('app', 5, 2000) };
    expect(dedupe([older, newer])).toEqual([newer]);
  });
});

describe('RatingBook', () => {
  it('stores one vote per target and lets the voter change their mind', () => {
    const book = new RatingBook(new Memory());
    expect(book.rate(RATING_APP, 3, 'enak')).toMatchObject({ stars: 3, note: 'enak', sent: false });
    const second = book.rate(RATING_APP, 5, 'lebih enak');
    expect(second).toMatchObject({ stars: 5, note: 'lebih enak' });
    expect(book.all()).toHaveLength(1);
    expect(book.get(RATING_APP)?.stars).toBe(5);
  });

  it('refuses impossible stars and unsafe targets', () => {
    const book = new RatingBook(new Memory());
    expect(book.rate(RATING_APP, 0)).toBeNull();
    expect(book.rate('../../etc/passwd', 5)).toBeNull();
    expect(book.all()).toHaveLength(0);
  });

  it('survives a reload and remembers what was already sent', () => {
    const storage = new Memory();
    const first = new RatingBook(storage);
    first.rate('night-shift', 4, 'keren');
    first.markSent('night-shift');
    const device = first.device;

    const reopened = new RatingBook(storage);
    expect(reopened.device).toBe(device);
    expect(reopened.get('night-shift')).toMatchObject({ stars: 4, sent: true });
  });

  it('keeps the device id stable so one phone cannot vote twice', () => {
    const storage = new Memory();
    const book = new RatingBook(storage);
    const id = book.device;
    expect(id).toMatch(/^[0-9a-f]{8,16}$/);
    expect(new RatingBook(storage).device).toBe(id);
    expect(book.rate(RATING_APP, 5)?.id).toBe(`${RATING_APP}:${id}`);
  });

  it('exports a file the operator can re-import', () => {
    const book = new RatingBook(new Memory());
    book.rate(RATING_APP, 5, 'mantap');
    const parsed = JSON.parse(book.exportJson()) as { version: number; device: string; entries: Rating[] };
    expect(parsed.version).toBe(1);
    expect(parsed.entries[0]).toMatchObject({ target: RATING_APP, stars: 5 });
  });
});

describe('RemoteRatings', () => {
  it('merges without duplicating and stamps the read time', () => {
    const cache = new RemoteRatings(new Memory());
    cache.merge([entry('app', 5, 1000), entry('app', 3, 2000)]);
    const added = cache.merge([entry('app', 3, 2000), entry('night-shift', 4, 3000)]);
    expect(added).toBe(1);
    expect(cache.all()).toHaveLength(2);
    expect(cache.updatedAt()).toBeGreaterThan(0);
    expect(cache.all().find((row) => row.target === 'app')?.stars).toBe(3);
  });
});

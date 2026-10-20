// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { Ledger, dayCount, expiresFromKey, serialFromKey, stampToMs, statusOf } from '../src/state/ops';

/** Shaped like a real key; the ledger never verifies signatures. */
function key(serial: string, stamp: string, tier = 'PRO'): string {
  return `AEGIS-${tier}-${serial}-${stamp}-ABCDEF`;
}

const inDays = (days: number): string => {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10).replace(/-/g, '');
};

describe('operator ledger', () => {
  let ledger: Ledger;
  const storage = new Map<string, string>();

  const fakeStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => storage.clear(),
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() {
      return storage.size;
    },
  } as unknown as Storage;

  beforeEach(() => {
    storage.clear();
    ledger = new Ledger(fakeStorage);
  });

  it('reads a key without asking the server', () => {
    expect(serialFromKey(key('7F3K', '20271120'))).toBe('7F3K');
    expect(stampToMs('20271120')).toBe(Date.parse('2027-11-20T23:59:59Z'));
    expect(expiresFromKey(key('7F3K', '20271120'))).toBe(stampToMs('20271120'));
    expect(serialFromKey('nope')).toBe('');
    expect(serialFromKey('AEGIS-PRO-7F3K')).toBe('');
  });

  it('adds an account and refuses junk', () => {
    expect(ledger.add({ key: key('AAAA', inDays(30)), handle: '@budi' })).not.toBeNull();
    expect(ledger.all()).toHaveLength(1);
    expect(ledger.all()[0].tier).toBe('pro');
    expect(ledger.add({ key: 'not-a-key' })).toBeNull();
    expect(ledger.all()).toHaveLength(1);
  });

  it('updates instead of duplicating the same serial', () => {
    ledger.add({ key: key('AAAA', inDays(10)), handle: '@budi' });
    ledger.add({ key: key('AAAA', inDays(40)), handle: '@budi' });
    expect(ledger.all()).toHaveLength(1);
    expect(ledger.all()[0].handle).toBe('@budi');
    expect(dayCount(ledger.all()[0].expires)).toBeGreaterThan(35);
  });

  it('renews under the same serial and counts the pass', () => {
    ledger.add({ key: key('AAAA', inDays(5)), handle: '@budi' });
    const renewed = ledger.renew('AAAA', key('AAAA', inDays(35)), 30);
    expect(renewed?.serial).toBe('AAAA');
    expect(renewed?.passes).toBe(2);
    expect(ledger.renew('BBBB', key('BBBB', inDays(30)), 30)).toBeNull();
    expect(ledger.renew('AAAA', key('CCCC', inDays(30)), 30)).toBeNull();
  });

  it('classifies accounts for the filter bar', () => {
    ledger.add({ key: key('AAAA', inDays(60)) });
    ledger.add({ key: key('BBBB', inDays(3)) });
    ledger.add({ key: key('CCCC', inDays(-2)) });
    ledger.setRevoked('AAAA', true);

    expect(statusOf(ledger.find('AAAA')!)).toBe('revoked');
    expect(statusOf(ledger.find('BBBB')!)).toBe('expiring');
    expect(statusOf(ledger.find('CCCC')!)).toBe('expired');

    expect(ledger.filter('', 'revoked')).toHaveLength(1);
    expect(ledger.filter('', 'expiring')).toHaveLength(1);
    expect(ledger.filter('bbb')).toHaveLength(1);

    const stats = ledger.stats();
    expect(stats.total).toBe(3);
    expect(stats.expired).toBe(1);
    expect(stats.revoked).toBe(1);
    expect(stats.active).toBe(0);
  });

  it('values sold passes at the shelf price', () => {
    ledger.add({ key: key('AAAA', inDays(30)) });
    ledger.renew('AAAA', key('AAAA', inDays(60)), 30);
    expect(ledger.stats().revenue).toBe(10_000);
  });

  it('exports JSON and CSV that can be read back', () => {
    ledger.add({ key: key('AAAA', inDays(30)), handle: 'budi "the kid"' });
    const json = ledger.exportJson();
    expect(JSON.parse(json).accounts).toHaveLength(1);

    const csv = ledger.toCsv();
    expect(csv.split('\n')[0]).toContain('serial');
    expect(csv).toContain('"budi ""the kid"""');

    const moved = new Ledger(fakeStorage);
    moved.clear();
    expect(moved.importJson(json)).toBe(1);
    expect(moved.all()).toHaveLength(1);
    expect(moved.importJson('{ broken')).toBe(0);
  });

  it('lists only the serials marked for revocation', () => {
    ledger.add({ key: key('AAAA', inDays(30)) });
    ledger.add({ key: key('BBBB', inDays(30)) });
    ledger.setRevoked('BBBB', true);
    expect(ledger.revokedSerials()).toEqual(['BBBB']);
  });
});

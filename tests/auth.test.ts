// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CLEAR_COOKIE,
  SESSION_DAYS,
  extendLicense,
  isRevoked,
  formatLicense,
  makeLicense,
  REVOKED_SERIALS,
  parseCookies,
  rateLimit,
  readSession,
  safeEqual,
  sessionCookie,
  signSession,
  verifyLicense,
} from '../api/_lib/auth.js';
import { REVOKED } from '../api/_lib/revoked.js';

const DAY = 86_400_000;

describe('license keys', () => {
  it('round-trips a freshly minted key', () => {
    const licence = makeLicense('pro', 365);
    expect(licence.key).toMatch(/^AEGIS-PRO-[A-Z0-9]{10}-\d{8}-[A-Z0-9]{6}$/);
    const verified = verifyLicense(licence.key);
    expect(verified).not.toBeNull();
    expect(verified!.tier).toBe('pro');
    expect(verified!.serial).toBe(licence.serial);
  });

  it('mints account ids from the crypto source, ten symbols, no look-alikes', () => {
    const serials = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const { serial } = makeLicense('pro', 30);
      // I, L, O, 0 and 1 are out of the alphabet on purpose: the id gets read
      // aloud on Telegram and copied off a screenshot.
      expect(serial).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
      expect(serial).toHaveLength(10);
      serials.add(serial);
    }
    expect(serials.size).toBe(500);
  });

  it('keeps accepting the four-symbol ids already sold', () => {
    const legacy = formatLicense('pro', 'AB12', '20301231').key;
    const verified = verifyLicense(legacy);
    expect(verified).not.toBeNull();
    expect(verified!.serial).toBe('AB12');
  });

  it('rejects a serial of the wrong length instead of guessing', () => {
    expect(verifyLicense(formatLicense('pro', 'ABC', '20301231').key)).toBeNull();
    expect(verifyLicense(formatLicense('pro', 'ABCDEFGHIJK', '20301231').key)).toBeNull();
  });

  it('accepts lowercase and padded input (people paste by hand)', () => {
    const licence = makeLicense('admin', 30);
    expect(verifyLicense(`  ${licence.key.toLowerCase()}  `)).not.toBeNull();
  });

  it('rejects a flipped signature character', () => {
    const licence = makeLicense('pro', 30);
    const parts = licence.key.split('-');
    parts[4] = parts[4].replace(/^./, (c) => (c === 'A' ? 'B' : 'A'));
    expect(verifyLicense(parts.join('-'))).toBeNull();
  });

  it('rejects a key whose tier was rewritten', () => {
    const licence = makeLicense('pro', 30);
    // A free user upgrading their own key to PRO must fail the signature.
    expect(verifyLicense(licence.key.replace('AEGIS-PRO', 'AEGIS-ADMIN'))).toBeNull();
  });

  it('rejects an expired key', () => {
    const licence = makeLicense('pro', -2);
    expect(verifyLicense(licence.key)).toBeNull();
  });

  it('rejects junk without throwing', () => {
    for (const junk of ['', null, undefined, 'AEGIS', 'AEGIS-FREE-AAAA-20260101-AAAAAA', 'x'.repeat(300)]) {
      expect(verifyLicense(junk as string)).toBeNull();
    }
  });

  it('renews without changing the serial (the account id)', () => {
    const original = makeLicense('pro', 30);
    const renewed = extendLicense(original.key, 30);
    expect(renewed).not.toBeNull();
    expect(renewed!.serial).toBe(original.serial);
    expect(renewed!.tier).toBe('pro');
    const stamp = (value: string) => value.split('-')[3];
    expect(Number(stamp(renewed!.key))).toBeGreaterThanOrEqual(Number(stamp(original.key)));
    expect(verifyLicense(renewed!.key)).not.toBeNull();
  });

  it('renews a key that already expired, so lapsed customers can come back', () => {
    const dead = makeLicense('pro', -3);
    expect(verifyLicense(dead.key)).toBeNull();
    const revived = extendLicense(dead.key, 30);
    expect(revived).not.toBeNull();
    expect(verifyLicense(revived!.key)).not.toBeNull();
  });

  it('refuses to renew a forged key', () => {
    const key = makeLicense('pro', 30);
    const parts = key.key.split('-');
    parts[4] = 'AAAAAA';
    expect(extendLicense(parts.join('-'), 30)).toBeNull();
  });

  it('does not mint free keys', () => {
    // The issuer only ever signs pro/admin; "free" is the absence of a session.
    const licence = makeLicense('pro', 7);
    expect(verifyLicense(licence.key)!.tier).not.toBe('free');
  });
});

describe('sessions', () => {
  const session = { tier: 'pro', exp: Date.now() + DAY, subject: 'AEGIS-PRO-7F3K-20271120-9K2M4Q' };

  it('round-trips a signed cookie', () => {
    const decoded = readSession(signSession(session));
    expect(decoded).toMatchObject({ tier: 'pro', subject: session.subject });
  });

  it('rejects a tampered payload', () => {
    const raw = signSession(session);
    const [payload, sig] = raw.split('.');
    const forged = Buffer.from(JSON.stringify({ ...session, tier: 'admin' })).toString('base64url');
    expect(readSession(`${forged}.${sig}`)).toBeNull();
    // Flip the last character to one it is not: appending "A" blindly produced
    // an identical token whenever the signature already ended in A, which made
    // this assertion fail roughly once in sixty runs.
    const last = sig.slice(-1);
    const flipped = sig.slice(0, -1) + (last === 'A' ? 'B' : 'A');
    expect(flipped).not.toBe(sig);
    expect(readSession(`${payload}.${flipped}`)).toBeNull();
  });

  it('rejects expired and malformed tokens', () => {
    expect(readSession(signSession({ ...session, exp: Date.now() - 1000 }))).toBeNull();
    expect(readSession('garbage')).toBeNull();
    expect(readSession('')).toBeNull();
    expect(readSession(undefined as unknown as string)).toBeNull();
    expect(readSession('a.b.c')).toBeNull();
  });

  it('sets the cookie attributes that matter', () => {
    const cookie = sessionCookie(session);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(CLEAR_COOKIE).toContain('Max-Age=0');
    expect(SESSION_DAYS).toBeGreaterThanOrEqual(1);
  });

  it('drops a session whose serial was revoked', () => {
    // The signature and the date are still valid — only the deny list changed.
    const token = signSession({ tier: 'pro', exp: Date.now() + DAY, subject: 'ZZ9Q' });
    expect(readSession(token)).not.toBeNull();
    REVOKED.push('ZZ9Q');
    try {
      expect(isRevoked('zz9q')).toBe(true);
      expect(readSession(token)).toBeNull();
    } finally {
      REVOKED.pop();
    }
    expect(readSession(token)).not.toBeNull();
  });

  it('parses cookie headers safely', () => {
    expect(parseCookies('a=1; b=hello%20world')).toEqual({ a: '1', b: 'hello world' });
    expect(parseCookies('broken; a=1; =2')).toEqual({ a: '1' });
    expect(parseCookies('')).toEqual({});
  });
});

describe('primitives', () => {
  it('compares without throwing on length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('rate limits per bucket and IP', () => {
    const req = { headers: { 'x-forwarded-for': '203.0.113.9' } };
    let last = { ok: true, remaining: 0 };
    for (let i = 0; i < 5; i += 1) last = rateLimit(req, 'test-bucket', 4, 60_000);
    expect(last.ok).toBe(false);
    expect(rateLimit({ headers: { 'x-forwarded-for': '203.0.113.10' } }, 'test-bucket', 4).ok).toBe(true);
    expect(rateLimit(req, 'other-bucket', 4).ok).toBe(true);
  });
});

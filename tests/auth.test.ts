// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CLEAR_COOKIE,
  SESSION_DAYS,
  makeLicense,
  parseCookies,
  rateLimit,
  readSession,
  safeEqual,
  sessionCookie,
  signSession,
  verifyLicense,
} from '../api/_lib/auth.js';

const DAY = 86_400_000;

describe('license keys', () => {
  it('round-trips a freshly minted key', () => {
    const licence = makeLicense('pro', 365);
    expect(licence.key).toMatch(/^AEGIS-PRO-[A-Z0-9]{4}-\d{8}-[A-Z0-9]{6}$/);
    const verified = verifyLicense(licence.key);
    expect(verified).not.toBeNull();
    expect(verified!.tier).toBe('pro');
    expect(verified!.serial).toBe(licence.serial);
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
    expect(readSession(`${payload}.${sig.slice(0, -1)}A`)).toBeNull();
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

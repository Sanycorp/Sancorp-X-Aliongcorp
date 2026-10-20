/**
 * Shared auth primitives for the Aegis Sound Lab (Sanayacorp) license server.
 *
 * There is no database on purpose: a license is a self-contained HMAC-signed
 * string, and a session is a signed cookie. That keeps the deployment static,
 * makes revocation a matter of rotating the secret, and means no user data is
 * ever stored — the same promise the audio engine makes.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { REVOKED } from './revoked.js';

export const COOKIE = 'aegis_sess';
export const SESSION_DAYS = 30;

const DEV_SECRET = 'aegis-dev-secret-not-for-production';
export const SECRET = process.env.AEGIS_SECRET || DEV_SECRET;
export const ADMIN_PASSWORD = process.env.AEGIS_ADMIN_PASSWORD || '';
export const IS_DEV_SECRET = SECRET === DEV_SECRET;

export const TIERS = ['free', 'pro', 'admin'];

/**
 * Serials that must stop working before their expiry date.
 *
 * Two sources, because they answer different questions:
 *  - `revoked.js` ships with the deployment, so the list is auditable in git
 *    and can be updated from a phone through the `revoke` workflow.
 *  - `AEGIS_REVOKED` lets the operator hot-fix a leak without a commit.
 * The union is checked on every session read, so a revoked serial loses access
 * on the next request, not at the next expiry.
 */
const ENV_REVOKED = String(process.env.AEGIS_REVOKED || '')
  .split(/[,\s]+/)
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

export const REVOKED_SERIALS = new Set([
  ...REVOKED.map((s) => String(s).trim().toUpperCase()),
  ...ENV_REVOKED,
]);

export function isRevoked(serial) {
  const value = String(serial ?? '').toUpperCase();
  if (!value) return false;
  if (REVOKED_SERIALS.has(value)) return true;
  // Read the shipped array live as well, so a hot edit (or a test) takes effect
  // without rebuilding the Set.
  return REVOKED.some((entry) => String(entry).toUpperCase() === value);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const unb64url = (str) => Buffer.from(str, 'base64url').toString('utf8');

export function hmac(data) {
  return createHmac('sha256', SECRET).update(data).digest('base64url');
}

/** Constant-time compare that never throws on length mismatch. */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function signSession({ tier, exp, subject }) {
  const payload = b64url(JSON.stringify({ t: tier, e: exp, s: subject }));
  return `${payload}.${hmac(payload)}`;
}

export function readSession(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  if (!safeEqual(sig, hmac(payload))) return null;
  let data;
  try {
    data = JSON.parse(unb64url(payload));
  } catch {
    return null;
  }
  if (!TIERS.includes(data?.t)) return null;
  if (typeof data.e !== 'number' || data.e < Date.now()) return null;
  const subject = String(data.s ?? '');
  // A revoked licence must stop working immediately, even though its signature
  // and date are still valid.
  if (data.t !== 'admin' && isRevoked(subject)) return null;
  return { tier: data.t, exp: data.e, subject };
}

export function sessionCookie(session) {
  const maxAge = Math.floor((session.exp - Date.now()) / 1000);
  return [
    `${COOKIE}=${signSession(session)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${Math.max(60, maxAge)}`,
  ].join('; ');
}

export const CLEAR_COOKIE = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function currentSession(req) {
  const cookies = parseCookies(req.headers?.cookie ?? '');
  return readSession(cookies[COOKIE]);
}

export function requireAdmin(req) {
  const session = currentSession(req);
  return session && session.tier === 'admin' ? session : null;
}

// ---------------------------------------------------------------------------
// Licenses
// ---------------------------------------------------------------------------

const SERIAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomSerial(length = 4) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SERIAL_ALPHABET[Math.floor(Math.random() * SERIAL_ALPHABET.length)];
  }
  return out;
}

export function licenseSignature(tier, serial, expires) {
  return hmac(`${tier}|${serial}|${expires}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
}

/** Stamp a serial + date into the wire format. */
export function formatLicense(tier, serial, expires) {
  return {
    key: `AEGIS-${tier.toUpperCase()}-${serial}-${expires}-${licenseSignature(tier, serial, expires)}`,
    tier,
    serial,
    expires,
  };
}

const dateStamp = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

/** `AEGIS-PRO-7F3K-20271120-9K2M4Q` */
export function makeLicense(tier, days) {
  return formatLicense(tier, randomSerial(4), dateStamp(Date.now() + days * 86400_000));
}

/**
 * Renewal keeps the serial, so the operator's ledger and the customer's key
 * still point at the same account. The new key simply expires later.
 */
export function extendLicense(raw, days) {
  const current = verifyLicense(raw, { allowExpired: true });
  if (!current) return null;
  const base = Math.max(Date.now(), current.exp);
  return formatLicense(current.tier, current.serial, dateStamp(base + days * 86400_000));
}

export function verifyLicense(raw, options = {}) {
  const key = String(raw ?? '').trim().toUpperCase();
  const parts = key.split('-');
  if (parts.length !== 5 || parts[0] !== 'AEGIS') return null;
  const [, tierRaw, serial, expires, sig] = parts;
  const tier = tierRaw.toLowerCase();
  if (tier !== 'pro' && tier !== 'admin') return null;
  if (!/^[A-Z0-9]{4}$/.test(serial)) return null;
  if (!/^\d{8}$/.test(expires)) return null;
  const expected = licenseSignature(tier, serial, expires);
  if (!safeEqual(sig, expected)) return null;

  const exp = Date.parse(`${expires.slice(0, 4)}-${expires.slice(4, 6)}-${expires.slice(6, 8)}T23:59:59Z`);
  if (!Number.isFinite(exp)) return null;
  if (!options.allowExpired && exp < Date.now()) return null;
  if (isRevoked(serial)) return null;
  return { tier, serial, exp };
}

/** Tiny JSON helper with sane cache + security headers. */
export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

export async function readJsonBody(req, limit = 4096) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    let raw = '';
    let overflow = false;
    req.on('data', (chunk) => {
      if (overflow) return;
      raw += chunk;
      if (raw.length > limit) {
        overflow = true;
        resolve(null);
      }
    });
    req.on('end', () => {
      if (overflow) return;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

/** Basic abuse guard: per-instance sliding window keyed by IP. */
const attempts = new Map();

export function rateLimit(req, bucket, max = 8, windowMs = 60_000) {
  const ip =
    (req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const hits = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  attempts.set(key, hits);
  if (attempts.size > 500) {
    for (const [k, v] of attempts) {
      if (!v.some((t) => now - t < windowMs)) attempts.delete(k);
    }
  }
  return { ok: hits.length <= max, remaining: Math.max(0, max - hits.length) };
}

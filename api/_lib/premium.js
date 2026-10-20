/**
 * Premium grants for Google accounts.
 *
 * There is no database, by design: the whole system is signed tokens. A grant
 * for an email is therefore a signed string the operator can generate from the
 * console and paste into `AEGIS_PREMIUM`, exactly the way a revocation is pasted
 * into `AEGIS_REVOKED`:
 *
 *   email:YYYYMMDD:HMAC(email|YYYYMMDD)
 *
 * The signature is what makes the list safe to keep in an environment variable
 * and in git: an email without a valid signature grants nothing, so nobody can
 * add themselves by editing a file. Listing an email is not enough.
 */
import { SECRET, isRevoked } from './auth.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Grants compiled into the deployment. Keep short and auditable; env wins. */
export const GRANTS = [];

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function sign(email, stamp) {
  return createHmac('sha256', SECRET).update(`premium|${email}|${stamp}`).digest('base64url').slice(0, 16);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function stampOf(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function msOf(stamp) {
  const clean = String(stamp ?? '');
  if (!/^\d{8}$/.test(clean)) return 0;
  const ms = Date.parse(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T23:59:59Z`);
  return Number.isFinite(ms) ? ms : 0;
}

export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

/** `email:stamp:sig` for the operator to paste into AEGIS_PREMIUM. */
export function makeGrant(email, days) {
  const address = normalizeEmail(email);
  const stamp = stampOf(Date.now() + days * 86_400_000);
  return `${address}:${stamp}:${sign(address, stamp)}`;
}

/** Every grant from the env and the shipped list, deduplicated by email. */
export function allGrants() {
  const raw = [...GRANTS, ...String(process.env.AEGIS_PREMIUM || '').split(/[,\s]+/)];
  const out = new Map();
  for (const entry of raw) {
    const parsed = parseGrant(entry);
    if (!parsed) continue;
    const current = out.get(parsed.email);
    if (!current || parsed.exp > current.exp) out.set(parsed.email, parsed);
  }
  return [...out.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export function parseGrant(entry) {
  const text = String(entry ?? '').trim();
  const parts = text.split(':');
  if (parts.length !== 3) return null;
  const email = normalizeEmail(parts[0]);
  const [stamp, sig] = parts.slice(1);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  if (!/^\d{8}$/.test(stamp)) return null;
  if (!safeEqual(sig, sign(email, stamp))) return null;
  const exp = msOf(stamp);
  if (!exp) return null;
  return { email, exp, stamp, active: exp > Date.now() };
}

/**
 * Tier for a signed-in Google account.
 *
 * A revoked serial revokes the account too, so the operator has one lever for
 * "cut this person off"; the email itself can also be listed in AEGIS_REVOKED.
 */
export function premiumFor(email, now = Date.now()) {
  const address = normalizeEmail(email);
  if (!address) return null;
  if (isRevoked(address)) return null;
  const grant = allGrants().find((g) => g.email === address);
  if (!grant || grant.exp <= now) return null;
  return { exp: grant.exp, stamp: grant.stamp };
}

export { sign as grantSignature, b64 };

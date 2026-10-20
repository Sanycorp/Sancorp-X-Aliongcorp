/**
 * Licence desk — admin only.
 *
 *   GET  /api/license                     → desk state (no keys, no secrets)
 *   POST /api/license { op:'issue',   tier, days, count }
 *   POST /api/license { op:'extend',  key, days }
 *   POST /api/license { op:'inspect', key }
 *
 * A key is a self-contained HMAC token, so the desk can mint, renew and read
 * one without a database. Renewal keeps the original serial, which is what the
 * operator's ledger uses as the account id.
 */
import {
  ADMIN_PASSWORD,
  IS_DEV_SECRET,
  REVOKED_SERIALS,
  extendLicense,
  json,
  makeLicense,
  rateLimit,
  readJsonBody,
  requireAdmin,
  verifyLicense,
} from './_lib/auth.js';

/** 1 day exists for a trial; 3650 for a lifetime deal. */
const ALLOWED_DAYS = [1, 7, 30, 90, 180, 365, 3650];

const pickDays = (value) => (ALLOWED_DAYS.includes(Number(value)) ? Number(value) : 30);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!requireAdmin(req)) {
      json(res, 403, { error: 'admin_required' });
      return;
    }
    json(res, 200, {
      ok: true,
      adminEnabled: Boolean(ADMIN_PASSWORD),
      devSecret: IS_DEV_SECRET,
      revoked: REVOKED_SERIALS.size,
      days: ALLOWED_DAYS,
      now: Date.now(),
    });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (!requireAdmin(req)) {
    json(res, 403, { error: 'admin_required' });
    return;
  }

  const limit = rateLimit(req, 'license', 30, 60_000);
  if (!limit.ok) {
    res.setHeader('Retry-After', '60');
    json(res, 429, { error: 'too_many_requests' });
    return;
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    json(res, 400, { error: 'bad_request' });
    return;
  }

  const op = String(body.op ?? 'issue');

  if (op === 'inspect') {
    const found = verifyLicense(body.key, { allowExpired: true });
    if (!found) {
      json(res, 200, { ok: true, valid: false, reason: 'signature' });
      return;
    }
    json(res, 200, {
      ok: true,
      valid: found.exp > Date.now(),
      tier: found.tier,
      serial: found.serial,
      expires: found.exp,
      revoked: REVOKED_SERIALS.has(found.serial),
    });
    return;
  }

  if (op === 'extend') {
    const days = pickDays(body.days);
    const renewed = extendLicense(body.key, days);
    if (!renewed) {
      json(res, 400, { error: 'invalid_license' });
      return;
    }
    json(res, 200, { key: renewed.key, tier: renewed.tier, serial: renewed.serial, expires: renewed.expires, days });
    return;
  }

  if (op !== 'issue') {
    json(res, 400, { error: 'unknown_op' });
    return;
  }

  const days = pickDays(body.days);
  const count = Math.min(20, Math.max(1, Number(body.count) || 1));
  const tier = body.tier === 'admin' ? 'admin' : 'pro';

  const keys = Array.from({ length: count }, () => makeLicense(tier, days));
  json(res, 200, { keys, tier, days });
}

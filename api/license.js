/**
 * License issuance — admin only.
 *
 *   POST /api/license { tier: 'pro', days: 365, count: 1 }
 *   → { keys: [{ key, tier, expires }] }
 *
 * The console is the only caller. A non-admin gets 403 regardless of body.
 */
import { json, makeLicense, rateLimit, readJsonBody, requireAdmin } from './_lib/auth.js';

const ALLOWED_DAYS = [7, 30, 90, 180, 365, 3650];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (!requireAdmin(req)) {
    json(res, 403, { error: 'admin_required' });
    return;
  }

  const limit = rateLimit(req, 'license', 30, 60_000);
  if (!limit.ok) {
    json(res, 429, { error: 'too_many_requests' });
    return;
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    json(res, 400, { error: 'bad_request' });
    return;
  }

  const days = ALLOWED_DAYS.includes(Number(body.days)) ? Number(body.days) : 365;
  const count = Math.min(10, Math.max(1, Number(body.count) || 1));
  const tier = body.tier === 'admin' ? 'admin' : 'pro';

  const keys = Array.from({ length: count }, () => makeLicense(tier, days));
  json(res, 200, { keys, tier, days });
}

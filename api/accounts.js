/**
 * Google accounts — operator only.
 *
 *   GET  /api/accounts                     → who has premium, and until when
 *   POST /api/accounts { op:'grant', email, days }  → a signed grant to paste
 *   POST /api/accounts { op:'revoke', email }       → the serial to add to the list
 *
 * The list is the environment, not a database: POST returns the exact string the
 * operator pastes into AEGIS_PREMIUM. That keeps one source of truth, keeps the
 * audit trail in the deployment, and means a stolen console session cannot grant
 * itself anything permanent.
 */
import { json, rateLimit, readJsonBody, requireAdmin } from './_lib/auth.js';
import { allGrants, grantSignature, normalizeEmail, stampOf } from './_lib/premium.js';

const ALLOWED_DAYS = [1, 7, 30, 90, 180, 365, 3650];

export default async function handler(req, res) {
  if (!requireAdmin(req)) {
    json(res, 403, { error: 'admin_required' });
    return;
  }

  if (req.method === 'GET') {
    const now = Date.now();
    const accounts = allGrants().map((grant) => ({
      email: grant.email,
      exp: grant.exp,
      stamp: grant.stamp,
      days: Math.max(0, Math.ceil((grant.exp - now) / 86_400_000)),
      state: grant.exp > now ? 'active' : 'expired',
      token: `${grant.email}:${grant.stamp}:${grantSignature(grant.email, grant.stamp)}`,
    }));
    json(res, 200, {
      ok: true,
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      accounts,
      active: accounts.filter((a) => a.state === 'active').length,
      days: ALLOWED_DAYS,
      now,
    });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }

  const limit = rateLimit(req, 'accounts', 30, 60_000);
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

  const email = normalizeEmail(body.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    json(res, 400, { error: 'invalid_email' });
    return;
  }

  if (body.op === 'revoke') {
    json(res, 200, { ok: true, email, addTo: 'AEGIS_REVOKED', value: email });
    return;
  }

  if (body.op !== 'grant') {
    json(res, 400, { error: 'unknown_op' });
    return;
  }

  const days = ALLOWED_DAYS.includes(Number(body.days)) ? Number(body.days) : 30;
  const exp = Date.now() + days * 86_400_000;
  const stamp = stampOf(exp);
  const token = `${email}:${stamp}:${grantSignature(email, stamp)}`;
  json(res, 200, {
    ok: true,
    email,
    days,
    exp,
    stamp,
    token,
    env: 'AEGIS_PREMIUM',
    note: 'Tempel token ini ke AEGIS_PREMIUM di Vercel (pisahkan dengan koma), lalu deploy ulang. Setelah itu akun Google ini langsung PRO saat masuk.',
  });
}

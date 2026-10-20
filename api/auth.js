/**
 * Session endpoint.
 *
 *   GET    /api/auth   → current tier (free when signed out)
 *   POST   /api/auth   → { key } or { admin } → sets an httpOnly session cookie
 *   DELETE /api/auth   → clears the cookie
 *
 * Nothing is stored server-side: the cookie *is* the session, signed with
 * AEGIS_SECRET. Rotating that secret invalidates every issued license.
 */
import {
  ADMIN_PASSWORD,
  adminPasswordMatches,
  IS_DEV_SECRET,
  SESSION_DAYS,
  CLEAR_COOKIE,
  currentSession,
  json,
  rateLimit,
  readJsonBody,
  sessionCookie,
  verifyLicense,
} from './_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Vary', 'Cookie');

  if (req.method === 'GET') {
    const session = currentSession(req);
    json(res, 200, {
      tier: session?.tier ?? 'free',
      exp: session?.exp ?? null,
      subject: session?.subject ?? null,
      adminEnabled: Boolean(ADMIN_PASSWORD),
      devSecret: IS_DEV_SECRET,
    });
    return;
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', CLEAR_COOKIE);
    json(res, 200, { tier: 'free' });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }

  const limit = rateLimit(req, 'auth', 8, 60_000);
  if (!limit.ok) {
    res.setHeader('Retry-After', '60');
    json(res, 429, { error: 'too_many_attempts' });
    return;
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    json(res, 400, { error: 'bad_request' });
    return;
  }

  const exp = Date.now() + SESSION_DAYS * 86400_000;

  // Admin console sign-in.
  if (typeof body.admin === 'string' && body.admin.length > 0) {
    if (!ADMIN_PASSWORD) {
      json(res, 501, { error: 'admin_disabled' });
      return;
    }
    if (!adminPasswordMatches(body.admin)) {
      json(res, 401, { error: 'invalid_credentials' });
      return;
    }
    const session = { tier: 'admin', exp, subject: 'console' };
    res.setHeader('Set-Cookie', sessionCookie(session));
    json(res, 200, { tier: 'admin', exp, subject: 'console' });
    return;
  }

  // License key sign-in.
  const license = verifyLicense(body.key);
  if (!license) {
    json(res, 401, { error: 'invalid_license' });
    return;
  }

  const session = { tier: license.tier, exp: Math.min(exp, license.exp), subject: license.serial };
  res.setHeader('Set-Cookie', sessionCookie(session));
  json(res, 200, { tier: session.tier, exp: session.exp, subject: session.subject });
}

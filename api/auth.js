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
  COOKIE,
  IS_DEV_SECRET,
  SESSION_DAYS,
  CLEAR_COOKIE,
  currentSession,
  json,
  parseCookies,
  rateLimit,
  readJsonBody,
  readSession,
  requestDevice,
  sessionCookie,
  verifyLicense,
} from './_lib/auth.js';
import { authorizeUrl, exchangeCode, googleConfigured, googleSession, makeState, readState } from './_lib/google.js';
import { premiumFor } from './_lib/premium.js';
import { claimDevice, DEVICE_SHAPE } from './_lib/devices.js';

export default async function handler(req, res) {
  res.setHeader('Vary', 'Cookie');

  const url = new URL(req.url, `https://${req.headers?.host || 'localhost'}`);
  const googleStep = url.searchParams.get('google');

  // ---------------------------------------------------------------- google
  if (req.method === 'GET' && googleStep === 'start') {
    if (!googleConfigured()) {
      res.statusCode = 503;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(page('Masuk dengan Google belum aktif', 'GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET belum disetel di server. Operator bisa mengaktifkannya dari Vercel, atau kamu bisa masuk dengan kunci PRO.'));
      return;
    }
    const remember = url.searchParams.get('remember') !== '0';
    const deviceRaw = String(url.searchParams.get('dev') || '').trim();
    const device = DEVICE_SHAPE.test(deviceRaw) ? deviceRaw : requestDevice(req);
    res.statusCode = 302;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Location',
      authorizeUrl({ origin: `https://${req.headers.host}`, state: makeState(remember, device) }),
    );
    res.end();
    return;
  }

  if (req.method === 'GET' && googleStep === 'callback') {
    const state = readState(url.searchParams.get('state'));
    const code = url.searchParams.get('code');
    if (!state || !code) {
      res.statusCode = 302;
      res.setHeader('Location', '/?masuk=gagal');
      res.end();
      return;
    }
    const identity = await exchangeCode({ code, origin: `https://${req.headers.host}` });
    if (!identity) {
      res.statusCode = 302;
      res.setHeader('Location', '/?masuk=gagal');
      res.end();
      return;
    }
    const premium = premiumFor(identity.email);
    const built = googleSession(identity, premium, state.remember, state.device);
    res.setHeader(
      'Set-Cookie',
      sessionCookie(
        {
          tier: built.payload.tier,
          exp: built.payload.exp,
          subject: built.payload.subject,
          name: built.payload.name,
          dev: built.payload.dev,
        },
        { remember: state.remember },
      ),
    );
    res.statusCode = 302;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', '/?masuk=ok');
    res.end();
    return;
  }

  if (req.method === 'GET') {
    const session = currentSession(req);
    // A cookie minted for another device is not an error the visitor can act
    // on: drop it and answer "signed out" so the gate appears.
    const rawCookie = readSession(parseCookies(req.headers?.cookie ?? '')[COOKIE]);
    if (rawCookie && !session) {
      res.setHeader('Set-Cookie', CLEAR_COOKIE);
      json(res, 200, {
        tier: 'free',
        exp: null,
        subject: null,
        name: '',
        email: null,
        lic: null,
        signedIn: false,
        deviceMismatch: true,
        adminEnabled: Boolean(ADMIN_PASSWORD),
        devSecret: IS_DEV_SECRET,
        google: googleConfigured(),
      });
      return;
    }
    // A Google account can be premiumed or cut off while a session is open, so
    // the grant is re-read on every status call instead of frozen in the cookie.
    const email = session?.subject && session.subject.includes('@') ? session.subject : null;
    let tier = session?.tier ?? 'free';
    let exp = session?.exp ?? null;
    if (email && tier !== 'admin') {
      const premium = premiumFor(email);
      if (premium) {
        tier = 'pro';
        exp = Math.min(exp ?? premium.exp, premium.exp);
      } else if (tier === 'pro') {
        tier = 'free';
        exp = null;
      }
    }
    json(res, 200, {
      tier,
      exp,
      subject: session?.subject ?? null,
      name: session?.name ?? '',
      email,
      lic: session?.lic ?? null,
      signedIn: Boolean(session?.subject),
      adminEnabled: Boolean(ADMIN_PASSWORD),
      devSecret: IS_DEV_SECRET,
      google: googleConfigured(),
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
  // "Ingat saya" is decided here, not in the browser: an unchecked box means a
  // cookie with no Max-Age, which dies with the browser.
  const remember = body.remember !== false;

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
    const session = { tier: 'admin', exp, subject: 'console', name: 'Operator', dev: requestDevice(req) };
    res.setHeader('Set-Cookie', sessionCookie(session, { remember }));
    json(res, 200, { tier: 'admin', exp, subject: 'console', name: 'Operator', email: null });
    return;
  }

  // License key redemption.
  //
  // A key is a claim on an account, not an alternative to signing in: the app
  // requires Google, and the key then upgrades that account. Keeping the email
  // as the session subject is what lets the same person open the app on another
  // device as FREE instead of handing out a second copy of the licence.
  const account = currentSession(req);
  if (!account || !String(account.subject || '').includes('@')) {
    json(res, 403, { error: 'google_required' });
    return;
  }

  const license = verifyLicense(body.key);
  if (!license) {
    json(res, 401, { error: 'invalid_license' });
    return;
  }

  const device = requestDevice(req) || (DEVICE_SHAPE.test(String(body.device || '')) ? String(body.device) : '');
  const claim = await claimDevice({ serial: license.serial, device, email: account.subject });
  if (!claim.ok) {
    if (claim.reason === 'device_bound') {
      json(res, 409, { error: 'key_in_use', ledger: claim.mode });
      return;
    }
    json(res, 400, { error: claim.reason || 'key_rejected', ledger: claim.mode });
    return;
  }

  const session = {
    tier: license.tier,
    exp: Math.min(exp, license.exp),
    subject: account.subject,
    name: account.name,
    lic: license.serial,
    dev: device,
  };
  res.setHeader('Set-Cookie', sessionCookie(session, { remember }));
  json(res, 200, {
    tier: session.tier,
    exp: session.exp,
    subject: session.subject,
    name: session.name,
    email: account.subject,
    lic: license.serial,
    ledger: claim.mode,
  });
}


/** Tiny HTML page for the two states that never reach the app shell. */
function page(title, body) {
  return `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#e8ecf3;color:#0a0d12;font:16px/1.6 system-ui,sans-serif;padding:24px}main{max-width:32rem}h1{font-size:1.25rem;letter-spacing:.04em;text-transform:uppercase}a{color:#0b4fd6}</style><main><h1>${title}</h1><p>${body}</p><p><a href="/">Kembali ke Aegis Sound Lab</a></p></main></html>`;
}

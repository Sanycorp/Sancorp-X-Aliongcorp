/**
 * Google sign-in, authorisation-code flow.
 *
 * Deliberately not Google Identity Services: that loads a third-party script,
 * which this app's CSP forbids (`script-src 'self'`). A redirect flow keeps the
 * policy untouched, keeps the token exchange on the server, and needs no
 * third-party cookie. The user leaves for accounts.google.com and comes back.
 *
 * Required environment:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * and an authorised redirect URI of <origin>/api/auth/google/callback — a clean
 * path, because Google compares it character for character and console
 * validation of registered URIs is friendlier to paths than to query strings.
 * The rewrite in vercel.json maps that path onto /api/auth?google=callback.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SECRET, signSession } from './auth.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function redirectUri(origin) {
  return `${String(origin).replace(/\/$/, '')}/api/auth/google/callback`;
}

/**
 * State is a signed, timestamped nonce: it proves the callback belongs to a
 * flow this server started, without a session table to store it in.
 */
export function makeState(remember, now = Date.now()) {
  const payload = `${now}.${remember ? '1' : '0'}.${randomBytes(9).toString('base64url')}`;
  const sig = createHmac('sha256', SECRET).update(`state|${payload}`).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function readState(raw, now = Date.now(), maxAgeMs = 10 * 60_000) {
  const [encoded, sig] = String(raw ?? '').split('.');
  if (!encoded || !sig) return null;
  let payload;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = createHmac('sha256', SECRET).update(`state|${payload}`).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const [stamp, remember] = payload.split('.');
  const at = Number(stamp);
  if (!Number.isFinite(at) || Math.abs(now - at) > maxAgeMs) return null;
  return { remember: remember === '1' };
}

export function authorizeUrl({ origin, state, loginHint = '' }) {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID || '');
  url.searchParams.set('redirect_uri', redirectUri(origin));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('access_type', 'online');
  if (loginHint) url.searchParams.set('login_hint', loginHint);
  return url.toString();
}

/** Exchange the code and read the identity off the ID token. */
export async function exchangeCode({ code, origin }) {
  const body = new URLSearchParams({
    code: String(code),
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uri: redirectUri(origin),
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const claims = decodeIdToken(data?.id_token);
  if (!claims) return null;
  // The token came straight from Google over TLS in exchange for our secret, so
  // the signature is already implied; the claims still have to make sense.
  const expectedAud = process.env.GOOGLE_CLIENT_ID || '';
  if (claims.aud !== expectedAud) return null;
  if (!/^(https:\/\/)?accounts\.google\.com$/.test(String(claims.iss))) return null;
  if (Number(claims.exp) * 1000 < Date.now()) return null;
  if (claims.email_verified === false || claims.email_verified === 'false') return null;
  if (!claims.email) return null;
  return {
    email: String(claims.email).toLowerCase(),
    name: String(claims.name || claims.given_name || claims.email),
    picture: String(claims.picture || ''),
    sub: String(claims.sub || ''),
  };
}

/** Reads the JWT payload without verifying — only safe right after exchangeCode. */
export function decodeIdToken(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** Session payload for a Google identity, with the grant applied. */
export function googleSession(identity, premium, remember) {
  const days = 30;
  const exp = Math.min(Date.now() + days * 86_400_000, premium ? premium.exp : Infinity);
  return {
    session: signSession({ tier: premium ? 'pro' : 'free', exp, subject: identity.email, name: identity.name }),
    payload: { tier: premium ? 'pro' : 'free', exp, subject: identity.email, name: identity.name, remember },
  };
}

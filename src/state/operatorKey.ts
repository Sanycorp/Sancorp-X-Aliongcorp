/**
 * Operator key handling for the console.
 *
 * The console key is a generated bearer secret — 120 random bits in Crockford
 * base32, e.g. `AEGIS-T867GT-1KHQVN-93SWHC-2GZCFP`. Retyping that on a phone is
 * exactly the kind of thing that ends up in a screenshot, so the gate accepts it
 * three ways:
 *
 *   1. a one-tap link `#/control?op=<key>` that signs in on load and then wipes
 *      itself out of the address bar,
 *   2. paste anywhere in the gate — no button, no clipboard permission prompt,
 *   3. typing, for the day the link is lost.
 *
 * The key rides in the `#` fragment, which browsers never send to a server, and
 * the app stores nothing: after sign-in the only credential is the httpOnly
 * session cookie.
 */

const KEY_SHAPE = /^[A-Za-z0-9-]{8,200}$/;

/**
 * Read a key out of `#/control?op=…` (or `?key=…`). Null when absent/invalid.
 *
 * Only the console route is honoured: a key that lands on another screen was
 * pasted into the wrong tab and should not be quietly spent there.
 */
export function parseOperatorKey(hash: string): string | null {
  const [path, query = ''] = hash.split('?');
  if (path.replace(/\/+$/, '') !== '#/control') return null;
  if (!query) return null;
  const params = new URLSearchParams(query);
  const key = (params.get('op') ?? params.get('key') ?? '').trim();
  return KEY_SHAPE.test(key) ? key : null;
}

/**
 * Drop the key from the address bar. `replaceState` is deliberate: a pushed
 * entry would keep the secret in the back stack and in session restore.
 */
export function scrubOperatorKey(hash = typeof location !== 'undefined' ? location.hash : ''): boolean {
  if (!parseOperatorKey(hash)) return false;
  const clean = hash.split('?')[0] || '#/control';
  try {
    history.replaceState(null, '', clean);
    return true;
  } catch {
    return false;
  }
}

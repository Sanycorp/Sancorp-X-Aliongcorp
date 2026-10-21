/**
 * This installation's identity.
 *
 * A licence key is sold once and may be activated on one device. The server is
 * stateless, so the device has to name itself: a random 128-bit id created on
 * first visit and kept in `localStorage`. It is not a fingerprint — it does not
 * read the screen, the fonts or the canvas — because those vary between two
 * visits on the same phone (rotation, browser update) and would lock a paying
 * customer out of their own device.
 *
 * The id is sent on every `/api/auth` call as `x-aegis-device`. The signed
 * session remembers the id it was issued to, so copying the cookie to another
 * browser is not enough: the other browser would present a different id and the
 * session is treated as signed out.
 *
 * Clearing site data creates a new id. That is honest and unavoidable without a
 * server database; the operator can move a binding from the console.
 */

const KEY = 'aegis.device.v1';

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < bytes; i += 1) buf[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

let cached: string | null = null;

/** Stable for this browser profile. `d` + 32 hex, matching the server's rule. */
export function deviceId(): string {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && /^d[0-9a-f]{24,40}$/.test(stored)) {
      cached = stored;
      return stored;
    }
  } catch {
    /* private mode: the id lives for this page only */
  }
  const fresh = `d${randomHex(16)}`;
  cached = fresh;
  try {
    localStorage.setItem(KEY, fresh);
  } catch {
    /* ignore */
  }
  return fresh;
}

/** Headers every auth call carries. */
export function deviceHeaders(): Record<string, string> {
  return { 'x-aegis-device': deviceId() };
}

/** `d3f2…` → `D3F2-9A1C` for a human reading it over Telegram. */
export function deviceShort(id = deviceId()): string {
  return id.replace(/^d/, '').slice(0, 8).toUpperCase().replace(/(.{4})(?=.)/, '$1-');
}

/** Test seam: forget the cached id (does not touch storage). */
export function resetDeviceCache(): void {
  cached = null;
}

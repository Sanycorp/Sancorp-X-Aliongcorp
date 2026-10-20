/**
 * Which runtime are we inside?
 *
 * The web build is served by Vercel and defended by HTTP headers. The Android
 * build ships as a Capacitor WebView and has no server at all, so it is defended
 * by the native manifest and by disabling browser features it does not need.
 * Security is therefore deliberately *not* identical between the two targets.
 */
export type Platform = 'web' | 'app';

interface CapacitorLike {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

export function capacitor(): CapacitorLike | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: CapacitorLike }).Capacitor;
}

export function isNativeApp(): boolean {
  const cap = capacitor();
  if (cap?.isNativePlatform) {
    try {
      return cap.isNativePlatform();
    } catch {
      /* fall through to the origin heuristic */
    }
  }
  if (typeof location === 'undefined') return false;
  // Capacitor serves the bundle from https://localhost; a remote web origin is
  // never localhost in production.
  return location.protocol === 'capacitor:' || (location.hostname === 'localhost' && location.port === '');
}

export function platform(): Platform {
  return isNativeApp() ? 'app' : 'web';
}

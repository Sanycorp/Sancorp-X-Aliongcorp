/**
 * "Install this as an app."
 *
 * There are two ways this product ends up on a phone and they need different
 * answers:
 *
 *  1. The Capacitor shell (APK / iOS build). Already an app — nothing to prompt,
 *     and `location` is the bundled origin. `nativeApp()` is true.
 *  2. A browser. Chrome/Edge fire `beforeinstallprompt`; we keep the event and
 *     hand it to a button. Safari never fires it, so the only honest advice is
 *     the Share → Add to Home Screen line.
 *
 * Nothing here guesses. If the browser has not offered an install, no button is
 * shown at all — a button that does nothing is worse than no button.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferred: InstallPromptEvent | null = null;
let installedThisSession = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** True inside the Capacitor build. */
export function nativeApp(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** True when the page is running as an installed app (PWA or Capacitor). */
export function standalone(): boolean {
  if (nativeApp()) return true;
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/** iOS/iPadOS Safari: no install event, but a real path through the Share sheet. */
export function iosInstallHint(): boolean {
  if (standalone()) return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function installAvailable(): boolean {
  return !standalone() && !installedThisSession && Boolean(deferred);
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Resolves to what happened, so the caller can word the toast honestly. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') installedThisSession = true;
    emit();
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

/** Called once from boot(); safe on every platform. */
export function watchInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the event: the browser only lets us prompt in response to a gesture.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    installedThisSession = true;
    deferred = null;
    emit();
  });

  const media = window.matchMedia?.('(display-mode: standalone)');
  media?.addEventListener?.('change', emit);
}

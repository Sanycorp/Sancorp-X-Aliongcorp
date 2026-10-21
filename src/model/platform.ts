/**
 * What this browser actually is.
 *
 * The same bundle runs on a 320 px Android phone with four cores, an iPad in
 * landscape, a Windows laptop with a mouse, and a 1440 px desktop. The CSS does
 * the layout with fluid units; this module supplies the facts CSS cannot see:
 * which OS, which engine, whether the screen is touch-first, whether the device
 * is slow enough that decorative effects should be skipped, and which browser
 * capabilities exist at all (Web Share, OffscreenAudioContext, `dvh`…).
 *
 * Everything is written to `<html data-*>`, so a stylesheet can adapt without a
 * single resize listener, and the UI can hide a control the browser cannot back
 * up instead of showing a button that does nothing.
 *
 * Deliberately dependency-free and side-effect-free apart from `applyPlatform`,
 * so it can be unit tested in Node.
 */

export type FormFactor = 'phone' | 'tablet' | 'desktop';
export type OsFamily = 'ios' | 'ipados' | 'android' | 'windows' | 'macos' | 'chromeos' | 'linux' | 'other';
export type Engine = 'blink' | 'webkit' | 'gecko' | 'other';
export type PerfTier = 'full' | 'lite';

export interface Capabilities {
  /** OfflineAudioContext — the whole render path depends on it. */
  audio: boolean;
  /** Web Workers — the render runs off the main thread when available. */
  worker: boolean;
  /** navigator.share with files. */
  share: boolean;
  /** File System Access API (Chrome/Edge desktop). */
  saveFilePicker: boolean;
  /** `height: 100dvh` — mobile browser toolbars. */
  dvh: boolean;
  /** CSS backdrop-filter, used by the sheet and header. */
  blur: boolean;
  /** navigator.vibrate, for haptics on Android. */
  vibrate: boolean;
}

export interface PlatformInfo {
  form: FormFactor;
  os: OsFamily;
  engine: Engine;
  /** Primary input is a finger. */
  touch: boolean;
  /** Installed as a PWA / home-screen app. */
  standalone: boolean;
  perf: PerfTier;
  cores: number;
  memory: number;
  saveData: boolean;
  capabilities: Capabilities;
}

export interface PlatformEnv {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  cores?: number;
  memory?: number;
  saveData?: boolean;
  width?: number;
  /** `display-mode: standalone` or iOS `navigator.standalone`. */
  standalone?: boolean;
  /** Media query answers, injected so tests do not need a DOM. */
  hoverNone?: boolean;
  hoverFine?: boolean;
  supports?: (property: string, value: string) => boolean;
  hasAudioContext?: boolean;
  hasWorker?: boolean;
  canShare?: boolean;
  hasSaveFilePicker?: boolean;
  hasVibrate?: boolean;
}

/** iPadOS 13+ claims to be a Mac; the touch count is what gives it away. */
function detectOs(ua: string, platform: string, touchPoints: number): OsFamily {
  const s = `${ua} ${platform}`;
  if (/android/i.test(s)) return 'android';
  if (/iphone|ipod/i.test(s)) return 'ios';
  if (/ipad/i.test(s)) return 'ipados';
  if (/cros/i.test(s)) return 'chromeos';
  if (/win/i.test(s)) return 'windows';
  if (/mac/i.test(s)) return touchPoints > 1 ? 'ipados' : 'macos';
  if (/linux|x11/i.test(s)) return 'linux';
  return 'other';
}

function detectEngine(ua: string): Engine {
  if (/firefox|fxios/i.test(ua)) return 'gecko';
  if (/edg|chrome|chromium|crios|opr|samsungbrowser/i.test(ua)) return 'blink';
  // Safari ships "Version/… Safari/…" and no Chromium token.
  if (/safari/i.test(ua)) return 'webkit';
  return 'other';
}

/**
 * A phone is not defined by its width: a 900 px desktop window is still a
 * desktop, and a 1024 px tablet in landscape is still a tablet. Touch points,
 * the UA and the viewport are all consulted, in that order of confidence.
 */
function detectForm(os: OsFamily, ua: string, touchPoints: number, width: number): FormFactor {
  if (os === 'android') return /mobile/i.test(ua) ? 'phone' : width < 600 ? 'phone' : 'tablet';
  if (os === 'ios') return 'phone';
  if (os === 'ipados') return 'tablet';
  if (touchPoints > 0 && width < 820) return 'phone';
  if (touchPoints > 0 && width < 1180) return 'tablet';
  return 'desktop';
}

export function detectPlatform(env: PlatformEnv = {}): PlatformInfo {
  const ua = env.userAgent ?? '';
  const platform = env.platform ?? '';
  const touchPoints = env.maxTouchPoints ?? 0;
  const width = env.width ?? 1280;
  const os = detectOs(ua, platform, touchPoints);
  const engine = detectEngine(ua);
  const cores = env.cores ?? 8;
  const memory = env.memory ?? 8;
  const saveData = Boolean(env.saveData);
  const touch = touchPoints > 0 || Boolean(env.hoverNone) || os === 'android' || os === 'ios' || os === 'ipados';

  const supports = env.supports ?? (() => false);
  const capabilities: Capabilities = {
    audio: env.hasAudioContext ?? true,
    worker: env.hasWorker ?? true,
    share: Boolean(env.canShare),
    saveFilePicker: Boolean(env.hasSaveFilePicker),
    dvh: supports('height', '100dvh'),
    blur: supports('backdrop-filter', 'blur(2px)') || supports('-webkit-backdrop-filter', 'blur(2px)'),
    vibrate: Boolean(env.hasVibrate),
  };

  // Decoration is the first thing to go on a slow device. The DSP is never
  // reduced: a cheap phone gets the same audio, just fewer shadows.
  const lite = saveData || cores <= 4 || memory <= 4;

  return {
    form: detectForm(os, ua, touchPoints, width),
    os,
    engine,
    touch,
    standalone: Boolean(env.standalone),
    perf: lite ? 'lite' : 'full',
    cores,
    memory,
    saveData,
    capabilities,
  };
}

/** Reads the real browser. Every read is guarded: this also runs in vitest. */
export function readEnvironment(): PlatformEnv {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return {};
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
    standalone?: boolean;
    canShare?: (data?: ShareData) => boolean;
  };
  const media = (query: string): boolean => {
    try {
      return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  const supports = (property: string, value: string): boolean => {
    try {
      return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
        ? CSS.supports(property, value)
        : false;
    } catch {
      return false;
    }
  };
  return {
    userAgent: nav.userAgent,
    platform: (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? nav.platform ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    cores: nav.hardwareConcurrency || 8,
    memory: nav.deviceMemory || 8,
    saveData: Boolean(nav.connection?.saveData),
    width: window.innerWidth,
    standalone: media('(display-mode: standalone)') || nav.standalone === true,
    hoverNone: media('(hover: none)'),
    hoverFine: media('(hover: hover) and (pointer: fine)'),
    supports,
    hasAudioContext: typeof (window.AudioContext ?? (window as { webkitAudioContext?: unknown }).webkitAudioContext) === 'function',
    hasWorker: typeof Worker === 'function',
    canShare: typeof nav.canShare === 'function',
    hasSaveFilePicker: typeof (window as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function',
    hasVibrate: typeof nav.vibrate === 'function',
  };
}

export const PLATFORM_LABELS: Record<OsFamily, string> = {
  ios: 'iOS',
  ipados: 'iPadOS',
  android: 'Android',
  windows: 'Windows',
  macos: 'macOS',
  chromeos: 'ChromeOS',
  linux: 'Linux',
  other: 'LAINNYA',
};

export const FORM_LABELS: Record<FormFactor, string> = {
  phone: 'HANDPHONE',
  tablet: 'TABLET',
  desktop: 'DESKTOP',
};

/**
 * Writes the facts onto `<html>`.
 *
 * `data-perf="lite"` is read by the stylesheet to drop backdrop filters and
 * long transitions, and by `main.ts` to skip pointer-only decoration. The
 * capability flags are negative (`data-no-share`) so a stylesheet can hide a
 * control with one selector instead of a JS branch.
 */
export function applyPlatform(doc: Document, info: PlatformInfo): void {
  const root = doc.documentElement;
  root.dataset.form = info.form;
  root.dataset.os = info.os;
  root.dataset.engine = info.engine;
  root.dataset.input = info.touch ? 'touch' : 'pointer';
  root.dataset.perf = info.perf;
  root.dataset.standalone = info.standalone ? '1' : '0';
  const caps = info.capabilities;
  const flag = (name: string, ok: boolean): void => {
    if (ok) delete root.dataset[name];
    else root.dataset[name] = '1';
  };
  flag('noAudio', caps.audio);
  flag('noWorker', caps.worker);
  flag('noShare', caps.share);
  flag('noSaveFile', caps.saveFilePicker);
  flag('noDvh', caps.dvh);
  flag('noBlur', caps.blur);
  flag('noVibrate', caps.vibrate);
  root.dataset.cores = String(info.cores);
}

/** Boot-time detection + application, with the live form factor on resize. */
export function bootPlatform(): PlatformInfo {
  if (typeof document === 'undefined') {
    return detectPlatform();
  }
  const info = detectPlatform(readEnvironment());
  applyPlatform(document, info);

  // Old Android WebViews lack dvh; they get a measured fallback unit.
  const setUnit = (): void => {
    document.documentElement.style.setProperty('--vh', `${window.innerHeight / 100}px`);
  };
  setUnit();

  // A desktop window narrowed to phone width should lay out as a phone; the
  // form factor is the one fact that changes while the app is running.
  let lastForm = info.form;
  let timer = 0;
  window.addEventListener(
    'resize',
    () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setUnit();
        const next = detectPlatform({ ...readEnvironment(), width: window.innerWidth });
        if (next.form === lastForm) return;
        lastForm = next.form;
        applyPlatform(document, next);
      }, 180);
    },
    { passive: true },
  );
  return info;
}

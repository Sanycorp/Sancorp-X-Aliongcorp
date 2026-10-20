import { trustedTypesEnforced, trustedTypesSupported } from './sanitize';
import { isNativeApp } from './platform';

/**
 * Live security posture, split by target.
 *
 * WEB (Vercel)   — everything is server-enforced: CSP headers, COOP/COEP,
 *                  HSTS, Permissions-Policy, SRI, service worker, CSP reports.
 * APP (Android)  — there is no server, so headers are irrelevant. The app is
 *                  defended by the native manifest (no cleartext, no backups),
 *                  by refusing remote navigation, by not registering a service
 *                  worker, and by the same in-bundle Trusted Types + SRI.
 *
 * The panel never shows web controls on the APK or vice versa.
 */

export type PostureState = 'on' | 'partial' | 'off';

export interface PostureItem {
  id: string;
  label: string;
  state: PostureState;
  detail: string;
}

export interface Posture {
  platform: 'web' | 'app';
  score: number;
  total: number;
  items: PostureItem[];
}

const cspCache = new Map<string, string>();

async function readCspFromResponse(): Promise<string> {
  if (typeof fetch !== 'function' || isNativeApp()) return '';
  const key = location.href.split('#')[0];
  const cached = cspCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(key, { cache: 'no-store', credentials: 'same-origin' });
    const header =
      res.headers.get('content-security-policy') ??
      res.headers.get('content-security-policy-report-only') ??
      '';
    cspCache.set(key, header);
    return header;
  } catch {
    cspCache.set(key, '');
    return '';
  }
}

function sriSnapshot(): { covered: number; total: number } {
  if (typeof document === 'undefined') return { covered: 0, total: 0 };
  const nodes = Array.from(
    document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"]'),
  );
  const covered = nodes.filter((n) => n.hasAttribute('integrity')).length;
  return { covered, total: nodes.length };
}

function trustItems(): PostureItem[] {
  const enforced = trustedTypesEnforced();
  const supported = trustedTypesSupported();
  return [
    {
      id: 'tt',
      label: 'TRUSTED TYPES',
      state: enforced ? 'on' : supported ? 'partial' : 'off',
      detail: enforced
        ? 'require-trusted-types-for script · policy aegis (DOMPurify)'
        : supported
          ? 'API tersedia, enforcement belum aktif di origin ini'
          : 'belum didukung WebView/browser ini',
    },
  ];
}

function sriItem(): PostureItem {
  const sri = sriSnapshot();
  const ratio = sri.total === 0 ? 0 : sri.covered / sri.total;
  return {
    id: 'sri',
    label: 'SUB-RESOURCE INTEGRITY',
    state: sri.total > 0 && ratio === 1 ? 'on' : sri.covered > 0 ? 'partial' : 'off',
    detail: `${sri.covered}/${sri.total} bundle bertanda tangan sha-384`,
  };
}

async function storageItem(): Promise<PostureItem> {
  let persisted = false;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    persisted = false;
  }
  return {
    id: 'storage',
    label: 'PENYIMPANAN LOKAL',
    state: persisted ? 'on' : 'partial',
    detail: persisted
      ? 'storage persisten, audio tidak pernah keluar perangkat'
      : 'best-effort, tetap lokal di perangkat',
  };
}

async function webPosture(): Promise<Posture> {
  const csp = await readCspFromResponse();
  const tokens = csp.toLowerCase();
  const items: PostureItem[] = [];

  const secure = typeof window !== 'undefined' && window.isSecureContext;
  items.push({
    id: 'https',
    label: 'HTTPS / SECURE CONTEXT',
    state: secure ? 'on' : 'off',
    detail: secure ? 'origin terenkripsi · crypto.subtle tersedia' : 'origin tidak aman',
  });

  const hasDefaultNone = tokens.includes("default-src 'none'");
  const hasFrameAncestors = tokens.includes("frame-ancestors 'none'");
  items.push({
    id: 'csp',
    label: 'CONTENT SECURITY POLICY',
    state: csp && hasDefaultNone && hasFrameAncestors ? 'on' : csp ? 'partial' : 'off',
    detail: csp
      ? `level 3${hasDefaultNone ? ' · default-src none' : ''}${hasFrameAncestors ? ' · frame-ancestors none' : ''}${tokens.includes("require-trusted-types-for 'script'") ? ' · TT' : ''}`
      : 'header belum terkirim (dev server / bukan Vercel)',
  });

  items.push(...trustItems());

  const isolated = typeof window !== 'undefined' && window.crossOriginIsolated === true;
  items.push({
    id: 'isolation',
    label: 'CROSS-ORIGIN ISOLATION',
    state: isolated ? 'on' : 'partial',
    detail: isolated ? 'COOP same-origin + COEP credentialless' : 'COOP/COEP belum aktif di origin ini',
  });

  items.push(sriItem());

  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  const controlled = Boolean(sw?.controller);
  items.push({
    id: 'sw',
    label: 'SERVICE WORKER',
    state: controlled ? 'on' : sw ? 'partial' : 'off',
    detail: controlled
      ? `cache shell aktif · ${sw?.controller?.scriptURL.split('/').pop() ?? 'sw.js'}`
      : 'belum mengontrol halaman (reload sekali)',
  });

  items.push(await storageItem());

  return { platform: 'web', score: items.filter((i) => i.state === 'on').length, total: items.length, items };
}

async function appPosture(): Promise<Posture> {
  const items: PostureItem[] = [];
  const secure = typeof window !== 'undefined' && window.isSecureContext;

  items.push({
    id: 'sandbox',
    label: 'WEBVIEW SANDBOX',
    state: secure ? 'on' : 'partial',
    detail: `${location.protocol}//${location.host} · aset lokal, tanpa server`,
  });

  items.push(...trustItems());
  items.push(sriItem());

  // Native manifest guarantees, applied by tools/android-harden.mjs at build time.
  items.push({
    id: 'cleartext',
    label: 'CLEARTEXT TRAFFIC',
    state: 'on',
    detail: 'manifest: usesCleartextTraffic=false + network_security_config',
  });
  items.push({
    id: 'remote',
    label: 'REMOTE NAVIGATION',
    state: 'on',
    detail: 'allowNavigation kosong — WebView tidak boleh keluar origin',
  });
  items.push({
    id: 'backup',
    label: 'CLOUD BACKUP',
    state: 'on',
    detail: 'allowBackup=false + data_extraction_rules (cloud & transfer ditolak)',
  });

  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  items.push({
    id: 'sw',
    label: 'SERVICE WORKER',
    state: sw ? 'on' : 'off',
    detail: sw
      ? 'tidak didaftarkan di APK — aset sudah ada di dalam paket'
      : 'API tidak tersedia di WebView ini (memang diinginkan)',
  });

  items.push(await storageItem());

  return { platform: 'app', score: items.filter((i) => i.state === 'on').length, total: items.length, items };
}

export function readPosture(): Promise<Posture> {
  return isNativeApp() ? appPosture() : webPosture();
}

let pending: Promise<Posture> | null = null;
export function postureOnce(refresh = false): Promise<Posture> {
  if (!pending || refresh) pending = readPosture();
  return pending;
}

export function postureVerdict(p: Posture): string {
  if (p.score === p.total) return 'HARDENED';
  if (p.score >= Math.ceil(p.total * 0.7)) return 'GUARDED';
  if (p.score > 0) return 'PARTIAL';
  return 'OPEN';
}

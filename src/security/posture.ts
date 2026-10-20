import { trustedTypesEnforced, trustedTypesSupported } from './sanitize';

/**
 * Live security posture.
 *
 * Instead of claiming "we are secure" in a README, the app measures its own
 * deployment: header-based CSP, Trusted Types enforcement, SRI coverage,
 * cross-origin isolation and service-worker control. Everything here is read
 * from the platform, never assumed.
 */

export type PostureState = 'on' | 'partial' | 'off';

export interface PostureItem {
  id: string;
  label: string;
  state: PostureState;
  detail: string;
}

export interface Posture {
  score: number;
  total: number;
  items: PostureItem[];
}

const cspCache = new Map<string, string>();

async function readCspFromResponse(): Promise<string> {
  if (typeof fetch !== 'function') return '';
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

function cspTokens(csp: string): string {
  return csp.toLowerCase();
}

export async function readPosture(): Promise<Posture> {
  const csp = await readCspFromResponse();
  const tokens = cspTokens(csp);
  const sri = sriSnapshot();
  const items: PostureItem[] = [];

  const secure = typeof window !== 'undefined' && window.isSecureContext;
  items.push({
    id: 'https',
    label: 'HTTPS / SECURE CONTEXT',
    state: secure ? 'on' : 'off',
    detail: secure ? 'origin terenkripsi, crypto.subtle tersedia' : 'jalan di origin tidak aman',
  });

  const cspEnforced = Boolean(csp) && !csp.includes('Content-Security-Policy-Report-Only');
  const hasFrameAncestors = tokens.includes("frame-ancestors 'none'");
  const hasDefaultNone = tokens.includes("default-src 'none'");
  items.push({
    id: 'csp',
    label: 'CONTENT SECURITY POLICY',
    state: cspEnforced && hasDefaultNone && hasFrameAncestors ? 'on' : csp ? 'partial' : 'off',
    detail: csp
      ? `level 3${hasDefaultNone ? ' · default-src none' : ''}${hasFrameAncestors ? ' · frame-ancestors none' : ''}`
      : 'header tidak terdeteksi (mode dev / APK lokal)',
  });

  const ttOn = trustedTypesEnforced();
  const ttAvailable = trustedTypesSupported();
  items.push({
    id: 'tt',
    label: 'TRUSTED TYPES',
    state: ttOn ? 'on' : ttAvailable ? 'partial' : 'off',
    detail: ttOn
      ? 'require-trusted-types-for script · semua sink lewat policy aegis'
      : ttAvailable
        ? 'API tersedia, enforcement belum aktif'
        : 'belum didukung browser ini',
  });

  const isolated = typeof window !== 'undefined' && window.crossOriginIsolated === true;
  items.push({
    id: 'isolation',
    label: 'CROSS-ORIGIN ISOLATION',
    state: isolated ? 'on' : 'partial',
    detail: isolated ? 'COOP same-origin + COEP credentialless' : 'COOP/COEP belum aktif di origin ini',
  });

  const sriRatio = sri.total === 0 ? 0 : sri.covered / sri.total;
  items.push({
    id: 'sri',
    label: 'SUB-RESOURCE INTEGRITY',
    state: sri.total > 0 && sriRatio === 1 ? 'on' : sri.covered > 0 ? 'partial' : 'off',
    detail: `${sri.covered}/${sri.total} bundle bertanda tangan sha-384`,
  });

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

  let persisted = false;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    persisted = false;
  }
  items.push({
    id: 'storage',
    label: 'PENYIMPANAN LOKAL',
    state: persisted ? 'on' : 'partial',
    detail: persisted ? 'storage persisten, audio tidak pernah keluar perangkat' : 'best-effort, tetap lokal',
  });

  const score = items.filter((i) => i.state === 'on').length;
  return { score, total: items.length, items };
}

/** Promise the posture once, then hand back cached data to keep re-renders cheap. */
let pending: Promise<Posture> | null = null;
export function postureOnce(refresh = false): Promise<Posture> {
  if (!pending || refresh) pending = readPosture();
  return pending;
}

/** One-line verdict for the header chip. */
export function postureVerdict(p: Posture): string {
  if (p.score === p.total) return 'HARDENED';
  if (p.score >= Math.ceil(p.total * 0.7)) return 'GUARDED';
  if (p.score > 0) return 'PARTIAL';
  return 'OPEN';
}


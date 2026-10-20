// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { readPosture } from '../src/security/posture';
import { safeHtml, setHtml, trustedTypesEnforced } from '../src/security/sanitize';

const root = resolve(__dirname, '..');
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
  framework: string;
  outputDirectory: string;
  headers: { source: string; headers: { key: string; value: string }[] }[];
  rewrites: { source: string; destination: string }[];
};

const globalHeaders = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]),
);
const headerFor = (source: string): Record<string, string> =>
  Object.fromEntries(vercel.headers.find((h) => h.source === source)?.headers.map((h) => [h.key, h.value]) ?? []);
const csp = globalHeaders['Content-Security-Policy'];

describe('deployment security headers', () => {
  it('targets the static Vite build', () => {
    expect(vercel.framework).toBe('vite');
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.rewrites[0].destination).toBe('/index.html');
  });

  it('locks scripts down to same-origin with Trusted Types enforced', () => {
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("require-trusted-types-for 'script'");
    expect(csp).toMatch(/trusted-types [^;]*aegis/);
    expect(csp).toContain('report-uri /api/csp-report');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it('has no inline style allowance left', () => {
    expect(csp).not.toMatch(/style-src[^;]*unsafe-inline/);
    expect(csp).toContain("style-src 'self'");
  });

  it('sets the transport and isolation headers browsers expect in 2026', () => {
    expect(globalHeaders['Strict-Transport-Security']).toMatch(/max-age=63072000; includeSubDomains; preload/);
    expect(globalHeaders['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(globalHeaders['Cross-Origin-Embedder-Policy']).toBe('credentialless');
    expect(globalHeaders['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(globalHeaders['Origin-Agent-Cluster']).toBe('?1');
    expect(globalHeaders['X-Content-Type-Options']).toBe('nosniff');
    expect(globalHeaders['X-Frame-Options']).toBe('DENY');
    expect(globalHeaders['Referrer-Policy']).toBe('no-referrer');
    expect(globalHeaders['X-XSS-Protection']).toBe('0');
  });

  it('denies powerful APIs but keeps share and clipboard', () => {
    const policy = globalHeaders['Permissions-Policy'];
    for (const denied of ['camera=()', 'microphone=()', 'geolocation=()', 'usb=()', 'serial=()', 'payment=()']) {
      expect(policy).toContain(denied);
    }
    expect(policy).toContain('web-share=(self)');
    expect(policy).toContain('clipboard-write=(self)');
    expect(policy).toContain('cross-origin-isolated=(self)');
  });

  it('keeps the service worker uncacheable and assets immutable', () => {
    expect(headerFor('/sw.js')['Cache-Control']).toContain('no-store');
    expect(headerFor('/sw.js')['Service-Worker-Allowed']).toBe('/');
    expect(headerFor('/assets/(.*)')['Cache-Control']).toBe('public, max-age=31536000, immutable');
    expect(headerFor('/api/(.*)')['Cache-Control']).toContain('no-store');
  });
});

describe('service worker guards', () => {
  const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8');

  it('refuses cross-origin, non-GET and API traffic', () => {
    expect(sw).toContain("req.method !== 'GET'");
    expect(sw).toContain('url.origin !== self.location.origin');
    expect(sw).toContain("url.pathname.startsWith('/api/')");
  });

  it('only caches clean, basic responses', () => {
    expect(sw).toContain("response.type !== 'basic'");
    expect(sw).toContain("cc.includes('no-store')");
    expect(sw).toContain("cc.includes('private')");
  });
});

describe('security.txt', () => {
  const body = readFileSync(resolve(root, 'public/.well-known/security.txt'), 'utf8');
  const field = (name: string): string =>
    body.split('\n').find((line) => line.startsWith(`${name}:`))?.slice(name.length + 2) ?? '';

  it('is a valid RFC 9116 document with a future expiry', () => {
    expect(field('Contact')).toMatch(/^https:\/\//);
    expect(field('Canonical')).toMatch(/^https:\/\//);
    expect(new Date(field('Expires')).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('CSP report endpoint', () => {
  type Handler = (req: unknown, res: unknown) => void;

  const makeRes = () => {
    const state = { status: 0, body: '', headers: {} as Record<string, string> };
    const res = {
      status(code: number) {
        state.status = code;
        return res;
      },
      setHeader(key: string, value: string) {
        state.headers[key] = value;
        return res;
      },
      end() {
        return res;
      },
      get headersSent() {
        return state.status !== 0;
      },
    };
    return { res, state };
  };

  const run = async (method: string, type: string, payload: string) => {
    const { default: handler } = (await import('../api/csp-report.js')) as { default: Handler };
    const req = new EventEmitter() as EventEmitter & { method: string; headers: Record<string, string> };
    req.method = method;
    req.headers = { 'content-type': type };
    const { res, state } = makeRes();
    handler(req, res);
    setImmediate(() => {
      req.emit('data', payload);
      req.emit('end');
    });
    await new Promise((r) => setTimeout(r, 30));
    return state;
  };

  it('rejects anything that is not a POST', async () => {
    const state = await run('GET', 'application/csp-report', '{}');
    expect(state.status).toBe(405);
    expect(state.headers.Allow).toBe('POST');
  });

  it('rejects an unexpected content type', async () => {
    const state = await run('POST', 'application/json', '{}');
    expect(state.status).toBe(415);
  });

  it('accepts a CSP report and logs only sanitised fields', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const state = await run(
      'POST',
      'application/csp-report',
      JSON.stringify({
        'csp-report': {
          'document-uri': 'https://aegis.test/deck?secret=1#frag',
          'violated-directive': 'script-src',
          'blocked-uri': 'https://evil.test/x.js?token=abc',
          disposition: 'enforce',
        },
      }),
    );
    expect(state.status).toBe(204);
    const logged = String(warn.mock.calls[0]?.[1] ?? '');
    expect(logged).toContain('script-src');
    expect(logged).not.toContain('secret=1');
    expect(logged).not.toContain('token=abc');
    warn.mockRestore();
  });

  it('drops malformed bodies', async () => {
    const state = await run('POST', 'application/csp-report', 'not json');
    expect(state.status).toBe(400);
  });
});

describe('sanitised HTML sinks', () => {
  it('strips scripts, event handlers and javascript: urls', () => {
    const out = String(safeHtml('<b>ok</b><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>'));
    expect(out).toContain('<b>ok</b>');
    expect(out.toLowerCase()).not.toContain('<script');
    expect(out.toLowerCase()).not.toContain('onerror');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('keeps the SVG markup the UI depends on', () => {
    const out = setHtml as unknown;
    expect(out).toBeTypeOf('function');
    const host = document.createElement('div');
    setHtml(host, '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M4 4h16"/></svg>');
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('path')?.getAttribute('d')).toBe('M4 4h16');
  });

  it('reads enforcement from the CSP instead of probing', () => {
    // No CSP → nothing is being enforced.
    expect(trustedTypesEnforced()).toBe(false);
    expect(trustedTypesEnforced("script-src 'self'")).toBe(false);
    // The shipped header must be recognised.
    expect(trustedTypesEnforced(csp)).toBe(true);
  });
});

describe('posture reader', () => {
  it('returns a full, well-formed report', async () => {
    const posture = await readPosture();
    expect(posture.items).toHaveLength(7);
    expect(posture.total).toBe(7);
    expect(posture.score).toBeGreaterThanOrEqual(0);
    expect(posture.score).toBeLessThanOrEqual(7);
    const ids = posture.items.map((i) => i.id);
    expect(ids).toEqual(['https', 'csp', 'tt', 'isolation', 'sri', 'sw', 'storage']);
    for (const item of posture.items) {
      expect(['on', 'partial', 'off']).toContain(item.state);
      expect(item.detail.length).toBeGreaterThan(0);
    }
  });
});

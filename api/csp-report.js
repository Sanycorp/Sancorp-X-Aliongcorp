/*
 * CSP violation collector (Vercel Node function).
 *
 * Deliberately dumb: it authenticates nothing, stores nothing, echoes nothing.
 * It validates the report envelope, keeps only the fields that are useful for
 * triage, strips query strings/fragments from URIs and drops the payload on the
 * floor after logging. A browser cannot use this endpoint to exfiltrate data
 * into our logs beyond a directive name.
 */
import { json, requireAdmin } from './_lib/auth.js';

const MAX_BYTES = 8192;
const KEEP = 50;

/** Per-instance ring buffer. Vercel instances are short-lived; this is a live
 *  sample of recent violations, not an analytics warehouse. */
const recent = [];

function remember(entry) {
  recent.unshift({ ...entry, at: Date.now() });
  if (recent.length > KEEP) recent.length = KEEP;
}

const SAFE_DIRECTIVE = /^[a-z0-9-]{1,64}$/;

function trimUri(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value, 'https://invalid.local');
    return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 200);
  } catch {
    return String(value).slice(0, 200);
  }
}

function pick(report) {
  if (!report || typeof report !== 'object') return null;
  const directive = String(report['violated-directive'] ?? report.effectiveDirective ?? '');
  if (!SAFE_DIRECTIVE.test(directive)) return null;
  return {
    directive,
    blocked: trimUri(report['blocked-uri'] ?? report.blockedURL ?? ''),
    document: trimUri(report['document-uri'] ?? report.documentURL ?? ''),
    disposition: String(report.disposition ?? 'enforce').slice(0, 32),
    source: String(report['source-file'] ?? report.sourceFile ?? '').slice(0, 120),
    line: Number(report['line-number'] ?? report.lineNumber ?? 0) || 0,
  };
}

export default function handler(req, res) {
  // Admin console reads the sample.
  if (req.method === 'GET') {
    if (!requireAdmin(req)) {
      json(res, 403, { error: 'admin_required' });
      return;
    }
    json(res, 200, { count: recent.length, reports: recent.slice(0, KEEP) });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }

  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/csp-report' && type !== 'application/reports+json') {
    json(res, 415, { error: 'unsupported_media_type' });
    return;
  }

  let body = '';
  let overflow = false;
  req.on('data', (chunk) => {
    if (overflow) return;
    body += chunk;
    if (body.length > MAX_BYTES) {
      overflow = true;
      body = '';
      json(res, 413, { error: 'too_large' });
    }
  });

  req.on('end', () => {
    if (overflow) return;
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      json(res, 400, { error: 'bad_request' });
      return;
    }

    const raw = Array.isArray(parsed)
      ? parsed.map((entry) => entry?.body).filter(Boolean)
      : [parsed['csp-report'] ?? parsed.body].filter(Boolean);

    for (const candidate of raw.slice(0, 10)) {
      const clean = pick(candidate);
      if (clean) {
        remember(clean);
        console.warn('[csp]', JSON.stringify(clean));
      }
    }

    res.statusCode = 204;
    res.end();
  });

  req.on('error', () => {
    if (!res.headersSent) json(res, 400, { error: 'bad_request' });
  });
}

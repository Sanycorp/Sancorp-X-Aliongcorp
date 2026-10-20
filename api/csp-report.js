/*
 * CSP violation collector (Vercel Node function).
 *
 * Deliberately dumb: it authenticates nothing, stores nothing, echoes nothing.
 * It validates the report envelope, keeps only the fields that are useful for
 * triage, strips query strings/fragments from URIs and drops the payload on the
 * floor after logging. A browser cannot use this endpoint to exfiltrate data
 * into our logs beyond a directive name.
 */
const MAX_BYTES = 8192;

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
  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'POST').end();
    return;
  }

  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/csp-report' && type !== 'application/reports+json') {
    res.status(415).end();
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
      res.status(413).end();
    }
  });

  req.on('end', () => {
    if (overflow) return;
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.status(400).end();
      return;
    }

    const raw = Array.isArray(parsed)
      ? parsed.map((entry) => entry?.body).filter(Boolean)
      : [parsed['csp-report'] ?? parsed.body].filter(Boolean);

    for (const candidate of raw.slice(0, 10)) {
      const clean = pick(candidate);
      if (clean) console.warn('[csp]', JSON.stringify(clean));
    }

    res.status(204).end();
  });

  req.on('error', () => {
    if (!res.headersSent) res.status(400).end();
  });
}

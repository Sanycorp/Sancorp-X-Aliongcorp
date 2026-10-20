#!/usr/bin/env node
/**
 * Production probe.
 *
 * Verifies the *deployed* origin — not the bundle, not the tests. Every check
 * below is something that has broken before or that the business depends on:
 * security headers surviving the CDN, SRI still on the entry, the license
 * endpoint refusing anonymous callers, and both server secrets actually set.
 *
 *   node tools/probe-prod.mjs                       # default origin
 *   node tools/probe-prod.mjs https://example.com   # explicit origin
 *
 * Exit code 0 only when every check passes.
 */

import { appendFileSync, readFileSync } from 'node:fs';

const ORIGIN = (process.argv[2] || process.env.PROBE_ORIGIN || 'https://sanayacorp-aegismusic.vercel.app').replace(/\/$/, '');

/** The version this repo is supposed to be serving. Hardcoding it here made a
 *  release turn the probe red for no reason, so it is read from package.json. */
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  const mark = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Mirror the result table into the Actions run summary so a red run is
 *  diagnosable from the run page alone (logs are not always reachable). */
const summarise = () => {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const failed = results.filter((r) => !r.ok);
  const rows = results
    .map((r) => `| ${r.ok ? '✅' : '❌'} | ${r.name} | ${r.detail || ''} |`)
    .join('\n');
  const body = `\n### Probe ${ORIGIN}\n\n| | check | detail |\n| --- | --- | --- |\n${rows}\n\n**${results.length - failed.length}/${results.length} passed**\n`;
  try {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, body);
  } catch {
    /* summary is best-effort */
  }
};

const get = async (path, init = {}) => {
  const res = await fetch(ORIGIN + path, { redirect: 'manual', ...init });
  const body = await res.text();
  return { res, body };
};

const has = (res, key, needle) => (res.headers.get(key) || '').toLowerCase().includes(needle);

const index = await get(`/?probe=${Date.now()}`);
check('origin responds', index.res.status === 200, `HTTP ${index.res.status}`);

// --- delivery layer -------------------------------------------------------
const csp = index.res.headers.get('content-security-policy') || '';
check('CSP default-src none', csp.includes("default-src 'none'"));
check('CSP trusts only self for scripts', csp.includes("script-src 'self'"));
check('Trusted Types enforced', csp.includes("require-trusted-types-for 'script'"));
check('CSP report endpoint set', csp.includes('report-uri /api/csp-report'));
check('frame-ancestors none', csp.includes("frame-ancestors 'none'"));
check('HSTS preload', has(index.res, 'strict-transport-security', 'preload'));
check('COOP same-origin', has(index.res, 'cross-origin-opener-policy', 'same-origin'));
check('COEP credentialless', has(index.res, 'cross-origin-embedder-policy', 'credentialless'));
check('nosniff', has(index.res, 'x-content-type-options', 'nosniff'));
check('referrer no-referrer', has(index.res, 'referrer-policy', 'no-referrer'));
check('permissions-policy denies camera', has(index.res, 'permissions-policy', 'camera=()'));

const sri = [...index.body.matchAll(/<(?:script|link)[^>]*(?:src|href)="([^"]+)"[^>]*integrity="sha384-([^"]+)"/g)];
check('SRI on entry assets', sri.length >= 2, `${sri.length} signed`);

// --- identity in the chrome -----------------------------------------------
/**
 * The company seal is web furniture, not page content: it must reach the visitor
 * as the tab icon and the share card, and must not reappear as a plate inside a
 * screen. A 404 here is what a broken favicon looks like from the outside.
 */
const svgIcon = index.body.match(/rel="icon" type="image\/svg\+xml" href="([^"]+)"/)?.[1];
check('vector tab icon declared', Boolean(svgIcon), svgIcon || 'no svg icon in head');
if (svgIcon) {
  const icon = await get(svgIcon);
  check(
    'vector tab icon served',
    icon.res.status === 200 && icon.body.includes('Sanayacorp'),
    `HTTP ${icon.res.status} · ${icon.res.headers.get('content-type') || 'no type'}`,
  );
}
check('pinned-tab mask icon declared', index.body.includes('rel="mask-icon"'));
check(
  'share card points at the company icon',
  index.body.includes(`property="og:image" content="${ORIGIN}/icons/icon-512.png"`),
);

// --- the bundle -----------------------------------------------------------
/**
 * The alias can serve the previous deployment's HTML for a few seconds after a
 * promotion, and old assets are not reachable from the new deployment. Fetch the
 * page again on every attempt instead of trusting the first copy, otherwise a
 * brand-new release is graded against a bundle that no longer exists.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function resolveBundle(attempts = 4) {
  let lastPath = '';
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const page = await get(`/?probe=${Date.now()}`);
    const raw = page.body.match(/src="([^"]*assets\/index-[^"]+\.js)"/)?.[1];
    if (raw) {
      // Vite emits relative asset URLs (`./assets/...`); make them absolute.
      lastPath = `/${raw.replace(/^\.?\//, '')}`;
      const bundle = await get(lastPath);
      lastStatus = bundle.res.status;
      if (lastStatus === 200) return { path: lastPath, bundle };
    }
    if (attempt < attempts - 1) await sleep(2500);
  }
  return { path: lastPath, bundle: { res: { status: lastStatus }, body: '' } };
}

const resolved = await resolveBundle();
const entry = resolved.path;
if (entry && resolved.bundle.res.status === 200) {
  const bundle = resolved.bundle;
  check('entry bundle served', true, entry.split('/').pop());
  // A dependency version can appear before ours, so look for the declared
  // version as a quoted literal instead of grabbing "the first semver".
  const version = bundle.body.match(/["'`](\d+\.\d+\.\d+)["'`]/)?.[1] ?? 'unknown';
  const declared =
    bundle.body.includes(`"${PKG.version}"`) ||
    bundle.body.includes(`'${PKG.version}'`) ||
    bundle.body.includes(`\`${PKG.version}\``);
  check(`version ${PKG.version}`, declared, version);
  check('operator app shipped', bundle.body.includes('AKSES OPERATOR') && bundle.body.includes('AEGIS OPS'));
  check('ledger shipped', bundle.body.includes('DAFTAR AKUN'));
  check('account sheet shipped', bundle.body.includes('AKTIFKAN PRO'));
  check('shop channel shipped', bundle.body.includes('ElTzyy8'));
  check('price shipped', bundle.body.includes('Rp 5.000'));
  check('locked preset copy shipped', bundle.body.includes('arsenal PRO'));
  check('rating block shipped', bundle.body.includes('KIRIM PENILAIAN') && bundle.body.includes('PRESET AKTIF'));
  check('bundle immutable', (bundle.res.headers.get('cache-control') || '').includes('immutable'));
  check('seal is chrome, not page content', !bundle.body.includes('brand-block'));
} else {
  check('entry bundle served', false, entry ? `${entry.split('/').pop()} HTTP ${resolved.bundle.res.status}` : 'entry script not found');
}

// --- server ---------------------------------------------------------------
const rating = await get('/api/rating');
let ratingBody = null;
try {
  ratingBody = JSON.parse(rating.body);
} catch {
  ratingBody = null;
}
check(
  'rating endpoint answers aggregates',
  rating.res.status === 200 && Boolean(ratingBody?.summary) && !('ratings' in (ratingBody ?? {})),
  `HTTP ${rating.res.status}`,
);

const health = await get('/api/health');
let healthJson = {};
try {
  healthJson = JSON.parse(health.body);
} catch {
  /* handled below */
}
check('health 200', health.res.status === 200 && healthJson.ok === true);
check('health reports prod env', healthJson.env === 'production', `${healthJson.env} · ${healthJson.region ?? '?'}`);
check('health commit is a sha', /^[0-9a-f]{7,40}$/.test(healthJson.commit || ''), healthJson.commit);

const auth = await get('/api/auth');
const authJson = JSON.parse(auth.body || '{}');
check('auth says free when signed out', authJson.tier === 'free');
check('AEGIS_SECRET set (not dev)', authJson.devSecret === false);
check('AEGIS_ADMIN_PASSWORD set', authJson.adminEnabled === true);
check('auth is not cached', has(auth.res, 'cache-control', 'no-store'));

const license = await get('/api/license', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ tier: 'pro', days: 365, count: 1 }),
});
check('license refuses anonymous', license.res.status === 403, `HTTP ${license.res.status}`);

const desk = await get('/api/license');
check('licence desk refuses anonymous', desk.res.status === 403, `HTTP ${desk.res.status}`);

const feed = await get('/api/csp-report');
check('csp feed refuses anonymous', feed.res.status === 403, `HTTP ${feed.res.status}`);

const badKey = await get('/api/auth', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ key: 'AEGIS-PRO-AAAA-20990101-AAAAAA' }),
});
check('forged key rejected', badKey.res.status === 401, `HTTP ${badKey.res.status}`);
check('no cookie on rejection', !badKey.res.headers.get('set-cookie'));

const failed = results.filter((r) => !r.ok);

// Turn each failure into a GitHub annotation: they are readable through the
// check-runs API even when job logs are not.
if (process.env.GITHUB_ACTIONS) {
  for (const r of failed) {
    console.log(`::error title=Probe ${r.name}::${r.detail || 'check failed'}`);
  }
}

summarise();
console.log(`\n${results.length - failed.length}/${results.length} checks passed on ${ORIGIN}`);
if (failed.length > 0) {
  console.log('failed:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}

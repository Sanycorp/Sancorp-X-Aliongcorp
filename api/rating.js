/*
 * Rating collector (Vercel Node function).
 *
 * The app has no database, and buying one to count stars would be silly. A
 * rating is therefore forwarded to a GitHub issue in this repository: durable,
 * auditable, free, and readable by the operator console without a second
 * account. The issue body carries one JSON line, nothing else.
 *
 * Without `AEGIS_FEEDBACK_TOKEN` the endpoint still answers 202 and says so.
 * The client keeps the rating on the device and shows "lokal" instead of
 * pretending it was delivered — a lost rating must never look sent.
 *
 * Write path is public (any visitor may rate), so it is rate limited, strictly
 * validated, and never echoes input back.
 */
import { json, rateLimit, readJsonBody, requireAdmin } from './_lib/auth.js';

const REPO = String(process.env.AEGIS_FEEDBACK_REPO || 'Sanycorp/Sancorp-X-Aliongcorp');
const TOKEN = String(process.env.AEGIS_FEEDBACK_TOKEN || '');
const MARKER = '<!-- aegis-rating -->';
const TITLE_PREFIX = '[RATING]';
const MAX_NOTE = 140;
const TARGET = /^[a-z0-9-]{1,40}$/;
const DEVICE = /^[0-9a-z-]{6,40}$/;
const CACHE_MS = 30_000;

/** Per-instance cache so opening the console twice does not spend the quota. */
let cache = { at: 0, ratings: [], source: 'none' };

function clampStars(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= 5 ? rounded : 0;
}

function cleanNote(value) {
  if (typeof value !== 'string') return '';
  const flat = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.slice(0, MAX_NOTE).trim();
}

function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

async function createIssue(rating) {
  const body = [MARKER, '```json', JSON.stringify(rating), '```'].join('\n');
  const response = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'aegis-m-rating',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: `${TITLE_PREFIX} ${stars(rating.stars)} ${rating.target}`,
      body,
    }),
  });
  return response.ok;
}

function parseIssue(issue) {
  const text = String(issue?.body ?? '');
  if (!text.includes('<!-- aegis-rating -->')) return null;
  const line = text
    .split('\n')
    .map((row) => row.trim())
    .find((row) => row.startsWith('{') && row.endsWith('}'));
  if (!line) return null;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  const value = clampStars(parsed?.stars);
  if (!value || !TARGET.test(String(parsed?.target ?? ''))) return null;
  return {
    id: String(parsed?.id ?? `${parsed?.target}:${issue?.number ?? 'x'}`).slice(0, 80),
    target: String(parsed.target),
    stars: value,
    note: cleanNote(parsed?.note),
    at: Number(parsed?.at) || Date.parse(issue?.created_at) || Date.now(),
    sent: true,
  };
}

async function readIssues() {
  const now = Date.now();
  if (cache.at && now - cache.at < CACHE_MS) return cache;
  if (!TOKEN) {
    // Public repositories can be read anonymously; keep the call cheap either
    // way and fall back to "no sink" when GitHub refuses.
    cache = { at: now, ratings: [], source: 'none' };
  }
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'aegis-m-rating',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=100`, {
      headers,
    });
    if (!response.ok) {
      cache = { at: now, ratings: cache.ratings, source: cache.source === 'none' ? 'error' : cache.source };
      return cache;
    }
    const list = await response.json();
    const ratings = (Array.isArray(list) ? list : [])
      .filter((issue) => !issue?.pull_request)
      .map(parseIssue)
      .filter(Boolean);
    cache = { at: now, ratings, source: 'github' };
  } catch {
    cache = { at: now, ratings: cache.ratings, source: cache.source === 'none' ? 'error' : cache.source };
  }
  return cache;
}

function summarize(ratings) {
  const distribution = [0, 0, 0, 0, 0];
  let total = 0;
  for (const rating of ratings) {
    distribution[rating.stars - 1] += 1;
    total += rating.stars;
  }
  const count = ratings.length;
  return {
    count,
    average: count ? Math.round((total / count) * 100) / 100 : 0,
    distribution,
    positive: count ? Math.round(((distribution[3] + distribution[4]) / count) * 100) / 100 : 0,
  };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Numbers are public — they are what a visitor is shown before buying.
    // Notes are not: the full list, with text, needs an operator session.
    const admin = requireAdmin(req);
    const result = await readIssues();
    const payload = {
      ok: true,
      sink: Boolean(TOKEN),
      source: result.source,
      cachedAt: result.at,
      summary: summarize(result.ratings),
    };
    if (admin) payload.ratings = result.ratings;
    json(res, 200, payload);
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    json(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const limit = rateLimit(req, 'rating', 6, 10 * 60_000);
  if (!limit.ok) {
    res.setHeader('Retry-After', '600');
    json(res, 429, { ok: false, error: 'rate_limited' });
    return;
  }

  const body = await readJsonBody(req, 2048);
  if (!body || typeof body !== 'object') {
    json(res, 400, { ok: false, error: 'bad_body' });
    return;
  }

  const target = String(body.target ?? '').trim().toLowerCase();
  const value = clampStars(body.stars);
  if (!TARGET.test(target) || !value) {
    json(res, 400, { ok: false, error: 'bad_rating' });
    return;
  }

  const device = DEVICE.test(String(body.device ?? '')) ? String(body.device) : 'anon';
  const rating = {
    v: 1,
    id: `${target}:${device}`,
    target,
    stars: value,
    note: cleanNote(body.note),
    device,
    at: Date.now(),
    app: String(body.app ?? '').slice(0, 16),
  };

  if (!TOKEN) {
    // No sink configured: say so plainly instead of accepting and dropping.
    json(res, 202, { ok: true, sink: false, stored: false });
    return;
  }

  const ok = await createIssue(rating);
  if (!ok) {
    json(res, 502, { ok: false, sink: true, stored: false, error: 'sink_failed' });
    return;
  }
  cache = { at: 0, ratings: [], source: 'none' };
  json(res, 201, { ok: true, sink: true, stored: true });
}

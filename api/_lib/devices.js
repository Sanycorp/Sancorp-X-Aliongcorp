/**
 * Which device may use a licence key.
 *
 * A key is sold once. The requirement is one device: activating it on a second
 * phone must fail instead of quietly giving away a second copy. The server has
 * no database, so the record lives where this project already keeps its facts —
 * in the repository, as a JSON file written through the GitHub contents API.
 *
 * Three modes, in order of strength:
 *
 *   github  AEGIS_LEDGER_TOKEN (or AEGIS_FEEDBACK_TOKEN) is set. The first
 *           device to claim a serial is written to `store/devices.json`; every
 *           later claim is compared against it. Automatic, no operator action.
 *   lock    `AEGIS_DEVICE_LOCK="SERIAL:device,SERIAL:device"` binds a key to a
 *           device id the customer reads out of the app. Manual, but it needs
 *           no token at all.
 *   session The key is bound to the signed session only: the cookie cannot be
 *           copied to another browser, but a second device can still activate
 *           the same key. Reported honestly as `session` instead of pretending
 *           the key is single-device.
 *
 * GitHub being unreachable must never lock a paying customer out, so a failed
 * ledger call degrades to `session` for that request.
 */

const REPO = String(process.env.AEGIS_FEEDBACK_REPO || 'Sanycorp/Sancorp-X-Aliongcorp').trim();
const TOKEN = String(process.env.AEGIS_LEDGER_TOKEN || process.env.AEGIS_FEEDBACK_TOKEN || '').trim();
const BRANCH = String(process.env.AEGIS_LEDGER_BRANCH || 'main').trim();
const FILE = 'store/devices.json';
const API = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
const TTL_MS = 30_000;
const TIMEOUT_MS = 2500;

export const DEVICE_SHAPE = /^d[0-9a-f]{24,40}$/;

export function ledgerMode() {
  if (TOKEN) return 'github';
  if (manualLocks().size > 0) return 'lock';
  return 'session';
}

/** `AEGIS_DEVICE_LOCK` — the zero-infrastructure option. */
function manualLocks() {
  const map = new Map();
  for (const entry of String(process.env.AEGIS_DEVICE_LOCK || '').split(/[,\s]+/)) {
    const [serial, device] = entry.split(':').map((v) => String(v || '').trim());
    if (!serial || !DEVICE_SHAPE.test(device || '')) continue;
    map.set(serial.toUpperCase(), device);
  }
  return map;
}

let cache = { at: 0, sha: null, devices: {} };

async function call(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'aegis-m-devices',
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Reads the ledger, at most once per instance per 30 s. */
export async function readLedger({ fresh = false } = {}) {
  if (!TOKEN) return { ok: true, mode: 'session', devices: {} };
  if (!fresh && Date.now() - cache.at < TTL_MS) return { ok: true, mode: 'github', devices: cache.devices, sha: cache.sha };
  try {
    const res = await call(`${API}?ref=${encodeURIComponent(BRANCH)}`, { method: 'GET' });
    if (res.status === 404) {
      cache = { at: Date.now(), sha: null, devices: {} };
      return { ok: true, mode: 'github', devices: {}, sha: null };
    }
    if (!res.ok) return { ok: false, mode: 'degraded', devices: {} };
    const data = await res.json();
    const raw = Buffer.from(String(data.content || ''), 'base64').toString('utf8');
    let parsed = {};
    try {
      parsed = JSON.parse(raw || '{}');
    } catch {
      parsed = {};
    }
    const devices = parsed && typeof parsed.devices === 'object' && parsed.devices ? parsed.devices : {};
    cache = { at: Date.now(), sha: data.sha ?? null, devices };
    return { ok: true, mode: 'github', devices, sha: data.sha ?? null };
  } catch {
    return { ok: false, mode: 'degraded', devices: {} };
  }
}

async function writeLedger(devices, sha, message) {
  const body = {
    message,
    branch: BRANCH,
    content: Buffer.from(`${JSON.stringify({ version: 1, devices }, null, 2)}\n`).toString('base64'),
    ...(sha ? { sha } : {}),
  };
  const res = await call(API, { method: 'PUT', body: JSON.stringify(body) });
  return res.ok;
}

/**
 * Records `serial → device` the first time and compares afterwards.
 * Returns `{ ok, mode, reason }`; the caller turns `reason` into an HTTP status.
 */
export async function claimDevice({ serial, device, email = '' }) {
  const key = String(serial || '').toUpperCase();
  if (!key) return { ok: false, mode: ledgerMode(), reason: 'bad_serial' };
  if (!DEVICE_SHAPE.test(String(device || ''))) return { ok: false, mode: ledgerMode(), reason: 'bad_device' };

  const manual = manualLocks().get(key);
  if (manual) {
    return manual === device
      ? { ok: true, mode: 'lock' }
      : { ok: false, mode: 'lock', reason: 'device_bound' };
  }

  const ledger = await readLedger();
  if (!ledger.ok) {
    // GitHub down: do not punish the customer for our infrastructure.
    return { ok: true, mode: 'degraded' };
  }
  if (ledger.mode === 'session') return { ok: true, mode: 'session' };

  const existing = ledger.devices[key];
  if (existing && existing.device) {
    return existing.device === device
      ? { ok: true, mode: 'github' }
      : { ok: false, mode: 'github', reason: 'device_bound', boundAt: existing.at ?? null };
  }

  const next = {
    ...ledger.devices,
    [key]: { device, email: String(email || '').toLowerCase(), at: new Date().toISOString() },
  };
  const written = await writeLedger(next, ledger.sha, `license: bind ${key} to one device`);
  if (!written) {
    // Optimistic lock clash (another claim landed first): re-read and compare.
    const again = await readLedger({ fresh: true });
    const now = again.devices?.[key];
    if (now?.device && now.device !== device) return { ok: false, mode: 'github', reason: 'device_bound' };
    if (!again.ok) return { ok: true, mode: 'degraded' };
  }
  cache = { at: Date.now(), sha: cache.sha, devices: next };
  return { ok: true, mode: 'github' };
}

/** Operator action: let the key be activated on a new phone. */
export async function releaseDevice(serial) {
  const key = String(serial || '').toUpperCase();
  if (!key) return { ok: false, reason: 'bad_serial' };
  if (!TOKEN) {
    return { ok: false, mode: ledgerMode(), reason: 'ledger_off' };
  }
  const ledger = await readLedger({ fresh: true });
  if (!ledger.ok) return { ok: false, mode: 'degraded', reason: 'ledger_unavailable' };
  if (!ledger.devices[key]) return { ok: true, mode: 'github', removed: false };
  const next = { ...ledger.devices };
  delete next[key];
  const written = await writeLedger(next, ledger.sha, `license: release ${key}`);
  if (!written) return { ok: false, mode: 'github', reason: 'write_failed' };
  cache = { at: Date.now(), sha: cache.sha, devices: next };
  return { ok: true, mode: 'github', removed: true };
}

/** `d0123…` → `0123-4567`: enough to identify a phone, short enough to read. */
function short(device) {
  return String(device || '')
    .replace(/^d/, '')
    .slice(0, 8)
    .toUpperCase()
    .replace(/(.{4})(?=.)/, '$1-');
}

/**
 * Console summary: how enforcement is configured and what is currently bound.
 * The operator is the licence issuer, so the list is theirs; ids are shown
 * truncated because the full value never needs to leave the device that owns it.
 */
export async function deviceSummary() {
  const manual = [...manualLocks().entries()].map(([serial, device]) => ({
    serial,
    device: short(device),
    email: '',
    at: null,
    source: 'lock',
  }));
  if (!TOKEN) {
    return { mode: ledgerMode(), bound: manual.length, manual: manual.length, canRelease: false, devices: manual };
  }
  const ledger = await readLedger();
  const rows = Object.entries(ledger.devices || {})
    .map(([serial, entry]) => ({
      serial,
      device: short(entry?.device),
      email: String(entry?.email || ''),
      at: entry?.at ?? null,
      source: 'ledger',
    }))
    .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
    .slice(0, 60);
  return {
    mode: ledger.ok ? 'github' : 'degraded',
    bound: Object.keys(ledger.devices || {}).length,
    manual: manual.length,
    canRelease: Boolean(ledger.ok && TOKEN),
    devices: [...rows, ...manual],
  };
}

/** Test seam. */
export function resetLedgerCache() {
  cache = { at: 0, sha: null, devices: {} };
}

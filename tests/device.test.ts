// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeLicense, sessionCookie, signSession } from '../api/_lib/auth.js';
import {
  DEVICE_SHAPE,
  claimDevice,
  deviceSummary,
  ledgerMode,
  readLedger,
  releaseDevice,
  resetLedgerCache,
} from '../api/_lib/devices.js';
import { deviceId, deviceShort, resetDeviceCache } from '../src/state/device';

const A = 'd0123456789abcdef0123456789abcdef';
const B = 'dfedcba9876543210fedcba9876543210';

const env = { ...process.env };

beforeEach(() => {
  process.env = { ...env };
  delete process.env.AEGIS_DEVICE_LOCK;
  delete process.env.AEGIS_LEDGER_TOKEN;
  delete process.env.AEGIS_FEEDBACK_TOKEN;
  resetLedgerCache();
});

afterEach(() => {
  process.env = { ...env };
  resetLedgerCache();
});

describe('device identity on the client', () => {
  it('generates a stable id in the server’s format', () => {
    // A browser profile, faked: the id has to survive a reload, so it is read
    // back from storage rather than regenerated.
    const bag = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => bag.get(k) ?? null,
      setItem: (k: string, v: string) => void bag.set(k, v),
      removeItem: (k: string) => void bag.delete(k),
      clear: () => bag.clear(),
      key: (i: number) => [...bag.keys()][i] ?? null,
      get length() {
        return bag.size;
      },
    } as Storage;
    resetDeviceCache();
    const first = deviceId();
    expect(first).toMatch(DEVICE_SHAPE);
    expect(deviceId()).toBe(first);
    resetDeviceCache();
    expect(deviceId()).toBe(first);
  });

  it('prints a short form a human can read over Telegram', () => {
    expect(deviceShort(A)).toBe('0123-4567');
  });
});

describe('one key, one device', () => {
  it('binds the first device and refuses the second', async () => {
    process.env.AEGIS_DEVICE_LOCK = `7F3K2M9QXP:${A}`;
    expect(ledgerMode()).toBe('lock');

    expect(await claimDevice({ serial: '7F3K2M9QXP', device: A })).toMatchObject({ ok: true, mode: 'lock' });
    expect(await claimDevice({ serial: '7f3k2m9qxp', device: B })).toMatchObject({
      ok: false,
      reason: 'device_bound',
    });
  });

  it('rejects a malformed device id instead of binding nothing', async () => {
    process.env.AEGIS_DEVICE_LOCK = `7F3K2M9QXP:${A}`;
    expect(await claimDevice({ serial: '7F3K2M9QXP', device: 'nope' })).toMatchObject({
      ok: false,
      reason: 'bad_device',
    });
  });

  it('without a ledger or a lock it says so instead of pretending', async () => {
    expect(ledgerMode()).toBe('session');
    const ledger = await readLedger();
    expect(ledger).toMatchObject({ ok: true, mode: 'session' });
    const claim = await claimDevice({ serial: '7F3K2M9QXP', device: A });
    expect(claim.mode).toBe('session');
    const summary = await deviceSummary();
    expect(summary.mode).toBe('session');
    expect(summary.canRelease).toBe(false);
  });

  it('counts manual bindings in the console summary', async () => {
    process.env.AEGIS_DEVICE_LOCK = `7F3K2M9QXP:${A},ABCD1234XY:${B}`;
    const summary = await deviceSummary();
    expect(summary).toMatchObject({ mode: 'lock', bound: 2, manual: 2 });
  });
});

describe('POST /api/auth: a key is a claim, not a way around Google', () => {
  function fake() {
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: '',
      setHeader(key: string, value: string) {
        this.headers[key.toLowerCase()] = value;
      },
      end(body?: string) {
        this.body = String(body ?? '');
      },
    };
    return res;
  }

  const post = (body: unknown, headers: Record<string, string>) => {
    const req = {
      method: 'POST',
      url: '/api/auth',
      headers: { host: 'example.test', 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers },
      body,
    };
    return req;
  };

  /** A valid Google session cookie, bound to `device`. */
  const googleCookie = (device: string) =>
    sessionCookie({
      tier: 'free',
      exp: Date.now() + 86_400_000,
      subject: 'user@example.com',
      name: 'User',
      dev: device,
    });

  it('refuses a key when nobody is signed in', async () => {
    const handler = (await import('../api/auth.js')).default;
    const key = makeLicense('pro', 30).key;
    const res = fake();
    await handler(post({ key }, { 'x-aegis-device': A }) as never, res as never);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('google_required');
  });

  it('upgrades the signed-in account and records the licence', async () => {
    process.env.AEGIS_DEVICE_LOCK = 'PLACEHOLDER:0000';
    const handler = (await import('../api/auth.js')).default;
    const licence = makeLicense('pro', 30);
    const res = fake();
    await handler(
      post({ key: licence.key }, { 'x-aegis-device': A, cookie: googleCookie(A) }) as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ tier: 'pro', subject: 'user@example.com', lic: licence.serial });
    // The session keeps the Google identity, and the cookie is bound to A.
    const { readSession } = await import('../api/_lib/auth.js');
    const cookie = /aegis_sess=([^;]+)/.exec(String(res.headers['set-cookie']))?.[1] ?? '';
    expect(readSession(cookie)).toMatchObject({ subject: 'user@example.com', dev: A, lic: licence.serial });
  });

  it('refuses the same key on a second device', async () => {
    const licence = makeLicense('pro', 30);
    process.env.AEGIS_DEVICE_LOCK = `${licence.serial}:${A}`;
    const handler = (await import('../api/auth.js')).default;

    const ok = fake();
    await handler(post({ key: licence.key }, { 'x-aegis-device': A, cookie: googleCookie(A) }) as never, ok as never);
    expect(ok.statusCode).toBe(200);

    const other = fake();
    await handler(post({ key: licence.key }, { 'x-aegis-device': B, cookie: googleCookie(B) }) as never, other as never);
    expect(other.statusCode).toBe(409);
    expect(JSON.parse(other.body).error).toBe('key_in_use');
  });

  it('will not trust a cookie copied to another device', async () => {
    const handler = (await import('../api/auth.js')).default;
    const res = fake();
    await handler(
      {
        method: 'GET',
        url: '/api/auth',
        headers: { host: 'example.test', 'x-aegis-device': B, cookie: googleCookie(A) },
      } as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.signedIn).toBe(false);
    expect(body.deviceMismatch).toBe(true);
    // The stale cookie is cleared so the browser stops sending it.
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
  });

  it('accepts the device the session was issued to', async () => {
    const handler = (await import('../api/auth.js')).default;
    const res = fake();
    await handler(
      {
        method: 'GET',
        url: '/api/auth',
        headers: { host: 'example.test', 'x-aegis-device': A, cookie: googleCookie(A) },
      } as never,
      res as never,
    );
    const body = JSON.parse(res.body);
    expect(body.signedIn).toBe(true);
    expect(body.email).toBe('user@example.com');
  });
});

describe('sessions carry the licence and the device', () => {
  it('round-trips lic and dev through the signed payload', async () => {
    const { readSession } = await import('../api/_lib/auth.js');
    const token = signSession({
      tier: 'pro',
      exp: Date.now() + 86_400_000,
      subject: 'a@b.c',
      name: 'A',
      lic: '7f3k2m9qxp',
      dev: A,
    });
    const read = readSession(token);
    expect(read).toMatchObject({ tier: 'pro', lic: '7F3K2M9QXP', dev: A });
  });

  it('rejects a tampered payload', async () => {
    const { readSession } = await import('../api/_lib/auth.js');
    const token = signSession({ tier: 'free', exp: Date.now() + 86_400_000, subject: 'a@b.c', dev: A });
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ t: 'pro', e: Date.now() + 86_400_000, s: 'a@b.c', d: A })).toString('base64url');
    expect(readSession(`${forged}.${sig}`)).toBeNull();
    expect(readSession(`${payload}.${sig.slice(0, -1)}x`)).toBeNull();
  });
});

describe('the GitHub ledger, against a fake contents API', () => {
  const A2 = 'd11111111111111111111111111111aaa';
  const B2 = 'd22222222222222222222222222222bbb';

  /** A tiny stand-in for `GET/PUT /repos/:owner/:repo/contents/store/devices.json`. */
  function fakeGitHub(initial: Record<string, { device: string; email: string; at: string }> | null) {
    let file: string | null = initial ? JSON.stringify({ version: 1, devices: initial }) : null;
    let sha = initial ? 'sha-1' : null;
    let counter = 1;
    const calls: string[] = [];

    const fetchMock = async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push(method);
      if (method === 'GET') {
        if (file === null) return { ok: false, status: 404, json: async () => ({}) } as Response;
        return {
          ok: true,
          status: 200,
          json: async () => ({ content: Buffer.from(file as string).toString('base64'), sha }),
        } as Response;
      }
      const body = JSON.parse(String(init.body));
      if (body.sha && body.sha !== sha) return { ok: false, status: 409, json: async () => ({}) } as Response;
      file = Buffer.from(body.content, 'base64').toString('utf8');
      sha = `sha-${++counter}`;
      return { ok: true, status: 200, json: async () => ({ content: { sha } }) } as Response;
    };
    return { fetchMock, calls, read: () => (file ? JSON.parse(file).devices : {}) };
  }

  it('binds the first device and refuses the second, then lets the operator release it', async () => {
    process.env.AEGIS_LEDGER_TOKEN = 'fake-token';
    const gh = fakeGitHub(null);
    const original = globalThis.fetch;
    globalThis.fetch = gh.fetchMock as never;
    try {
      expect(ledgerMode()).toBe('github');
      expect(await claimDevice({ serial: 'SER1AAAA', device: A2, email: 'a@b.c' })).toMatchObject({
        ok: true,
        mode: 'github',
      });
      expect(gh.read().SER1AAAA).toMatchObject({ device: A2, email: 'a@b.c' });

      expect(await claimDevice({ serial: 'ser1aaaa', device: B2 })).toMatchObject({
        ok: false,
        reason: 'device_bound',
      });

      // Same device again is fine: a reinstall of the same browser profile must
      // not look like a second phone.
      expect(await claimDevice({ serial: 'SER1AAAA', device: A2 })).toMatchObject({ ok: true });

      resetLedgerCache();
      expect(await deviceSummary()).toMatchObject({ mode: 'github', bound: 1, canRelease: true });

      expect(await releaseDevice('SER1AAAA')).toMatchObject({ ok: true, removed: true });
      expect(gh.read().SER1AAAA).toBeUndefined();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('does not lock a paying customer out when GitHub is down', async () => {
    process.env.AEGIS_LEDGER_TOKEN = 'fake-token';
    const original = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response) as never;
    try {
      const claim = await claimDevice({ serial: 'SER2BBBB', device: A2 });
      expect(claim).toMatchObject({ ok: true, mode: 'degraded' });
    } finally {
      globalThis.fetch = original;
    }
  });
});

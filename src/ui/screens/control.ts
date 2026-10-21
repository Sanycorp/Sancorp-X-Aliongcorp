import { el, button, sectionHead, segmented, toast } from '../elements';
import { session } from '../../state/session';
import { ledger, statusOf, dayCount } from '../../state/ops';
import type { OpsAccount, OpsFilter } from '../../state/ops';
import { RATING_APP, dedupe, rankByTarget, ratingBook, remoteRatings, summarize, trendOf } from '../../state/rating';
import type { Rating } from '../../state/rating';
import { installRipple } from '../motion';
import type { Screen } from './deck';
import { APP_VERSION } from '../../version';
import { PRO_PRICE } from '../../model/tiers';
import { parseOperatorKey, scrubOperatorKey } from '../../state/operatorKey';

/**
 * AEGIS OPS — the operator app.
 *
 * Two jobs, one screen:
 *  - watch the live deployment (health, latency, headers, CSP reports);
 *  - run the licence desk (issue, renew, inspect, revoke).
 *
 * The desk writes to a ledger on this device and asks the server to sign keys;
 * the signing secret never reaches the browser. Access gating is enforced by the
 * server (`requireAdmin`), so hiding a tab only ever hides pixels.
 */

interface HealthData {
  ok: boolean;
  commit: string;
  ref: string;
  env: string;
  region: string;
  uptimeSec: number;
  now: number;
}

interface BoundDevice {
  serial: string;
  device: string;
  email: string;
  at: string | null;
  source: string;
}

interface DeviceState {
  mode: 'github' | 'lock' | 'session' | 'degraded';
  bound: number;
  manual: number;
  canRelease: boolean;
  devices: BoundDevice[];
}

interface DeskState {
  revoked: number;
  adminEnabled: boolean;
  devSecret: boolean;
  days: number[];
  devices?: DeviceState;
}

interface CspEntry {
  directive: string;
  blocked: string;
  document: string;
  disposition: string;
  line: number;
  at: number;
}

interface IssuedKey {
  key: string;
  tier: string;
  serial: string;
  expires: string;
}

type Tab = 'live' | 'accounts' | 'rating' | 'issue' | 'security';

const HEADER_CHECKS: { key: string; label: string; expect: string }[] = [
  { key: 'content-security-policy', label: 'CSP', expect: "default-src 'none'" },
  { key: 'strict-transport-security', label: 'HSTS', expect: 'max-age' },
  { key: 'cross-origin-opener-policy', label: 'COOP', expect: 'same-origin' },
  { key: 'cross-origin-embedder-policy', label: 'COEP', expect: 'credentialless' },
  { key: 'x-content-type-options', label: 'XCTO', expect: 'nosniff' },
  { key: 'referrer-policy', label: 'REFERRER', expect: 'no-referrer' },
  { key: 'permissions-policy', label: 'PERMISSIONS', expect: 'camera=()' },
];

const REVOKE_WORKFLOW =
  'https://github.com/Sanycorp/Sancorp-X-Aliongcorp/actions/workflows/revoke.yml';

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function money(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function copy(text: string, message: string): void {
  void navigator.clipboard
    ?.writeText(text)
    .then(() => toast(message, 'ok', 1400))
    .catch(() => toast('Papan klip ditolak browser', 'err', 1800));
}

export function createControl(): Screen {
  let tab: Tab = 'live';
  let health: HealthData | null = null;
  let latency = 0;
  let lastProbe = 0;
  let autoRefresh = false;
  let autoTimer = 0;
  let desk: DeskState | null = null;
  let csp: CspEntry[] = [];
  let cspError = '';

  // rating desk
  let ratings: Rating[] = [];
  let ratingSink = false;
  let ratingSource = 'none';
  let ratingError = '';
  let ratingBusy = false;
  let ratingFilter: 'all' | 'app' | 'preset' = 'all';
  let headers = HEADER_CHECKS.map((check) => ({ ...check, ok: false, value: 'belum dicek' }));

  // desk form state
  let query = '';
  let filter: OpsFilter = 'all';
  let showLink = false;
  let linkKeyText = '';
  let linkNameText = '';
  let linkNoteText = '';
  // Google accounts: the grant list lives in AEGIS_PREMIUM, so the console only
  // mints the signed string and shows what is already active.
  let googleRows: { email: string; exp: number; state: string; token: string; days: number }[] = [];
  let googleBusy = false;
  let googleLoaded = false;
  let googleEmail = '';
  let googleDays = '30';
  let googleHint = '';

  let genTier: 'pro' | 'admin' = 'pro';
  let genDays = '30';
  let genCount = '1';
  let genHandle = '';
  let generated: IssuedKey[] = [];
  let confirmClear = false;

  const gate = el('div', { class: 'ctrl-gate' });
  const tabsHost = el('div', { class: 'ctrl-tabs' });
  const body = el('div', { class: 'ctrl-body' });
  const stamp = el('span', { class: 'ctrl-clock', text: '--:--:--' });

  const screen = el(
    'section',
    { class: 'screen', id: 'screen-control', attrs: { 'aria-label': 'Konsol operator' } },
    el(
      'div',
      { class: 'screen__intro' },
      el(
        'div',
        {},
        el('div', { class: 'screen__kicker', text: 'AEGIS SOUND LAB / OPERATIONS' }),
        el('h1', { class: 'screen__title', html: 'AEGIS <em>OPS</em>' }),
      ),
      el('div', { class: 'header__meta' }, el('span', { class: 'chip' }, el('b', { text: 'ADMIN' })), stamp),
    ),
    gate,
    tabsHost,
    body,
    el('div', { class: 'footnote', text: `Konsol operator · Aegis Sound Lab ${APP_VERSION} · Sanayacorp · data dibaca live dari deployment ini` }),
  );

  installRipple(screen);

  // ------------------------------------------------------------------ probes
  async function ping(): Promise<void> {
    if (tab === 'live') render();
    const started = performance.now();
    try {
      const res = await fetch('/api/health', { cache: 'no-store', headers: { accept: 'application/json' } });
      latency = Math.round(performance.now() - started);
      health = res.ok ? ((await res.json()) as HealthData) : null;
    } catch {
      health = null;
      latency = -1;
    }
    lastProbe = Date.now();
    if (tab === 'live') render();
  }

  async function loadDesk(): Promise<void> {
    try {
      const res = await fetch('/api/license', { cache: 'no-store', headers: { accept: 'application/json' } });
      desk = res.ok ? ((await res.json()) as DeskState) : null;
    } catch {
      desk = null;
    }
    if (tab === 'security' || tab === 'live') render();
  }

  async function probeHeaders(): Promise<void> {
    try {
      const res = await fetch(`/?probe=${Date.now()}`, { cache: 'no-store', method: 'GET' });
      headers = HEADER_CHECKS.map((check) => {
        const value = res.headers.get(check.key) ?? '';
        return { ...check, value: value || 'tidak ada', ok: value.toLowerCase().includes(check.expect) };
      });
    } catch {
      headers = HEADER_CHECKS.map((check) => ({ ...check, value: 'probe gagal', ok: false }));
    }
    if (tab === 'security') render();
  }

  async function loadCsp(): Promise<void> {
    try {
      const res = await fetch('/api/csp-report', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!res.ok) {
        cspError = res.status === 403 ? 'butuh sesi operator' : `HTTP ${res.status}`;
        csp = [];
      } else {
        const data = (await res.json()) as { reports: CspEntry[] };
        csp = data.reports ?? [];
        cspError = '';
      }
    } catch {
      cspError = 'server tidak terjangkau';
      csp = [];
    }
    if (tab === 'security') render();
  }

  function setAuto(on: boolean): void {
    autoRefresh = on;
    window.clearInterval(autoTimer);
    if (on) autoTimer = window.setInterval(() => void ping(), 15_000);
    render();
  }

  // ------------------------------------------------------------------ desk ops
  async function postDesk(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch('/api/license', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const map: Record<string, string> = {
          admin_required: 'Sesi operator berakhir — masuk ulang.',
          invalid_license: 'Kunci tidak valid atau tanda tangannya rusak.',
          too_many_requests: 'Terlalu cepat. Tunggu satu menit.',
        };
        toast(map[data.error ?? ''] ?? `Gagal (${res.status})`, 'err', 2200);
        return null;
      }
      return (await res.json()) as Record<string, unknown>;
    } catch {
      toast('Server tidak terjangkau', 'err', 2000);
      return null;
    }
  }

  async function issueKeys(): Promise<void> {
    const count = Math.min(20, Math.max(1, Number(genCount) || 1));
    const data = await postDesk({ op: 'issue', tier: genTier, days: Number(genDays), count });
    if (!data) return;
    const keys = (data.keys as IssuedKey[]) ?? [];
    generated = [...keys, ...generated].slice(0, 30);
    for (const key of keys) {
      ledger.add({
        key: key.key,
        handle: genHandle,
        days: Number(genDays),
        passes: Math.max(1, Math.round(Number(genDays) / 30)),
      });
      ledger.setNote(key.serial, 'diterbitkan dari konsol');
    }
    toast(`${keys.length} kunci siap — sudah masuk daftar akun`, 'ok', 2200);
    render();
  }

  /**
   * One tap: mint a PRO pass and land it in the account list. No serial to type,
   * no key to paste — the desk generates a crypto-random id, the ledger names the
   * account after it, and the key is already on the clipboard for Telegram.
   */
  async function quickAccount(): Promise<void> {
    const data = await postDesk({ op: 'issue', tier: 'pro', days: 30, count: 1 });
    if (!data) return;
    const [issued] = (data.keys as IssuedKey[]) ?? [];
    if (!issued) {
      toast('Kunci tidak terbit', 'err', 2000);
      return;
    }
    const account = ledger.add({
      key: issued.key,
      handle: `USER-${issued.serial.slice(0, 4)}`,
      days: 30,
      passes: 1,
      note: 'dibuat satu ketuk',
    });
    if (!account) {
      toast('Kunci terbit tapi gagal masuk daftar', 'err', 2400);
      return;
    }
    copy(issued.key, `Akun ${account.serial} dibuat — kunci disalin`);
    query = '';
    render();
  }

  async function renew(account: OpsAccount): Promise<void> {
    const data = await postDesk({ op: 'extend', key: account.key, days: 30 });
    if (!data) return;
    const renewed = ledger.renew(account.serial, String(data.key), 30);
    toast(renewed ? `Diperpanjang 30 hari · ${account.serial}` : 'Kunci diperbarui', 'ok', 2200);
    render();
  }

  async function saveLinkedKey(): Promise<void> {
    const key = linkKeyText.trim().toUpperCase();
    if (!key) {
      toast('Tempel kunci dulu', 'info', 1600);
      return;
    }
    const data = await postDesk({ op: 'inspect', key });
    if (!data) return;
    if (!data.valid && data.reason === 'signature') {
      toast('Kunci tidak valid — cek ulang', 'err', 2200);
      return;
    }
    const account = ledger.add({ key, handle: linkNameText, note: linkNoteText });
    if (!account) {
      toast('Format kunci tidak dikenali', 'err', 2200);
      return;
    }
    if (data.revoked) ledger.setRevoked(account.serial, true);
    toast(`${account.serial} masuk daftar akun`, 'ok', 1800);
    showLink = false;
    linkKeyText = '';
    linkNameText = '';
    linkNoteText = '';
    render();
  }

  function download(name: string, mime: string, content: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = el('a', { attrs: { href: url, download: name } });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // ------------------------------------------------------------------ views
  function statCard(label: string, value: string, hint?: string): HTMLElement {
    return el(
      'div',
      { class: 'ops-stat' },
      el('span', { class: 'ops-stat__label', text: label }),
      el('b', { class: 'ops-stat__value', text: value }),
      hint ? el('span', { class: 'ops-stat__hint', text: hint }) : null,
    );
  }

  function renderLive(): void {
    const ok = Boolean(health?.ok);
    body.append(
      el(
        'div',
        { class: 'ops-grid' },
        statCard('DEPLOY', health?.commit ?? '—', health?.env ?? 'tidak terbaca'),
        statCard('REGION', health?.region ?? '—', health?.ref?.split('/').pop() ?? ''),
        statCard('UPTIME', health ? `${Math.floor(health.uptimeSec / 60)}m ${health.uptimeSec % 60}s` : '—', 'sejak instance hidup'),
        statCard('LATENSI', latency >= 0 ? `${latency} ms` : 'gagal', lastProbe ? `cek ${fmtTime(lastProbe)}` : 'belum dicek'),
      ),
      el(
        'div',
        { class: 'plate ctrl-plate' },
        sectionHead('01', 'KESEHATAN LAYANAN'),
        el(
          'div',
          { class: 'ops-line' },
          el('span', { class: `ops-dot ${ok ? 'is-ok' : 'is-bad'}` }),
          el('b', { text: ok ? 'Origin menjawab' : 'Origin tidak menjawab' }),
          el('span', { class: 'spacer' }),
          button('CEK SEKARANG', { tone: 'ghost', size: 'sm', icon: 'reset', onClick: () => void ping() }),
          button(autoRefresh ? 'AUTO: HIDUP' : 'AUTO: MATI', {
            tone: autoRefresh ? 'primary' : 'ghost',
            size: 'sm',
            onClick: () => setAuto(!autoRefresh),
          }),
        ),
        el(
          'div',
          { class: 'ctrl-kv' },
          kv('ENDPOINT', '/api/health · /api/auth · /api/license · /api/csp-report'),
          kv('JAM SERVER', health ? fmtTime(health.now) : '—'),
          kv('JAM LOKAL', new Date().toLocaleTimeString('id-ID')),
          kv('BIAYA', '4 fungsi serverless · region sin1'),
        ),
      ),
      el(
        'div',
        { class: 'plate ctrl-plate' },
        sectionHead('02', 'SESI OPERATOR'),
        el(
          'div',
          { class: 'ctrl-kv' },
          kv('TIER', session.state.tier.toUpperCase()),
          kv('SUBJEK', session.state.subject ?? '—'),
          kv('BERAKHIR', session.state.exp ? new Date(session.state.exp).toLocaleString('id-ID') : '—'),
          kv('MODE', session.state.status === 'ready' ? 'server' : session.state.status),
          kv('KATA SANDI', session.state.adminEnabled ? 'aktif' : 'belum disetel'),
          kv('SECRET', session.state.devSecret ? 'DEV — ganti sebelum jualan' : 'production'),
        ),
        el(
          'div',
          { class: 'ctrl-actions' },
          button('MUAT ULANG SESI', {
            tone: 'ghost',
            size: 'sm',
            icon: 'reset',
            onClick: () => void session.refresh().then(() => render()),
          }),
          button('KELUAR', {
            tone: 'ghost',
            size: 'sm',
            onClick: () => {
              void session.signOut().then(() => {
                toast('Sesi operator ditutup', 'info', 1500);
                render();
              });
            },
          }),
        ),
      ),
    );
  }

  /** Only the list is repainted while typing, so the caret never jumps. */
  function paintRows(host: HTMLElement): void {
    const rows = ledger.filter(query, filter);
    host.replaceChildren();
    if (rows.length === 0) {
      host.append(
        el('p', {
          class: 'ctrl-empty',
          text:
            query || filter !== 'all'
              ? 'Tidak ada akun yang cocok.'
              : 'Belum ada akun. Terbitkan kunci atau tautkan kunci yang sudah ada.',
        }),
      );
      return;
    }
    host.append(el('div', { class: 'ops-list' }, ...rows.map(renderAccount)));
  }

  function renderAccounts(): void {
    const stats = ledger.stats();
    const listHost = el('div');
    paintRows(listHost);

    body.append(
      el(
        'div',
        { class: 'ops-grid ops-grid--tight' },
        statCard('AKUN', String(stats.total), 'di perangkat ini'),
        statCard('AKTIF', String(stats.active), `${stats.expiring} habis < 7 hari`),
        statCard('DICABUT', String(stats.revoked + stats.expired), 'arsip'),
        statCard('TERCATAT', money(stats.revenue), 'nilai pass terjual'),
      ),
      el(
        'div',
        { class: 'plate ctrl-plate' },
        sectionHead('03', 'DAFTAR AKUN'),
        el(
          'div',
          { class: 'ops-toolbar' },
          el('input', {
            class: 'input',
            attrs: {
              type: 'search',
              placeholder: 'Cari nama, serial, atau catatan',
              'aria-label': 'Cari akun',
              value: query,
            },
            on: {
              input: (ev) => {
                query = (ev.target as HTMLInputElement).value;
                paintRows(listHost);
              },
            },
          }),
          button('BUAT AKUN PRO', {
            tone: 'primary',
            size: 'sm',
            icon: 'bolt',
            title: 'Terbitkan pass PRO 30 hari dan masukkan ke daftar akun',
            onClick: () => void quickAccount(),
          }),
          button(showLink ? 'TUTUP' : '+ TAUTKAN KUNCI', {
            tone: 'ghost',
            size: 'sm',
            onClick: () => {
              showLink = !showLink;
              render();
            },
          }),
        ),
        showLink ? renderLinkForm() : null,
        segmented(
          [
            { value: 'all', label: 'SEMUA' },
            { value: 'active', label: 'AKTIF' },
            { value: 'expiring', label: 'SEGERA' },
            { value: 'expired', label: 'HABIS' },
            { value: 'revoked', label: 'CABUT' },
          ],
          filter,
          (value) => {
            filter = value as OpsFilter;
            render();
          },
        ).wrap,
        listHost,
        el(
          'div',
          { class: 'ctrl-actions' },
          button('UNDUH JSON', {
            tone: 'ghost',
            size: 'sm',
            icon: 'download',
            onClick: () => download(`aegis-akun-${Date.now()}.json`, 'application/json', ledger.exportJson()),
          }),
          button('UNDUH CSV', {
            tone: 'ghost',
            size: 'sm',
            icon: 'download',
            onClick: () => download(`aegis-akun-${Date.now()}.csv`, 'text/csv', ledger.toCsv()),
          }),
          labelImport(),
          confirmClear
            ? button('YAKIN? KOSONGKAN', {
                tone: 'danger',
                size: 'sm',
                onClick: () => {
                  ledger.clear();
                  confirmClear = false;
                  toast('Daftar akun dikosongkan', 'info', 1600);
                  render();
                },
              })
            : button('KOSONGKAN', {
                tone: 'ghost',
                size: 'sm',
                onClick: () => {
                  confirmClear = true;
                  render();
                },
              }),
        ),
        el('p', {
          class: 'ops-hint',
          text: 'Daftar ini hidup di perangkatmu, bukan di server. Ekspor JSON sebelum ganti HP. Yang menentukan akses tetap kunci bertanda tangan + daftar cabut di server.',
        }),
      ),
      renderGoogle(),
      renderDevices(),
    );

    if (!googleLoaded && !googleBusy) void loadGoogle();
    if (!desk) void loadDesk();
  }


  // ------------------------------------------------------------------ ratings
  async function loadRatings(): Promise<void> {
    ratingBusy = true;
    ratingError = '';
    if (tab === 'rating') render();
    try {
      const response = await fetch('/api/rating', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { sink?: boolean; source?: string; ratings?: Rating[] };
      ratingSink = Boolean(data.sink);
      ratingSource = String(data.source ?? 'none');
      if (Array.isArray(data.ratings)) {
        remoteRatings.merge(data.ratings);
        ratings = data.ratings;
      }
    } catch {
      ratingError =
        'Kanal penilaian tidak terbaca sekarang. Angka di bawah memakai cache terakhir dan penilaian di perangkat ini.';
    } finally {
      ratingBusy = false;
      if (tab === 'rating') render();
    }
  }

  /** Remote first, then this device, then the last response; newest wins. */
  function mergedRatings(): Rating[] {
    return dedupe([...remoteRatings.all(), ...ratings, ...ratingBook.all()]);
  }

  function starGlyphs(stars: number): string {
    return '★'.repeat(stars) + '☆'.repeat(5 - stars);
  }

  function targetLabel(target: string): string {
    if (target === RATING_APP) return 'APLIKASI';
    return target.replace(/-/g, ' ').toUpperCase();
  }

  function relative(at: number): string {
    const diff = Date.now() - at;
    const minute = 60_000;
    if (diff < minute) return 'baru saja';
    if (diff < 60 * minute) return `${Math.round(diff / minute)} mnt lalu`;
    if (diff < 24 * 60 * minute) return `${Math.round(diff / (60 * minute))} jam lalu`;
    return `${Math.round(diff / (24 * 60 * minute))} hari lalu`;
  }

  function renderRating(): void {
    const merged = mergedRatings();
    const scoped = merged.filter((row) =>
      ratingFilter === 'all' ? true : ratingFilter === 'app' ? row.target === RATING_APP : row.target !== RATING_APP,
    );
    const summary = summarize(scoped);
    const week = trendOf(merged, 7);
    const weekCount = week.reduce((sum, point) => sum + point.count, 0);
    const ranking = rankByTarget(
      scoped.filter((row) => row.target !== RATING_APP),
      1,
    ).slice(0, 6);
    const peak = Math.max(1, ...week.map((point) => point.count));

    const distribution = [5, 4, 3, 2, 1].map((stars) => {
      const count = summary.distribution[stars - 1];
      const pct = summary.count ? Math.round((count / summary.count) * 100) : 0;
      return el(
        'div',
        { class: 'rate-bar' },
        el('span', { class: 'rate-bar__stars mono', text: `${stars}★` }),
        el('div', { class: 'rate-bar__track' }, el('i', { class: 'rate-bar__fill', style: `width:${pct}%` })),
        el('b', { class: 'rate-bar__num mono', text: `${count}` }),
        el('span', { class: 'rate-bar__pct mono', text: `${pct}%` }),
      );
    });

    const trend = week.map((point) =>
      el(
        'div',
        { class: 'rate-day' },
        el(
          'div',
          { class: 'rate-day__bar' },
          el('i', { style: `height:${Math.round((point.count / peak) * 100)}%` }),
        ),
        el('span', { class: 'rate-day__count mono', text: point.count ? String(point.count) : '' }),
        el('span', { class: 'rate-day__label mono', text: point.day.slice(8) }),
      ),
    );

    const rows = scoped.slice(0, 12).map((row) =>
      el(
        'div',
        { class: 'rate-row' },
        el(
          'div',
          { class: 'rate-row__top' },
          el('span', { class: 'rate-row__stars', text: starGlyphs(row.stars) }),
          el('span', { class: 'rate-row__target mono', text: targetLabel(row.target) }),
          el('span', { class: 'rate-row__when mono', text: relative(row.at) }),
          el('span', {
            class: `rate-row__tag ${row.sent ? 'is-sent' : 'is-local'}`,
            text: row.sent ? 'TERKIRIM' : 'LOKAL',
          }),
        ),
        row.note ? el('p', { class: 'rate-row__note', text: row.note }) : null,
      ),
    );

    body.append(
      el(
        'div',
        { class: 'ops-grid ops-grid--tight' },
        statCard('RATA-RATA', summary.count ? summary.average.toFixed(2) : '—', `${summary.count} penilaian`),
        statCard('POSITIF', summary.count ? `${Math.round(summary.positive * 100)}%` : '—', '4–5 bintang'),
        statCard('7 HARI', String(weekCount), 'penilaian masuk'),
        statCard('PRESET DINILAI', String(ranking.length), ranking[0] ? `teratas ${targetLabel(ranking[0].target)}` : 'belum ada'),
      ),
      el(
        'div',
        { class: 'plate ctrl-plate' },
        sectionHead('04', 'KANAL PENILAIAN'),
        el(
          'div',
          { class: 'ops-line' },
          el('span', { class: `ops-dot ${ratingError ? 'is-bad' : ratingSink ? 'is-ok' : ''}` }),
          el('b', {
            text: ratingBusy
              ? 'Membaca kanal…'
              : ratingError
                ? 'Kanal tidak terjangkau'
                : ratingSink
                  ? 'Kanal aktif — kiriman masuk ke issue repo'
                  : 'Kanal baca-saja — kiriman baru disimpan di perangkat',
          }),
          el('span', { class: 'spacer' }),
          button('MUAT ULANG', {
            tone: 'ghost',
            size: 'sm',
            icon: 'reset',
            onClick: () => void loadRatings(),
          }),
        ),
        el(
          'div',
          { class: 'ctrl-kv' },
          kv('SUMBER', ratingSource === 'github' ? 'GitHub issues · label [RATING]' : 'lokal / cache'),
          kv('TERAKHIR DIBACA', remoteRatings.updatedAt() ? fmtTime(remoteRatings.updatedAt()) : 'belum pernah'),
          kv('DI PERANGKAT INI', String(ratingBook.all().length)),
          kv('CATATAN', 'Teks ulasan hanya terlihat oleh sesi operator'),
        ),
        ratingError ? el('p', { class: 'ops-hint', text: ratingError }) : null,
        segmented(
          [
            { value: 'all', label: 'SEMUA' },
            { value: 'app', label: 'APLIKASI' },
            { value: 'preset', label: 'PRESET' },
          ],
          ratingFilter,
          (value) => {
            ratingFilter = value as 'all' | 'app' | 'preset';
            render();
          },
        ).wrap,
      ),
      el(
        'div',
        { class: 'plate ctrl-plate' },
        sectionHead('05', 'DISTRIBUSI BINTANG'),
        summary.count
          ? el('div', { class: 'rate-bars' }, ...distribution)
          : el('p', { class: 'ctrl-empty', text: 'Belum ada penilaian pada filter ini.' }),
        el('div', {
          class: 'ops-hint',
          text: `Tren tujuh hari: ${weekCount} masuk · puncak harian ${peak}.`,
        }),
        el('div', { class: 'rate-trend' }, ...trend),
      ),
      el(
        'div',
        { class: 'plate ctrl-plate' },
        sectionHead('06', 'PERINGKAT PRESET'),
        ranking.length
          ? el(
              'div',
              { class: 'rate-rank' },
              ...ranking.map((row, index) =>
                el(
                  'div',
                  { class: 'rate-rank__row' },
                  el('span', { class: 'rate-rank__idx mono', text: String(index + 1).padStart(2, '0') }),
                  el('span', { class: 'rate-rank__name', text: targetLabel(row.target) }),
                  el('span', { class: 'rate-rank__score mono', text: row.summary.average.toFixed(2) }),
                  el('span', { class: 'rate-rank__count mono', text: `${row.summary.count}×` }),
                ),
              ),
            )
          : el('p', { class: 'ctrl-empty', text: 'Belum ada preset yang dinilai.' }),
      ),
      el(
        'div',
        { class: 'plate ctrl-plate' },
        sectionHead('07', 'ULASAN TERBARU'),
        rows.length ? el('div', { class: 'rate-list' }, ...rows) : el('p', { class: 'ctrl-empty', text: 'Belum ada ulasan.' }),
        el('p', {
          class: 'ops-hint',
          text: 'Ulasan tampil apa adanya setelah dibersihkan dari tautan dan karakter kendali. Sumbernya issue berlabel [RATING] di repo.',
        }),
      ),
    );
  }

  function renderLinkForm(): HTMLElement {
    return el(
      'div',
      { class: 'ops-link' },
      el(
        'label',
        { class: 'field' },
        el('span', { class: 'label', text: 'KUNCI' }),
        el('input', {
          class: 'input input--key',
          attrs: { type: 'text', placeholder: 'AEGIS-PRO-XXXX-XXXXXXXX-XXXXXX', 'aria-label': 'Kunci lisensi', value: linkKeyText },
          on: {
            input: (ev) => {
              linkKeyText = (ev.target as HTMLInputElement).value.toUpperCase();
            },
          },
        }),
      ),
      el(
        'div',
        { class: 'ops-link__row' },
        el('input', {
          class: 'input',
          attrs: { type: 'text', placeholder: 'Nama / @telegram', 'aria-label': 'Nama pembeli', value: linkNameText },
          on: {
            input: (ev) => {
              linkNameText = (ev.target as HTMLInputElement).value;
            },
          },
        }),
        el('input', {
          class: 'input',
          attrs: { type: 'text', placeholder: 'Catatan (opsional)', 'aria-label': 'Catatan', value: linkNoteText },
          on: {
            input: (ev) => {
              linkNoteText = (ev.target as HTMLInputElement).value;
            },
          },
        }),
      ),
      button('PERIKSA & SIMPAN', { tone: 'primary', size: 'sm', icon: 'check', onClick: () => void saveLinkedKey() }),
    );
  }

  function labelImport(): HTMLElement {
    const input = el('input', {
      class: 'sr-only',
      attrs: { type: 'file', accept: 'application/json,.json', 'aria-label': 'Impor daftar akun' },
      on: {
        change: (ev) => {
          const file = (ev.target as HTMLInputElement).files?.[0];
          if (!file) return;
          void file.text().then((text) => {
            const count = ledger.importJson(text);
            toast(count > 0 ? `${count} akun diimpor` : 'File tidak berisi akun', count > 0 ? 'ok' : 'err', 2000);
            render();
          });
        },
      },
    });
    const id = `ops-import-${Math.random().toString(36).slice(2, 8)}`;
    input.id = id;
    return el(
      'span',
      { class: 'ops-import' },
      input,
      el(
        'button',
        {
          class: 'btn btn--ghost btn--sm',
          attrs: { type: 'button' },
          on: { click: () => document.getElementById(id)?.click() },
        },
        el('span', { text: 'IMPOR' }),
      ),
    );
  }

  function renderAccount(account: OpsAccount): HTMLElement {
    const status = statusOf(account);
    const days = dayCount(account.expires);
    const label =
      status === 'revoked' ? 'DICABUT' : status === 'expired' ? 'HABIS' : status === 'expiring' ? `${days} HARI LAGI` : `${days} HARI`;
    const tone = status === 'revoked' || status === 'expired' ? 'bad' : status === 'expiring' ? 'warn' : 'ok';

    return el(
      'div',
      { class: 'ops-acct' },
      el(
        'div',
        { class: 'ops-acct__head' },
        el(
          'div',
          { class: 'ops-acct__id' },
          el('b', { text: account.handle }),
          el('span', { class: `ops-badge ops-badge--${account.tier === 'admin' ? 'admin' : 'pro'}`, text: account.tier.toUpperCase() }),
          el('span', { class: `ops-badge ops-badge--${tone}`, text: label }),
        ),
        el('code', { class: 'ops-acct__serial', text: account.serial }),
      ),
      el('code', { class: 'ops-acct__key', text: account.key }),
      el(
        'div',
        { class: 'ops-acct__meta' },
        el('span', { text: `Mulai ${fmtDate(account.issued)}` }),
        el('span', { text: `Berakhir ${fmtDate(account.expires)}` }),
        account.passes > 1 ? el('span', { text: `${account.passes} pass` }) : null,
      ),
      account.note ? el('p', { class: 'ops-acct__note', text: account.note }) : null,
      el(
        'div',
        { class: 'ops-acct__actions' },
        button('+30 HARI', {
          tone: 'primary',
          size: 'sm',
          icon: 'clock',
          title: 'Terbitkan kunci baru dengan serial sama',
          onClick: () => void renew(account),
        }),
        button('SALIN', {
          tone: 'ghost',
          size: 'sm',
          icon: 'copy',
          onClick: () => copy(account.key, 'Kunci disalin'),
        }),
        button(account.revoked ? 'PULIHKAN' : 'CABUT', {
          tone: account.revoked ? 'ghost' : 'danger',
          size: 'sm',
          onClick: () => {
            ledger.setRevoked(account.serial, !account.revoked);
            if (!account.revoked) {
              copy(account.serial, `Serial ${account.serial} disalin — tempel di workflow revoke`);
            }
            render();
          },
        }),
        button('HAPUS', {
          tone: 'ghost',
          size: 'sm',
          icon: 'trash',
          onClick: () => {
            ledger.remove(account.serial);
            render();
          },
        }),
      ),
    );
  }

  // ------------------------------------------------------------- device bindings
  let unbindText = '';
  let unbindBusy = false;
  let unbindHint = '';

  async function unbindDevice(): Promise<void> {
    const serial = unbindText.trim().toUpperCase();
    if (!serial) {
      unbindHint = 'Tempel serial kunci yang mau dilepas.';
      render();
      return;
    }
    unbindBusy = true;
    render();
    const data = await postDesk({ op: 'unbind', serial });
    unbindBusy = false;
    if (!data) {
      unbindHint = 'Pelepasan gagal. Cek mode ikatan di panel ini.';
      render();
      return;
    }
    if (data.ok === false) {
      const map: Record<string, string> = {
        ledger_unavailable: 'Ledger GitHub tidak terjangkau. Coba lagi sebentar.',
        ledger_off: 'Ledger belum aktif: isi AEGIS_LEDGER_TOKEN dulu.',
        write_failed: 'GitHub menolak tulisan. Cek izin token ledger.',
      };
      unbindHint = map[String(data.reason ?? '')] ?? `Ditolak: ${String(data.reason ?? 'unknown')}`;
      render();
      return;
    }
    unbindHint = data.removed
      ? `Ikatan ${serial} dilepas — kunci bisa diaktifkan di perangkat baru.`
      : `${serial} belum terikat ke perangkat mana pun.`;
    unbindText = '';
    await loadDesk();
    render();
  }

  function renderDevices(): HTMLElement {
    const info: DeviceState = desk?.devices ?? {
      mode: 'session',
      bound: 0,
      manual: 0,
      canRelease: false,
      devices: [],
    };
    const modeText: Record<DeviceState['mode'], string> = {
      github: 'LEDGER GITHUB — ikatan tersimpan di repo, otomatis',
      lock: 'KUNCI MANUAL — daftar AEGIS_DEVICE_LOCK',
      session: 'SESI SAJA — belum ada penyimpanan ikatan',
      degraded: 'LEDGER TERGANGGU — pembelian baru tidak dikunci',
    };
    return el(
      'div',
      { class: 'plate ctrl-plate', attrs: { 'data-role': 'devices' } },
      sectionHead('03c', 'IKATAN PERANGKAT'),
      el('p', {
        class: 'ops-hint',
        text: 'Satu kunci hanya aktif di satu perangkat. Perangkat menamai dirinya dengan id acak di local storage; id itu dikirim ke server saat kunci diaktifkan. Aktivasi dari perangkat lain ditolak dengan pesan "kunci sedang dipakai".',
      }),
      el(
        'div',
        { class: 'ops-toolbar' },
        el('b', { class: 'ops-badge', text: modeText[info.mode] }),
        el('span', { class: 'ops-badge', text: `${info.bound} TERIKAT` }),
        info.manual ? el('span', { class: 'ops-badge', text: `${info.manual} MANUAL` }) : null,
      ),
      info.mode === 'session'
        ? el('p', {
            class: 'ops-hint',
            text: 'Aktifkan penguncian: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → pilih repo ini → Repository permissions → Contents: Read and write → generate. Simpan hasilnya di Vercel sebagai AEGIS_LEDGER_TOKEN, lalu deploy ulang. Tanpa token, sesi tetap terikat ke perangkat yang memintanya tetapi server tidak menyimpan ikatan antar kunjungan.',
          })
        : null,
      info.mode === 'degraded'
        ? el('p', {
            class: 'ops-hint',
            text: 'Server tidak bisa membaca ledger sekarang. Pelanggan yang membeli tetap dilayani supaya tidak terkunci gara-gara gangguan di pihak kita.',
          })
        : null,
      info.devices.length === 0
        ? el('p', { class: 'ops-hint', text: 'Belum ada kunci yang terikat ke perangkat.' })
        : el(
            'div',
            { class: 'ops-list' },
            ...info.devices.map((row) =>
              el(
                'div',
                { class: 'ops-acct' },
                el(
                  'div',
                  { class: 'ops-acct__head' },
                  el(
                    'div',
                    { class: 'ops-acct__id' },
                    el('b', { text: row.serial }),
                    el('span', { class: 'ops-badge', text: row.device || '—' }),
                  ),
                  el('code', { class: 'ops-acct__serial', text: row.email || (row.at ? fmtDate(Date.parse(row.at)) : row.source) }),
                ),
                el(
                  'div',
                  { class: 'ops-acct__actions' },
                  button('LEPAS IKATAN', {
                    tone: 'danger',
                    size: 'sm',
                    onClick: () => {
                      if (!info.canRelease) {
                        unbindHint =
                          'Pelepasan otomatis butuh ledger GitHub. Dalam mode manual, hapus entri dari AEGIS_DEVICE_LOCK lalu deploy ulang.';
                        render();
                        return;
                      }
                      unbindText = row.serial;
                      void unbindDevice();
                    },
                  }),
                ),
              ),
            ),
          ),
      el(
        'div',
        { class: 'ops-toolbar' },
        el('input', {
          class: 'input',
          attrs: { type: 'text', placeholder: 'SERIAL', 'aria-label': 'Serial yang dilepas', value: unbindText },
          on: {
            input: (ev) => {
              unbindText = (ev.target as HTMLInputElement).value;
            },
          },
        }),
        button(unbindBusy ? 'MELEPAS…' : 'LEPAS', {
          tone: 'ghost',
          size: 'sm',
          icon: 'reset',
          onClick: () => void unbindDevice(),
        }),
      ),
      unbindHint ? el('p', { class: 'ops-hint', text: unbindHint }) : null,
    );
  }

  async function loadGoogle(): Promise<void> {
    googleBusy = true;
    render();
    try {
      const res = await fetch('/api/accounts', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      const data = (await res.json().catch(() => ({}))) as {
        accounts?: typeof googleRows;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? String(res.status));
      googleRows = data.accounts ?? [];
      googleLoaded = true;
    } catch {
      googleHint = 'Daftar akun Google tidak bisa dibaca. Masuk ulang sebagai operator.';
    } finally {
      googleBusy = false;
      render();
    }
  }

  async function grantGoogle(): Promise<void> {
    const email = googleEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      googleHint = 'Alamat email belum benar.';
      render();
      return;
    }
    googleBusy = true;
    render();
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'grant', email, days: Number(googleDays) }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; days?: number; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error ?? String(res.status));
      copy(
        data.token,
        `Token ${email} disalin — tempel ke AEGIS_PREMIUM, lalu deploy ulang`,
      );
      googleHint = `Token untuk ${email} (${data.days} hari) sudah di clipboard. Tempel ke AEGIS_PREMIUM di Vercel, pisahkan dengan koma, lalu deploy ulang.`;
      googleEmail = '';
      await loadGoogle();
    } catch {
      googleHint = 'Token gagal dibuat. Coba lagi.';
      googleBusy = false;
      render();
    }
  }

  function revokeGoogle(email: string): void {
    copy(email, `Email ${email} disalin — tambahkan ke AEGIS_REVOKED lalu deploy`);
    googleHint = `Tempel ${email} ke AEGIS_REVOKED (atau hapus tokennya dari AEGIS_PREMIUM), lalu deploy ulang. Grant yang masih bertanda tangan tidak bisa dicabut dari browser.`;
    render();
  }

  function renderGoogle(): HTMLElement {
    return el(
      'div',
      { class: 'plate ctrl-plate' },
      sectionHead('03b', 'AKUN GOOGLE'),
      el('p', {
        class: 'ops-hint',
        text: 'Akun Google yang masuk dengan sendirinya terdaftar di sini kalau sudah punya grant. Beri grant sekali, akun itu langsung PRO setiap kali masuk dari perangkat mana pun.',
      }),
      el(
        'div',
        { class: 'ops-toolbar' },
        el('input', {
          class: 'input',
          attrs: { type: 'email', placeholder: 'nama@gmail.com', 'aria-label': 'Email Google', value: googleEmail },
          on: { input: (ev) => { googleEmail = (ev.target as HTMLInputElement).value; } },
        }),
        segmented(
          [
            { value: '30', label: '30 HARI' },
            { value: '90', label: '90 HARI' },
            { value: '365', label: '1 TAHUN' },
          ],
          googleDays,
          (value) => { googleDays = value; render(); },
        ).wrap,
        button(googleBusy ? 'MEMPROSES…' : 'BERI PREMIUM', {
          tone: 'primary',
          size: 'sm',
          icon: 'bolt',
          onClick: () => void grantGoogle(),
        }),
        button('MUAT ULANG', {
          tone: 'ghost',
          size: 'sm',
          onClick: () => void loadGoogle(),
        }),
      ),
      googleHint ? el('p', { class: 'ops-hint', text: googleHint }) : null,
      googleRows.length === 0
        ? el('p', {
            class: 'ops-hint',
            text: googleLoaded ? 'Belum ada akun Google yang diberi premium.' : 'Memuat daftar…',
          })
        : el(
            'div',
            { class: 'ops-list' },
            ...googleRows.map((row) =>
              el(
                'div',
                { class: 'ops-acct' },
                el(
                  'div',
                  { class: 'ops-acct__head' },
                  el(
                    'div',
                    { class: 'ops-acct__id' },
                    el('b', { text: row.email }),
                    el('span', { class: `ops-badge ops-badge--${row.state === 'active' ? 'ok' : 'bad'}`, text: row.state === 'active' ? `PRO ${row.days} HARI` : 'HABIS' }),
                  ),
                  el('code', { class: 'ops-acct__serial', text: fmtDate(row.exp) }),
                ),
                el(
                  'div',
                  { class: 'ops-acct__actions' },
                  button('SALIN TOKEN', {
                    tone: 'ghost',
                    size: 'sm',
                    icon: 'copy',
                    onClick: () => copy(row.token, `Token ${row.email} disalin`),
                  }),
                  button('CABUT', {
                    tone: 'danger',
                    size: 'sm',
                    onClick: () => revokeGoogle(row.email),
                  }),
                ),
              ),
            ),
          ),
    );
  }

  function renderIssue(): void {
    body.append(
      el(
        'div',
        { class: 'plate ctrl-plate' },
        sectionHead('04', 'TERBITKAN KUNCI'),
        el('p', {
          class: 'lab-group__note',
          style: 'margin-top:0',
          text: 'Kunci ditandatangani HMAC-SHA256 oleh server; rahasianya tidak pernah menyentuh browser. Satu kunci bisa dipakai di semua perangkat pemiliknya.',
        }),
        el(
          'div',
          { class: 'ctrl-form' },
          el(
            'div',
            { class: 'field' },
            el('span', { class: 'label', text: 'PAKET' }),
            segmented(
              [
                { value: 'pro', label: 'PRO', sub: PRO_PRICE },
                { value: 'admin', label: 'ADMIN', sub: 'internal' },
              ],
              genTier,
              (value) => {
                genTier = value as 'pro' | 'admin';
              },
            ).wrap,
          ),
          el(
            'div',
            { class: 'field' },
            el('span', { class: 'label', text: 'MASA AKTIF' }),
            segmented(
              [
                { value: '1', label: '1H', sub: 'trial' },
                { value: '7', label: '7H' },
                { value: '30', label: '30H', sub: 'pass' },
                { value: '90', label: '90H' },
                { value: '365', label: '1TH' },
              ],
              genDays,
              (value) => {
                genDays = value;
              },
            ).wrap,
          ),
          el(
            'label',
            { class: 'field' },
            el('span', { class: 'label', text: 'NAMA PEMBELI' }),
            el('input', {
              class: 'input',
              attrs: { type: 'text', placeholder: 'mis. @budi — opsional', 'aria-label': 'Nama pembeli', value: genHandle },
              on: {
                input: (ev) => {
                  genHandle = (ev.target as HTMLInputElement).value;
                },
              },
            }),
          ),
          el(
            'label',
            { class: 'field' },
            el('span', { class: 'label', text: 'JUMLAH (1–20)' }),
            el('input', {
              class: 'input',
              attrs: { type: 'number', min: 1, max: 20, value: genCount, 'aria-label': 'Jumlah kunci' },
              on: {
                change: (ev) => {
                  genCount = (ev.target as HTMLInputElement).value;
                },
              },
            }),
          ),
        ),
        el(
          'div',
          { class: 'ctrl-actions' },
          button('BUAT KUNCI', { tone: 'primary', size: 'sm', icon: 'bolt', onClick: () => void issueKeys() }),
          generated.length > 0
            ? button('SALIN SEMUA', {
                tone: 'ghost',
                size: 'sm',
                icon: 'copy',
                onClick: () => copy(generated.map((g) => g.key).join('\n'), 'Semua kunci disalin'),
              })
            : null,
        ),
        generated.length > 0
          ? el(
              'div',
              { class: 'key-list' },
              ...generated.map((g) =>
                el(
                  'div',
                  { class: 'key-row' },
                  el('code', { text: g.key }),
                  el('span', { class: 'key-row__meta', text: `${g.tier.toUpperCase()} · ${g.expires}` }),
                  el('button', {
                    class: 'icon-btn',
                    attrs: { type: 'button', 'aria-label': 'Salin kunci' },
                    on: { click: () => copy(g.key, 'Kunci disalin') },
                  }),
                ),
              ),
            )
          : el('p', { class: 'ctrl-empty', text: 'Belum ada kunci dibuat di sesi ini.' }),
        el('p', {
          class: 'ops-hint',
          text: `Harga PRO ${PRO_PRICE} per 30 hari. Kunci 30 hari yang dijual manual: kirim lewat chat, jangan lewat komentar publik.`,
        }),
      ),
    );
  }

  function renderSecurity(): void {
    const revoked = ledger.revokedSerials();
    body.append(
      el(
        'div',
        { class: 'plate ctrl-plate' },
        sectionHead('05', 'HEADER LIVE'),
        el(
          'ul',
          { class: 'ctrl-checks' },
          ...headers.map((check) =>
            el(
              'li',
              { class: `ctrl-check ${check.ok ? 'is-ok' : 'is-bad'}` },
              el('span', { class: 'ctrl-check__dot' }),
              el('b', { text: check.label }),
              el('span', { class: 'ctrl-check__value', text: check.value.slice(0, 68) }),
            ),
          ),
        ),
        el(
          'div',
          { class: 'ctrl-actions' },
          button('PROBE ULANG', { tone: 'ghost', size: 'sm', icon: 'reset', onClick: () => void probeHeaders() }),
        ),
      ),
      el(
        'div',
        { class: 'plate ctrl-plate' },
        sectionHead('06', 'LAPORAN CSP'),
        el('p', {
          class: 'lab-group__note',
          style: 'margin-top:0',
          text: 'Hanya pelanggaran yang benar-benar dilaporkan browser. Kosong berarti tidak ada yang diblokir.',
        }),
        cspError
          ? el('p', { class: 'ctrl-empty', text: cspError })
          : csp.length === 0
            ? el('p', { class: 'ctrl-empty', text: 'Tidak ada laporan masuk.' })
            : el(
                'div',
                { class: 'ctrl-feed' },
                ...csp.slice(0, 12).map((entry) =>
                  el(
                    'div',
                    { class: 'ctrl-feed__row' },
                    el('b', { text: entry.directive }),
                    el('span', { text: entry.blocked || '(inline)' }),
                    el('time', { text: fmtTime(entry.at) }),
                  ),
                ),
              ),
        el(
          'div',
          { class: 'ctrl-actions' },
          button('MUAT ULANG FEED', { tone: 'ghost', size: 'sm', icon: 'reset', onClick: () => void loadCsp() }),
        ),
      ),
      el(
        'div',
        { class: 'plate ctrl-plate' },
        sectionHead('07', 'PENCABUTAN'),
        el(
          'div',
          { class: 'ctrl-kv' },
          kv('DAFTAR SERVER', desk ? `${desk.revoked} serial` : '—'),
          kv('DI PERANGKAT', `${revoked.length} ditandai`),
          kv('SECRET', desk?.devSecret ? 'DEV' : 'production'),
          kv('KATA SANDI', desk?.adminEnabled ? 'aktif' : 'belum disetel'),
        ),
        el('p', {
          class: 'lab-group__note',
          text: 'Cabut dari daftar akun, lalu buka workflow dan tempel serialnya. Daftar itu ikut ke build berikutnya — sekitar satu menit. Sesi yang sedang berjalan ikut mati pada permintaan berikutnya.',
        }),
        el(
          'div',
          { class: 'ctrl-actions' },
          revoked.length > 0
            ? button('SALIN SERIAL DICABUT', {
                tone: 'primary',
                size: 'sm',
                icon: 'copy',
                onClick: () => copy(revoked.join(','), `${revoked.length} serial disalin`),
              })
            : null,
          el('a', {
            class: 'btn btn--ghost btn--sm',
            attrs: { href: REVOKE_WORKFLOW, target: '_blank', rel: 'noopener noreferrer' },
            text: 'BUKA WORKFLOW',
          }),
          button('MATIKAN SEMUA SESI', {
            tone: 'ghost',
            size: 'sm',
            icon: 'bolt',
            onClick: () =>
              copy(
                'Ganti AEGIS_SECRET di Vercel lalu deploy ulang: semua sesi dan kunci lama langsung mati.',
                'Instruksi disalin',
              ),
          }),
        ),
      ),
    );
  }

  function kv(label: string, value: string): HTMLElement {
    return el('div', { class: 'ctrl-kv__row' }, el('span', { text: label }), el('b', { text: value }));
  }

  // ------------------------------------------------------------------ gate
  function renderGate(): void {
    const adminInput = el('input', {
      class: 'input',
      attrs: {
        type: 'password',
        autocomplete: 'current-password',
        spellcheck: 'false',
        autocapitalize: 'characters',
        'aria-label': 'Kunci operator',
      },
    });
    const error = el('p', { class: 'form-error', attrs: { role: 'alert' } });
    const submit = button('MASUK OPS', { tone: 'primary', block: true, icon: 'system' });

    const run = async (): Promise<void> => {
      if (!adminInput.value.trim()) {
        error.textContent = 'Masukkan kunci operator.';
        return;
      }
      submit.disabled = true;
      submit.textContent = 'MEMERIKSA…';
      const problem = await session.signInAdmin(adminInput.value);
      submit.disabled = false;
      submit.textContent = 'MASUK OPS';
      if (problem) {
        error.textContent = problem;
        return;
      }
      toast('Konsol terbuka', 'ok', 1600);
      render();
    };

    submit.addEventListener('click', () => void run());
    adminInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') void run();
    });
    // Paste is the normal way in: drop the key and go, no second tap. Deferred so
    // the clipboard has actually landed in the field before it is read.
    adminInput.addEventListener('paste', () => {
      setTimeout(() => {
        if (adminInput.value.trim().length >= 8) void run();
      }, 0);
    });

    // `#/control?op=…` signs in on load, then erases the key from the address bar
    // so it never lingers in history, a bookmark, or a screenshot.
    const linked = parseOperatorKey(location.hash);
    if (linked) {
      adminInput.value = linked;
      scrubOperatorKey();
      void run();
    }

    gate.append(
      el(
        'div',
        { class: 'plate ctrl-gate__card' },
        el('div', { class: 'screen__kicker', text: 'RESTRICTED' }),
        el('h2', { class: 'ctrl-gate__title', text: 'AKSES OPERATOR' }),
        el('p', {
          class: 'lab-group__note',
          text: session.state.adminEnabled
            ? 'Halaman ini tidak ditautkan dari navigasi. Buka tautan operator sekali — sesi bertahan 30 hari di perangkat ini — atau tempel kuncinya, langsung masuk tanpa menekan tombol.'
            : 'Kunci operator belum disetel di server. Tambahkan AEGIS_ADMIN_PASSWORD lalu deploy ulang.',
        }),
        el('div', { class: 'field' }, el('span', { class: 'label', text: 'KUNCI OPERATOR' }), adminInput),
        error,
        submit,
        button('KEMBALI KE BERANDA', {
          tone: 'ghost',
          block: true,
          onClick: () => {
            // The console has its own credential; the deck would ask for Google.
            location.hash = '#/home';
          },
        }),
      ),
    );
  }

  // ------------------------------------------------------------------ render
  function render(): void {
    const isAdmin = session.state.tier === 'admin';

    gate.replaceChildren();
    tabsHost.replaceChildren();
    body.replaceChildren();

    if (!isAdmin) {
      renderGate();
      screen.dataset.gate = 'locked';
      return;
    }
    screen.dataset.gate = 'open';

    tabsHost.append(
      segmented(
        [
          { value: 'live', label: 'LIVE' },
          { value: 'accounts', label: 'AKUN' },
          { value: 'rating', label: 'RATING' },
          { value: 'issue', label: 'TERBIT' },
          { value: 'security', label: 'KEAMANAN' },
        ],
        tab,
        (value) => {
          tab = value as Tab;
          render();
          if (tab === 'security') {
            void probeHeaders();
            void loadCsp();
            void loadDesk();
          }
          if (tab === 'accounts') void loadDesk();
          if (tab === 'rating') void loadRatings();
        },
      ).wrap,
    );

    if (tab === 'live') renderLive();
    else if (tab === 'accounts') renderAccounts();
    else if (tab === 'rating') renderRating();
    else if (tab === 'issue') renderIssue();
    else renderSecurity();
  }

  session.subscribe(render);
  render();

  const clock = window.setInterval(() => {
    stamp.textContent = new Date().toLocaleTimeString('id-ID');
  }, 1000);

  return {
    el: screen,
    update: render,
    onEnter: () => {
      if (session.state.tier === 'admin') {
        void ping();
        void loadDesk();
      }
    },
    destroy: () => {
      window.clearInterval(clock);
      window.clearInterval(autoTimer);
    },
  };
}

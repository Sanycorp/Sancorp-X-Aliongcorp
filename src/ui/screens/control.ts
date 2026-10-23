import { el, button, icon, sectionHead, segmented, toast } from '../elements';
import { brandMark } from '../brand';
import { session } from '../../state/session';
import { ledger, statusOf, dayCount } from '../../state/ops';
import type { OpsAccount, OpsFilter } from '../../state/ops';
import { RATING_APP, dedupe, rankByTarget, ratingBook, remoteRatings, summarize, trendOf } from '../../state/rating';
import type { Rating } from '../../state/rating';
import { installRipple } from '../motion';
import { Haptics } from '../haptics';
import { installAvailable, iosInstallHint, onInstallChange, promptInstall, standalone } from '../install';
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

type Tab = 'overview' | 'accounts' | 'issue' | 'rating' | 'security' | 'guide';

/**
 * The owner's map of the console. Every room says what it is for in the words a
 * shopkeeper would use, because the person running this is not the person who
 * wrote the DSP. The internal tab ids stay stable; only the labels are human.
 */
const TABS: { id: Tab; label: string; purpose: string; icon: 'home' | 'arsenal' | 'key' | 'wave' | 'cpu' | 'book' }[] = [
  { id: 'overview', label: 'Ringkasan', purpose: 'Kondisi hari ini', icon: 'home' },
  { id: 'accounts', label: 'Akun', purpose: 'Siapa aktif, sampai kapan', icon: 'arsenal' },
  { id: 'issue', label: 'Kunci', purpose: 'Buat kunci untuk pembeli', icon: 'key' },
  { id: 'rating', label: 'Penilaian', purpose: 'Bintang dan ulasan', icon: 'wave' },
  { id: 'security', label: 'Layanan', purpose: 'Situs, kecepatan, keamanan', icon: 'cpu' },
  { id: 'guide', label: 'Panduan', purpose: 'Cara pakai, bahasa manusia', icon: 'book' },
];

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
  let tab: Tab = 'overview';
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

  const greeting = el('p', { class: 'owner-head__greet' });
  const todayNote = el('p', { class: 'owner-head__today' });

  const screen = el(
    'section',
    { class: 'screen owner', id: 'screen-control', attrs: { 'aria-label': 'Panel owner Aegis Sound Lab' } },
    el(
      'header',
      { class: 'owner-head' },
      el('div', { class: 'owner-head__seal' }, brandMark(52)),
      el(
        'div',
        { class: 'owner-head__id' },
        el('p', { class: 'owner-head__kicker', text: 'PANEL OWNER · SANAYACORP' }),
        el('h1', { class: 'owner-head__title' }, 'Aegis Sound Lab', el('em', { text: ' — pusat kendali' })),
        el('p', {
          class: 'owner-head__note',
          text: 'Semua keputusan ada di sini: siapa yang sedang aktif, kunci apa yang terbit, dan apakah situsnya sehat. Tidak perlu paham istilah teknis.',
        }),
        greeting,
      ),
      el(
        'div',
        { class: 'owner-head__meta' },
        el('span', { class: 'chip chip--live' }, el('b', { text: 'OWNER' })),
        el('span', { class: 'chip owner-chip-ver' }, el('b', { text: APP_VERSION })),
        stamp,
        el(
          'div',
          { class: 'owner-head__acts' },
          el(
            'button',
            {
              class: 'owner-act',
              attrs: { type: 'button', 'aria-label': 'Muat ulang data panel', title: 'Muat ulang data' },
              on: {
                click: () => {
                  Haptics.tap();
                  deskAutoTried = true;
                  void ping();
                  void loadDesk();
                  if (tab === 'rating' || tab === 'overview') void loadRatings();
                  toast('Data diperbarui', 'ok', 1200);
                },
              },
            },
            icon('reset', 16),
          ),
          el(
            'button',
            {
              class: 'owner-act',
              attrs: { type: 'button', 'aria-label': 'Kembali ke beranda', title: 'Beranda' },
              on: {
                click: () => {
                  Haptics.tap();
                  location.hash = '#/home';
                },
              },
            },
            icon('home', 16),
          ),
        ),
      ),
    ),
    todayNote,
    gate,
    tabsHost,
    body,
    el('div', {
      class: 'footnote',
      text: `Panel owner · Aegis Sound Lab ${APP_VERSION} · Sanayacorp · angka dibaca langsung dari deployment ini`,
    }),
  );

  installRipple(screen);

  // ------------------------------------------------------------------ probes
  async function ping(): Promise<void> {
    if (tab === 'overview') render();
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
    if (tab === 'overview' || tab === 'security') render();
  }

  let deskAutoTried = false;
  let ratingAutoTried = false;
  let healthAutoTried = false;

  async function loadDesk(): Promise<void> {
    try {
      const res = await fetch('/api/license', { cache: 'no-store', headers: { accept: 'application/json' } });
      desk = res.ok ? ((await res.json()) as DeskState) : null;
    } catch {
      desk = null;
    }
    if (tab === 'security' || tab === 'overview') render();
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


  // ------------------------------------------------------------------ plain help
  /** One sentence, no jargon: what this card is for and what to do with it. */
  function note(text: string): HTMLElement {
    return el(
      'p',
      { class: 'owner-note' },
      icon('help', 14),
      el('span', { text }),
    );
  }

  /** The short version, folded away so it never shouts over the numbers. */
  function howTo(summary: string, steps: string[]): HTMLElement {
    return el(
      'details',
      { class: 'owner-how' },
      el('summary', {}, icon('book', 14), el('span', { text: summary })),
      el('ol', { class: 'owner-how__list' }, ...steps.map((line) => el('li', { text: line }))),
    );
  }

  function greet(): void {
    const hour = new Date().getHours();
    const part = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
    const stats = ledger.stats();
    greeting.textContent = `${part}, Owner. ${stats.active} akun aktif, ${stats.expiring} hampir habis.`;
    todayNote.textContent = new Date().toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  /** Navigating between rooms always leaves the data they need loaded. */
  function go(next: Tab): void {
    tab = next;
    render();
    if (next === 'accounts' || next === 'security' || next === 'overview') void loadDesk();
    if (next === 'rating' || next === 'overview') void loadRatings();
    if (next === 'security') {
      void probeHeaders();
      void loadCsp();
    }
    if (next === 'overview') void ping();
  }

  /**
   * The "make this an app" strip. Shown only when the browser has actually
   * offered an install, or on iOS where the Share sheet is the only route.
   * Inside the Capacitor build it says the app is already the app.
   */
  function installStrip(): HTMLElement | null {
    if (standalone()) return null;
    if (installAvailable()) {
      return el(
        'div',
        { class: 'owner-install' },
        icon('download', 16),
        el('div', { class: 'owner-install__text' }, el('b', { text: 'Pakai sebagai aplikasi' }), el('span', { text: 'Layar penuh, tanpa address bar, dan tab tetap di bawah seperti aplikasi biasa.' })),
        button('PASANG', {
          tone: 'primary',
          size: 'sm',
          onClick: () => {
            void promptInstall().then((outcome) => {
              if (outcome === 'accepted') toast('Aplikasi dipasang — buka dari layar utama', 'ok', 2600);
              else if (outcome === 'dismissed') toast('Pemasangan dibatalkan', 'info', 1600);
              else toast('Browser ini belum menawarkan pemasangan', 'err', 2200);
              render();
            });
          },
        }),
      );
    }
    if (iosInstallHint()) {
      return el(
        'div',
        { class: 'owner-install' },
        icon('share', 16),
        el('div', { class: 'owner-install__text' }, el('b', { text: 'Pasang di iPhone/iPad' }), el('span', { text: 'Ketuk tombol Bagikan di Safari, lalu pilih "Tambah ke Layar Utama".' })),
      );
    }
    return null;
  }

  function ownerTabs(): HTMLElement {
    return el(
      'div',
      { class: 'owner-tabs', attrs: { role: 'tablist', 'aria-label': 'Bagian panel owner' } },
      ...TABS.map((entry) =>
        el(
          'button',
          {
            class: 'owner-tab',
            attrs: {
              type: 'button',
              role: 'tab',
              'aria-selected': String(entry.id === tab),
              'data-tab': entry.id,
            },
            on: {
              click: () => {
                if (entry.id === tab) return;
                Haptics.tap();
                go(entry.id);
              },
            },
          },
          el('span', { class: 'owner-tab__icon' }, icon(entry.icon, 17)),
          el(
            'span',
            { class: 'owner-tab__text' },
            el('b', { text: entry.label }),
            el('em', { text: entry.purpose }),
          ),
        ),
      ),
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
        sectionHead('04', 'KESEHATAN LAYANAN'),
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
        sectionHead('05', 'SESI OPERATOR'),
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
        sectionHead('01', 'DAFTAR AKUN'),
        note(
          'Semua pembeli yang tercatat di perangkat ini. Cari dengan nomor seri, nama, atau potongan kunci. Tombol di tiap baris untuk perpanjang, cabut, atau lepas ikatan perangkat.',
        ),
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
      if (tab === 'rating' || tab === 'overview') render();
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
        sectionHead('01', 'KANAL PENILAIAN'),
        note('Bintang yang dikirim pengguna dari halaman SISTEM. Kamu tidak bisa mengubah atau menghapusnya — ini yang membuatnya bisa dipercaya.'),
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
        sectionHead('01', 'TERBITKAN KUNCI'),
        note(
          'Kunci untuk pembeli baru. Pilih lama aktif, lalu tekan TERBITKAN — kuncinya langsung tersalin untuk dikirim lewat Telegram.',
        ),
        el('p', {
          class: 'lab-group__note',
          style: 'margin-top:0',
          text: 'Kunci ditandatangani HMAC-SHA256 di server; rahasianya tidak pernah sampai ke browser. Satu kunci hanya hidup di satu perangkat.',
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
        sectionHead('01', 'HEADER LIVE'),
        note(
          'Pemeriksaan pengamanan yang dikirim server ke setiap pengunjung. Semua harus hijau. Kalau ada yang merah, jangan panik dulu: tekan PERIKSA ULANG.',
        ),
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
    const submit = button('BUKA PANEL', { tone: 'primary', block: true, icon: 'key' });

    const run = async (): Promise<void> => {
      if (!adminInput.value.trim()) {
        error.textContent = 'Masukkan kunci operator.';
        return;
      }
      submit.disabled = true;
      submit.textContent = 'MEMERIKSA…';
      const problem = await session.signInAdmin(adminInput.value);
      submit.disabled = false;
      submit.textContent = 'BUKA PANEL';
      if (problem) {
        error.textContent = problem;
        return;
      }
      toast('Panel owner terbuka', 'ok', 1600);
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
        { class: 'plate ctrl-gate__card owner-gate' },
        el('div', { class: 'owner-gate__seal' }, brandMark(58)),
        el('div', { class: 'screen__kicker', text: 'KHUSUS PEMILIK' }),
        el('h2', { class: 'ctrl-gate__title', text: 'PANEL OWNER' }),
        el('p', {
          class: 'lab-group__note',
          text: session.state.adminEnabled
            ? 'Halaman ini hanya untuk kamu. Tidak ada tautannya di menu mana pun. Tempel kunci operator, atau buka tautan operator sekali — panel ini ingat perangkatmu selama 30 hari.'
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

  // ------------------------------------------------------------------ overview
  /**
   * The first thing the owner sees: is the shop open, who is inside, how much
   * has been sold, and what needs a decision today. No log lines, no endpoints.
   */
  function renderSummary(): void {
    const stats = ledger.stats();
    const ok = Boolean(health?.ok);
    const summary = summarize(dedupe(ratings));
    const accounts = ledger.all();
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const issuedToday = accounts.filter((a) => a.issued >= startOfDay).length;

    const attention: { tone: 'ok' | 'warn' | 'bad'; title: string; body: string; act?: [string, () => void] }[] = [];
    // Before the first probe there is nothing to report: saying "down" would be
    // a guess, and the owner would act on it.
    if (health && !ok) {
      attention.push({
        tone: 'bad',
        title: 'Situs tidak menjawab',
        body: 'Pemeriksaan terakhir gagal. Coba cek ulang; kalau tetap gagal, deployment-nya yang bermasalah, bukan pembelimu.',
        act: ['CEK ULANG', () => void ping()],
      });
    }
    if (stats.expiring > 0) {
      attention.push({
        tone: 'warn',
        title: `${stats.expiring} akun habis dalam 7 hari`,
        body: 'Hubungi pemiliknya untuk perpanjangan, atau biarkan turun ke paket gratis.',
        act: ['BUKA AKUN', () => go('accounts')],
      });
    }
    if (!desk) {
      attention.push({
        tone: 'warn',
        title: 'Data lisensi belum terbaca',
        body: 'Server belum menjawab daftar lisensi. Angka di kartu ini hanya dari catatan perangkat ini.',
        act: ['MUAT ULANG', () => void loadDesk()],
      });
    }
    if (desk?.devSecret) {
      attention.push({
        tone: 'bad',
        title: 'Kunci keamanan masih mode uji',
        body: 'Selama mode ini hidup, kunci yang kamu jual bisa dipalsukan. Ganti nilainya di pengaturan Vercel sebelum menerima pembayaran.',
      });
    }
    if (desk && !desk.adminEnabled) {
      attention.push({
        tone: 'warn',
        title: 'Kata sandi operator belum disetel',
        body: 'Tanpa kata sandi, panel ini hanya bisa dibuka dari tautan operator yang kamu simpan sendiri.',
      });
    }
    if (stats.revoked > 0) {
      attention.push({
        tone: 'warn',
        title: `${stats.revoked} kunci dicabut`,
        body: 'Kuncinya sudah mati, tapi akunnya masih tercatat di sini. Hapus kalau sudah tidak perlu.',
        act: ['LIHAT DAFTAR', () => go('accounts')],
      });
    }
    if (csp.length > 0) {
      attention.push({
        tone: 'warn',
        title: `${csp.length} laporan keamanan masuk`,
        body: 'Ada yang mencoba memuat sesuatu yang diblokir. Biasanya ekstensi browser, bukan serangan.',
        act: ['BACA LAPORAN', () => go('security')],
      });
    }

    const quick: HTMLElement[] = [
      el(
        'button',
        { class: 'owner-quick', attrs: { type: 'button' }, on: { click: () => void quickAccount().then(() => go('accounts')) } },
        el('span', { class: 'owner-quick__icon' }, icon('plus', 16)),
        el('b', { text: 'Buat 1 akun PRO 30 hari' }),
        el('span', { text: 'Kunci dibuat dan disalin otomatis. Kirim ke pembeli lewat Telegram.' }),
      ),
      el(
        'button',
        { class: 'owner-quick', attrs: { type: 'button' }, on: { click: () => go('accounts') } },
        el('span', { class: 'owner-quick__icon' }, icon('shield', 16)),
        el('b', { text: 'Premiumkan akun Google' }),
        el('span', { text: 'Kalau pembeli sudah masuk dengan Google, cukup tandai akunnya — tanpa kunci.' }),
      ),
      el(
        'button',
        { class: 'owner-quick', attrs: { type: 'button' }, on: { click: () => go('security') } },
        el('span', { class: 'owner-quick__icon' }, icon('cpu', 16)),
        el('b', { text: 'Periksa kesehatan situs' }),
        el('span', { text: 'Cek apakah halaman, server, dan pengamanannya masih normal.' }),
      ),
      el(
        'button',
        { class: 'owner-quick', attrs: { type: 'button' }, on: { click: () => go('guide') } },
        el('span', { class: 'owner-quick__icon' }, icon('book', 16)),
        el('b', { text: 'Buka panduan' }),
        el('span', { text: 'Langkah demi langkah untuk jualan, perpanjang, dan memindah perangkat.' }),
      ),
    ];

    body.append(
      el(
        'div',
        { class: 'owner-stats' },
        statCard(
          'SITUS',
          health ? (ok ? 'Hidup' : 'Gangguan') : 'Memeriksa…',
          health ? (ok ? `jawab ${latency} ms` : 'cek ulang di Layanan') : 'menunggu jawaban server',
        ),
        statCard('AKUN AKTIF', String(stats.active), `${stats.total} tercatat · ${issuedToday} baru hari ini`),
        statCard('PENDAPATAN', money(stats.revenue), 'dari pass yang tercatat'),
        statCard('PENILAIAN', summary.count ? `${summary.average.toFixed(1)} / 5` : '—', summary.count ? `${summary.count} penilaian masuk` : 'belum ada yang menilai'),
      ),
      el(
        'div',
        { class: 'owner-cols' },
        el(
          'div',
          { class: 'plate ctrl-plate owner-plate' },
          sectionHead('01', 'PERLU KEPUTUSAN'),
          note('Daftar ini kosong kalau semuanya aman. Kalau ada isinya, kerjakan dari atas.'),
          attention.length
            ? el(
                'div',
                { class: 'owner-alerts' },
                ...attention.map((item) =>
                  el(
                    'div',
                    { class: `owner-alert owner-alert--${item.tone}` },
                    el('span', { class: 'owner-alert__dot' }),
                    el('div', { class: 'owner-alert__body' }, el('b', { text: item.title }), el('p', { text: item.body })),
                    item.act
                      ? button(item.act[0], { tone: 'ghost', size: 'sm', onClick: item.act[1] })
                      : null,
                  ),
                ),
              )
            : el(
                'p',
                { class: 'owner-clear' },
                icon('check', 15),
                el('span', { text: 'Semua beres. Tidak ada yang menunggu hari ini.' }),
              ),
        ),
        el(
          'div',
          { class: 'plate ctrl-plate owner-plate' },
          sectionHead('02', 'MULAI DARI SINI'),
          note('Empat tombol yang menutup hampir semua pekerjaan harian.'),
          el('div', { class: 'owner-quick-grid' }, ...quick),
        ),
      ),
      el(
        'div',
        { class: 'plate ctrl-plate owner-plate' },
        sectionHead('03', 'HARI INI'),
        el(
          'div',
          { class: 'ctrl-kv' },
          kv('KUNCI HARI INI', `${issuedToday} terbit`),
          kv('AKUN HAMPIR HABIS', `${stats.expiring} akun`),
          kv('PENDAPATAN TERCATAT', money(stats.revenue)),
          kv('VERSI SITUS', health?.commit ?? '—'),
          kv('WILAYAH SERVER', health?.region ?? '—'),
          kv('CEK TERAKHIR', lastProbe ? fmtTime(lastProbe) : 'belum dicek'),
        ),
        howTo('Apa arti angka-angka ini?', [
          'Akun aktif = kunci yang belum kedaluwarsa dan belum dicabut.',
          'Pendapatan dihitung dari pass yang tercatat di perangkat ini, bukan dari rekening bank.',
          'Versi situs adalah potongan kode yang sedang tayang. Kalau berbeda dengan yang terakhir kamu kirim, deployment belum selesai.',
        ]),
      ),
    );

    // The raw telemetry stays at the bottom: numbers the owner may need when
    // talking to support, not the first thing they should read.
    renderLive();
  }

  // ------------------------------------------------------------------ guide
  /**
   * The manual. Written for the person who sells the product, not the person
   * who built it: short sentences, no endpoint names, and an answer for every
   * question that arrives on Telegram.
   */
  function renderGuide(): void {
    const telegram = (body: string, label: string): HTMLElement =>
      el(
        'div',
        { class: 'owner-tpl' },
        el('code', { text: body }),
        button('SALIN', { tone: 'ghost', size: 'sm', icon: 'copy', onClick: () => copy(body, `${label} disalin`) }),
      );

    const flow = [
      {
        title: 'Kalau ada yang membayar',
        steps: [
          'Buka Telegram dan pastikan uangnya benar-benar masuk.',
          'Tab Kunci → pilih 30 hari → tekan TERBITKAN. Kuncinya langsung tersalin.',
          'Tempel kunci ke chat pembeli, sertakan alamat situs.',
          'Pembeli membuka situs → MASUK DENGAN GOOGLE → tempel kunci di AKTIFKAN KUNCI.',
        ],
      },
      {
        title: 'Kalau pembeli sudah punya akun Google',
        steps: [
          'Tab Akun → bagian AKUN GOOGLE.',
          'Tempel alamat Gmail pembeli, pilih 30 hari, lalu PREMIUMKAN.',
          'Minta pembeli muat ulang halaman. Paket PRO langsung aktif tanpa kunci.',
        ],
      },
      {
        title: 'Kalau pembeli minta perpanjang',
        steps: [
          'Tab Akun → cari nomor seri atau namanya.',
          'Tekan PERPANJANG 30 HARI. Masa aktif ditambah dari tanggal berakhir yang lama.',
          'Kirim pesan konfirmasi. Kunci baru tidak perlu dibuat.',
        ],
      },
      {
        title: 'Kalau pembeli ganti HP',
        steps: [
          'Tab Akun → bagian IKATAN PERANGKAT.',
          'Cari nomor serinya, lalu tekan LEPAS.',
          'Pembeli mengaktifkan kunci yang sama di perangkat baru. Tidak ada biaya.',
        ],
      },
      {
        title: 'Kalau ada yang menyalahgunakan kunci',
        steps: [
          'Tab Akun → cari akunnya → tekan CABUT.',
          'Kunci itu mati seketika di semua perangkat.',
          'Catat alasannya di kolom catatan supaya nanti tidak bingung.',
        ],
      },
    ];

    const glossary = [
      ['Kunci', 'Deretan huruf dan angka yang kamu kirim ke pembeli. Satu kunci hanya hidup di satu perangkat.'],
      ['Pass', 'Masa aktif 30 hari. Boleh ditumpuk: beli dua kali, aktifnya 60 hari.'],
      ['Akun Google', 'Cara masuk ke studio. Premium bisa ditempel ke akun ini tanpa kunci sama sekali.'],
      ['Perangkat', 'HP atau laptop yang dipakai. Kunci menempel di satu perangkat; pindah perangkat harus dilepas dulu.'],
      ['Catatan (ledger)', 'Buku kas kecil di perangkat ini: siapa beli, berapa pass, kapan. Bukan rekening bank.'],
      ['Pendapatan', 'Jumlah pass yang tercatat dikali harga. Kalau kamu mencatat manual, angkanya ikut.'],
    ];

    body.append(
      el(
        'div',
        { class: 'plate ctrl-plate owner-plate' },
        sectionHead('01', 'LIMA PEKERJAAN UTAMA'),
        note('Kalau kamu hanya ingat satu halaman dari panel ini, ingat halaman ini.'),
        el(
          'div',
          { class: 'owner-flows' },
          ...flow.map((item, i) =>
            el(
              'div',
              { class: 'owner-flow' },
              el('span', { class: 'owner-flow__num', text: String(i + 1).padStart(2, '0') }),
              el('h3', { text: item.title }),
              el('ol', {}, ...item.steps.map((line) => el('li', { text: line }))),
            ),
          ),
        ),
      ),
      el(
        'div',
        { class: 'owner-cols' },
        el(
          'div',
          { class: 'plate ctrl-plate owner-plate' },
          sectionHead('02', 'ISTILAH, DITERJEMAHKAN'),
          el(
            'dl',
            { class: 'owner-gloss' },
            ...glossary.flatMap(([term, meaning]) => [
              el('dt', { text: term }),
              el('dd', { text: meaning }),
            ]),
          ),
        ),
        el(
          'div',
          { class: 'plate ctrl-plate owner-plate' },
          sectionHead('03', 'PESAN SIAP KIRIM'),
          note('Tempel ke Telegram. Ganti bagian dalam kurung kalau perlu.'),
          telegram(
            'Halo! Pembayaran sudah masuk. Ini kunci PRO 30 hari kamu:\n\nAEGIS-PRO-…\n\nCara pakai: buka situs, MASUK DENGAN GOOGLE, lalu tempel kunci di AKTIFKAN KUNCI. Satu kunci untuk satu perangkat. Kalau ganti HP, chat saya lagi — dilepas gratis.',
            'Pesan pengiriman',
          ),
          telegram(
            'Sudah saya perpanjang 30 hari ya. Kunci yang sama tetap dipakai, tidak perlu aktivasi ulang. Terima kasih!',
            'Pesan perpanjangan',
          ),
          telegram(
            'Ikatannya sudah saya lepas. Silakan buka situs di HP baru, masuk dengan Google, lalu tempel kunci yang sama. Kalau ada kendala, kirim tangkapan layarnya.',
            'Pesan pindah perangkat',
          ),
        ),
      ),
      el(
        'div',
        { class: 'plate ctrl-plate owner-plate' },
        sectionHead('04', 'YANG JANGAN DILAKUKAN'),
        el(
          'ul',
          { class: 'owner-dont' },
          el('li', { text: 'Jangan kirim kunci operator ke siapa pun. Itu kunci rumahmu, bukan produk.' }),
          el('li', { text: 'Jangan menilai ulang pembeli dari akun sendiri untuk menaikkan bintang.' }),
          el('li', { text: 'Jangan mencabut kunci tanpa mencatat alasan — tiga bulan lagi kamu akan lupa.' }),
          el('li', { text: 'Jangan menganggap angka pendapatan di sini sebagai pembukuan resmi.' }),
        ),
      ),
    );
  }

  function render(): void {
    const isAdmin = session.state.tier === 'admin';

    gate.replaceChildren();
    tabsHost.replaceChildren();
    body.replaceChildren();

    greet();

    if (!isAdmin) {
      renderGate();
      screen.dataset.gate = 'locked';
      return;
    }
    screen.dataset.gate = 'open';

    const strip = installStrip();
    if (strip) tabsHost.append(strip);
    tabsHost.append(ownerTabs());
    tabsHost.scrollTop = 0;

    // First paint has no data yet: fetch it once, quietly, so the summary is
    // never a wall of dashes on arrival. A failure is retried by the button,
    // not by a loop.
    if (!deskAutoTried) {
      deskAutoTried = true;
      void loadDesk();
    }
    if (tab === 'overview' && !ratingAutoTried) {
      ratingAutoTried = true;
      void loadRatings();
    }
    if (!healthAutoTried) {
      healthAutoTried = true;
      void ping();
    }

    if (tab === 'overview') renderSummary();
    else if (tab === 'accounts') renderAccounts();
    else if (tab === 'rating') renderRating();
    else if (tab === 'issue') renderIssue();
    else if (tab === 'security') renderSecurity();
    else renderGuide();
  }

  session.subscribe(render);
  onInstallChange(() => {
    if (document.contains(screen)) render();
  });
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

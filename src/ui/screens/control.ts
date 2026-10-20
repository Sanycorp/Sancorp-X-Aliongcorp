import { el, button, sectionHead, segmented, toast } from '../elements';
import { session } from '../../state/session';
import { installRipple } from '../motion';
import type { Screen } from './deck';
import { APP_VERSION } from '../../version';

/**
 * Control console — the paid-product operator view.
 *
 * Everything shown here is measured, not asserted:
 *  - /api/health answers from the same deployment that serves this page
 *  - header checks read the live response this document arrived with
 *  - the CSP feed reads what the collector actually received
 *  - license keys are signed by the server, never in the browser
 *
 * It is intentionally not linked from the navigation. It only renders for a
 * session with tier "admin"; anything else gets the sign-in form.
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

interface CspEntry {
  directive: string;
  blocked: string;
  document: string;
  disposition: string;
  line: number;
  at: number;
}

const HEADER_CHECKS: { key: string; label: string; expect?: string }[] = [
  { key: 'content-security-policy', label: 'CSP', expect: "default-src 'none'" },
  { key: 'strict-transport-security', label: 'HSTS', expect: 'max-age' },
  { key: 'cross-origin-opener-policy', label: 'COOP', expect: 'same-origin' },
  { key: 'cross-origin-embedder-policy', label: 'COEP', expect: 'credentialless' },
  { key: 'x-content-type-options', label: 'XCTO', expect: 'nosniff' },
  { key: 'referrer-policy', label: 'REFERRER', expect: 'no-referrer' },
  { key: 'permissions-policy', label: 'PERMISSIONS', expect: 'camera=()' },
];

function readHeaders(): { key: string; label: string; ok: boolean; value: string }[] {
  // The headers of the document itself are not exposed to JS. Instead we ask
  // the server for a HEAD and read what came back on that response.
  return HEADER_CHECKS.map((check) => ({ key: check.key, label: check.label, ok: false, value: 'menunggu probe' }));
}

function stateBadge(text: string, tone: 'ok' | 'warn' | 'bad'): HTMLElement {
  return el('span', { class: `ctrl-badge ctrl-badge--${tone}`, text });
}

export function createControl(): Screen {
  let health: HealthData | null = null;
  let latency = 0;
  let lastProbe = 0;
  const headers: { key: string; label: string; ok: boolean; value: string }[] = readHeaders();
  let csp: CspEntry[] = [];
  let cspError = '';
  let generated: { key: string; tier: string; expires: string }[] = [];
  let genTier: 'pro' | 'admin' = 'pro';
  let genDays = '365';
  let genCount = '1';
  let busy = false;
  let section: 'status' | 'security' | 'license' = 'status';

  const gate = el('div', { class: 'ctrl-gate' });
  const body = el('div', { class: 'ctrl-body' });
  const tabHost = el('div', { class: 'ctrl-tabs' });
  const stamp = el('span', { class: 'ctrl-clock', text: '--:--:--' });

  const screen = el(
    'section',
    { class: 'screen', id: 'screen-control', attrs: { 'aria-label': 'Konsol kontrol' } },
    el(
      'div',
      { class: 'screen__intro' },
      el(
        'div',
        {},
        el('div', { class: 'screen__kicker', text: 'AEGIS-M / OPERATIONS' }),
        el('h1', { class: 'screen__title', html: 'CONTROL <em>DECK</em>' }),
      ),
      el('div', { class: 'header__meta' }, el('span', { class: 'chip' }, el('b', { text: 'ADMIN' })), stamp),
    ),
    gate,
    tabHost,
    body,
    el('div', { class: 'footnote', text: `Konsol operator · AEGIS-M ${APP_VERSION} · data dibaca live dari deployment ini` }),
  );

  installRipple(screen);

  // ------------------------------------------------------------------ probes
  async function ping(): Promise<void> {
    busy = true;
    render();
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
    busy = false;
    render();
  }

  async function probeHeaders(): Promise<void> {
    try {
      const res = await fetch(`/?probe=${Date.now()}`, { cache: 'no-store', method: 'GET' });
      for (const check of headers) {
        const value = res.headers.get(check.key) ?? '';
        const expect = HEADER_CHECKS.find((h) => h.key === check.key)?.expect ?? '';
        check.value = value || 'tidak ada';
        check.ok = value.toLowerCase().includes(expect.toLowerCase());
      }
    } catch {
      for (const check of headers) {
        check.ok = false;
        check.value = 'probe gagal';
      }
    }
    render();
  }

  async function loadCsp(): Promise<void> {
    try {
      const res = await fetch('/api/csp-report', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!res.ok) {
        cspError = res.status === 403 ? 'butuh sesi admin' : `HTTP ${res.status}`;
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
    render();
  }

  // ------------------------------------------------------------------ views
  function renderStatus(): void {
    const ok = Boolean(health?.ok);
    const tone: 'ok' | 'warn' | 'bad' = ok ? 'ok' : latency === -1 ? 'bad' : 'warn';
    body.append(
      el(
        'div',
        { class: 'grid grid--lab' },
        el(
          'div',
          { class: 'plate ctrl-plate' },
          sectionHead('01', 'KESEHATAN'),
          el(
            'div',
            { class: 'ctrl-hero' },
            el('div', { class: `ctrl-pulse ${ok ? 'is-ok' : 'is-bad'}` }, el('i'), el('i')),
            el(
              'div',
              {},
              el('div', { class: 'ctrl-hero__value', text: ok ? 'ONLINE' : latency === -1 ? 'TIDAK TERJANGKAU' : 'MENUNGGU' }),
              el('div', {
                class: 'ctrl-hero__sub',
                text: latency >= 0 ? `${latency} ms round-trip` : 'tidak ada respons',
              }),
            ),
            stateBadge(ok ? 'HEALTHY' : tone.toUpperCase(), tone),
          ),
          el(
            'div',
            { class: 'ctrl-kv' },
            kv('COMMIT', health?.commit ?? '—'),
            kv('BRANCH', health?.ref ?? '—'),
            kv('ENV', health?.env ?? '—'),
            kv('REGION', health?.region ?? '—'),
            kv('UPTIME', health ? `${Math.floor(health.uptimeSec / 60)} mnt` : '—'),
            kv('LAST PROBE', lastProbe ? new Date(lastProbe).toLocaleTimeString('id-ID') : '—'),
          ),
          el(
            'div',
            { class: 'ctrl-actions' },
            button(busy ? 'MENGUKUR…' : 'PING ULANG', {
              tone: 'primary',
              size: 'sm',
              icon: 'reset',
              onClick: () => void ping(),
            }),
            button('SALIN LAPORAN', {
              tone: 'ghost',
              size: 'sm',
              icon: 'copy',
              onClick: () => {
                const report = JSON.stringify({ health, latency, generatedAt: new Date().toISOString() }, null, 2);
                void navigator.clipboard?.writeText(report).then(
                  () => toast('Laporan disalin', 'ok', 1400),
                  () => toast('Clipboard diblokir browser', 'err', 1800),
                );
              },
            }),
          ),
        ),
        el(
          'div',
          { class: 'plate ctrl-plate' },
          sectionHead('02', 'DEPLOY'),
          el(
            'div',
            { class: 'ctrl-kv' },
            kv('VERSI APP', APP_VERSION),
            kv('BUNDLE', document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src.split('/').pop() ?? '—'),
            kv('SRI', `${document.querySelectorAll('[integrity]').length} aset ditandatangani`),
            kv('SERVICE WORKER', navigator.serviceWorker?.controller ? 'aktif' : 'belum aktif'),
            kv('PROTOKOL', location.protocol.replace(':', '')),
            kv('ORIGIN', location.host),
          ),
          el(
            'div',
            { class: 'ctrl-actions' },
            button('BUKA DI VERCEL', {
              tone: 'ghost',
              size: 'sm',
              onClick: () => window.open('https://vercel.com/sancorp/sancorp-x-aliongcorp', '_blank', 'noopener'),
            }),
            button('BUKA GITHUB ACTIONS', {
              tone: 'ghost',
              size: 'sm',
              onClick: () =>
                window.open('https://github.com/Sanycorp/Sancorp-X-Aliongcorp/actions', '_blank', 'noopener'),
            }),
          ),
        ),
      ),
    );
  }

  function renderSecurity(): void {
    const passing = headers.filter((h) => h.ok).length;
    body.append(
      el(
        'div',
        { class: 'grid grid--lab' },
        el(
          'div',
          { class: 'plate ctrl-plate' },
          el(
            'div',
            { class: 'row', style: 'align-items:center;gap:10px' },
            el('div', { style: 'flex:1;min-width:0' }, sectionHead('03', 'HEADER RESPONS')),
            stateBadge(`${passing}/${headers.length}`, passing === headers.length ? 'ok' : 'warn'),
          ),
          el(
            'div',
            { class: 'ctrl-checks' },
            ...headers.map((h) =>
              el(
                'div',
                { class: 'ctrl-check', dataset: { ok: String(h.ok) } },
                el('span', { class: 'ctrl-check__dot' }),
                el('b', { text: h.label }),
                el('span', { class: 'ctrl-check__value', text: h.value.slice(0, 46) + (h.value.length > 46 ? '…' : '') }),
              ),
            ),
          ),
          el(
            'div',
            { class: 'ctrl-actions' },
            button('PROBE HEADER', { tone: 'primary', size: 'sm', icon: 'bolt', onClick: () => void probeHeaders() }),
          ),
        ),
        el(
          'div',
          { class: 'plate ctrl-plate' },
          el(
            'div',
            { class: 'row', style: 'align-items:center;gap:10px' },
            el('div', { style: 'flex:1;min-width:0' }, sectionHead('04', 'CSP FEED')),
            stateBadge(cspError ? 'ERROR' : `${csp.length} LAPORAN`, cspError ? 'bad' : csp.length > 0 ? 'warn' : 'ok'),
          ),
          el('p', {
            class: 'lab-group__note',
            style: 'margin-top:0',
            text: 'Laporan pelanggaran CSP yang benar-benar diterima endpoint. Query string sudah dibuang server sebelum disimpan.',
          }),
          cspError
            ? el('p', { class: 'form-error', text: cspError })
            : csp.length === 0
              ? el('p', { class: 'ctrl-empty', text: 'Tidak ada pelanggaran. Itu hasil yang benar.' })
              : el(
                  'div',
                  { class: 'ctrl-feed' },
                  ...csp.slice(0, 12).map((entry) =>
                    el(
                      'div',
                      { class: 'ctrl-feed__row' },
                      el('b', { text: entry.directive }),
                      el('span', { text: entry.blocked || '(inline)' }),
                      el('time', { text: new Date(entry.at).toLocaleTimeString('id-ID') }),
                    ),
                  ),
                ),
          el(
            'div',
            { class: 'ctrl-actions' },
            button('MUAT ULANG FEED', { tone: 'ghost', size: 'sm', icon: 'reset', onClick: () => void loadCsp() }),
          ),
        ),
      ),
    );
  }

  function renderLicense(): void {
    body.append(
      el(
        'div',
        { class: 'grid grid--lab' },
        el(
          'div',
          { class: 'plate ctrl-plate' },
          sectionHead('05', 'GENERATOR LISENSI'),
          el('p', {
            class: 'lab-group__note',
            style: 'margin-top:0',
            text: 'Kunci ditandatangani HMAC-SHA256 oleh server. Tidak ada database: lisensi adalah string yang bisa diverifikasi sendiri, dan sesi adalah cookie httpOnly.',
          }),
          el(
            'div',
            { class: 'ctrl-form' },
            el(
              'div',
              { class: 'field' },
              el('span', { class: 'label', text: 'TIER' }),
              segmented(
                [
                  { value: 'pro', label: 'PRO' },
                  { value: 'admin', label: 'ADMIN' },
                ],
                genTier,
                (v) => {
                  genTier = v as 'pro' | 'admin';
                },
              ).wrap,
            ),
            el(
              'div',
              { class: 'field' },
              el('span', { class: 'label', text: 'MASA AKTIF' }),
              segmented(
                [
                  { value: '30', label: '30H' },
                  { value: '90', label: '90H' },
                  { value: '365', label: '1TH' },
                  { value: '3650', label: '10TH' },
                ],
                genDays,
                (v) => {
                  genDays = v;
                },
              ).wrap,
            ),
            el(
              'label',
              { class: 'field' },
              el('span', { class: 'label', text: 'JUMLAH (1–10)' }),
              el('input', {
                class: 'input',
                attrs: { type: 'number', min: 1, max: 10, value: genCount, 'aria-label': 'Jumlah kunci' },
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
            button('BUAT KUNCI', {
              tone: 'primary',
              size: 'sm',
              icon: 'bolt',
              onClick: () => void issue(),
            }),
            generated.length > 0
              ? button('SALIN SEMUA', {
                  tone: 'ghost',
                  size: 'sm',
                  icon: 'copy',
                  onClick: () => {
                    void navigator.clipboard
                      ?.writeText(generated.map((g) => g.key).join('\n'))
                      .then(() => toast('Semua kunci disalin', 'ok', 1400));
                  },
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
                      on: {
                        click: () => {
                          void navigator.clipboard
                            ?.writeText(g.key)
                            .then(() => toast('Kunci disalin', 'ok', 1200));
                        },
                      },
                    }),
                  ),
                ),
              )
            : el('p', { class: 'ctrl-empty', text: 'Belum ada kunci dibuat di sesi ini.' }),
        ),
        el(
          'div',
          { class: 'plate ctrl-plate' },
          sectionHead('06', 'SESI SAAT INI'),
          el(
            'div',
            { class: 'ctrl-kv' },
            kv('TIER', session.state.tier.toUpperCase()),
            kv('SUBJEK', session.state.subject ?? '—'),
            kv(
              'KEDALUWARSA',
              session.state.exp ? new Date(session.state.exp).toLocaleString('id-ID') : '—',
            ),
            kv('MODE', session.state.status === 'ready' ? 'server' : session.state.status),
            kv('ADMIN AKTIF', session.state.adminEnabled ? 'ya' : 'tidak'),
            kv('SECRET', session.state.devSecret ? 'DEV (ganti!)' : 'production'),
          ),
          el(
            'div',
            { class: 'ctrl-actions' },
            button('KELUAR', {
              tone: 'ghost',
              size: 'sm',
              onClick: () => {
                void session.signOut().then(() => {
                  toast('Sesi dihapus', 'info', 1500);
                  render();
                });
              },
            }),
            button('MUAT ULANG SESI', {
              tone: 'ghost',
              size: 'sm',
              icon: 'reset',
              onClick: () => void session.refresh().then(render),
            }),
          ),
        ),
      ),
    );
  }

  function kv(label: string, value: string): HTMLElement {
    return el('div', { class: 'ctrl-kv__row' }, el('span', { text: label }), el('b', { text: value }));
  }

  async function issue(): Promise<void> {
    const count = Math.min(10, Math.max(1, Number(genCount) || 1));
    try {
      const res = await fetch('/api/license', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tier: genTier, days: Number(genDays), count }),
      });
      if (!res.ok) {
        toast(res.status === 403 ? 'Sesi admin diperlukan' : `Gagal (${res.status})`, 'err', 2000);
        return;
      }
      const data = (await res.json()) as { keys: { key: string; tier: string; expires: string }[] };
      generated = [...data.keys, ...generated].slice(0, 20);
      toast(`${data.keys.length} kunci dibuat`, 'ok', 1800);
      render();
    } catch {
      toast('Server tidak terjangkau', 'err', 2000);
    }
  }

  // ------------------------------------------------------------------ gate
  function renderGate(): void {
    const adminInput = el('input', {
      class: 'input',
      attrs: { type: 'password', autocomplete: 'current-password', 'aria-label': 'Kata sandi admin' },
    });
    const error = el('p', { class: 'form-error', attrs: { role: 'alert' } });
    const submit = button('MASUK KONSOL', { tone: 'primary', block: true, icon: 'system' });

    const run = async (): Promise<void> => {
      if (!adminInput.value) {
        error.textContent = 'Masukkan kata sandi.';
        return;
      }
      submit.disabled = true;
      submit.textContent = 'MEMERIKSA…';
      const problem = await session.signInAdmin(adminInput.value);
      submit.disabled = false;
      submit.textContent = 'MASUK KONSOL';
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

    gate.append(
      el(
        'div',
        { class: 'plate ctrl-gate__card' },
        el('div', { class: 'screen__kicker', text: 'RESTRICTED' }),
        el('h2', { class: 'ctrl-gate__title', text: 'AKSES OPERATOR' }),
        el('p', {
          class: 'lab-group__note',
          text: session.state.adminEnabled
            ? 'Halaman ini tidak ditautkan dari navigasi. Masuk dengan kata sandi admin untuk membuka telemetri.'
            : 'Kata sandi admin belum disetel di server. Tambahkan AEGIS_ADMIN_PASSWORD lalu deploy ulang.',
        }),
        el('div', { class: 'field' }, el('span', { class: 'label', text: 'KATA SANDI' }), adminInput),
        error,
        submit,
        button('KEMBALI KE APLIKASI', {
          tone: 'ghost',
          block: true,
          onClick: () => {
            location.hash = '#/deck';
          },
        }),
      ),
    );
  }

  // ------------------------------------------------------------------ render
  function render(): void {
    const isAdmin = session.state.tier === 'admin';

    gate.replaceChildren();
    tabHost.replaceChildren();
    body.replaceChildren();

    if (!isAdmin) {
      renderGate();
      screen.dataset.gate = 'locked';
      return;
    }
    screen.dataset.gate = 'open';

    tabHost.append(
      segmented(
        [
          { value: 'status', label: 'STATUS' },
          { value: 'security', label: 'SECURITY' },
          { value: 'license', label: 'LISENSI' },
        ],
        section,
        (v) => {
          section = v as typeof section;
          render();
        },
      ).wrap,
    );

    if (section === 'status') renderStatus();
    else if (section === 'security') renderSecurity();
    else renderLicense();
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
        void probeHeaders();
      }
    },
    destroy: () => window.clearInterval(clock),
  };
}

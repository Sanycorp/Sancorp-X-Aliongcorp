# PROJECT HANDOFF — AEGIS SOUND LAB (Sanayacorp) v8.9.6

Dokumen ini untuk siapa pun (atau model berikutnya) yang melanjutkan repo ini. Ringkas, faktual, tanpa narasi sejarah Flutter.

## 1. Identitas

| | |
| --- | --- |
| Produk | Aegis Sound Lab |
| Perusahaan | Sanayacorp (logo & identitas induk) |
| Master ikon | `brand/aegis-music-icon.png` → `npm run icons` → `public/icons/*` + `store/icon-512.png` |
| Versi | 8.9.6 (`package.json` + `src/version.ts` → `APP_VERSION`, jangan duplikasi) |
| App ID | `com.eltzy.app` (`capacitor.config.ts`) |
| Basis | TypeScript 7.0.2 · Vite 8.3.4 · Vitest 5.0.5 |
| Native | Capacitor 8.5.3 (core/cli/android, app 8.1.2, filesystem 8.1.5, share 8.0.3, haptics 8.0.2, status-bar 8.0.4) |
| MP3 | `@breezystack/lamejs` 1.2.7 (dimuat dinamis, chunk `codec`) |
| Nama branch kerja | `arena/985911e3-sancorp-x-aliongcorp` |

## 2. Status

- `npx tsc --noEmit` → **clean**
- `npx vitest run` → **272 test lulus** (22 file; tambahan v8.9.6: adaptive 18, device 13, boot 1, boot-signed 1)
- `npx vite build` → **sukses**; `dist/` ~99 kB app + 163 kB codec + 36 kB CSS + 5 font
- `npm run dev` → bind `0.0.0.0:5173`, `allowedHosts: true` (aman untuk preview proxy)
- FLAC output didekode oleh FFmpeg 7.0.2 (bukan cuma parser sendiri)

## 3. Peta file

```
index.html                 # shell + boot splash (#boot, dimatikan dari main.ts)
vite.config.ts             # base './', allowedHosts, manualChunks lamejs, __APP_VERSION__
vitest.config.ts           # node env; ui.test.ts override ke jsdom
tsconfig.json              # strict, noUnusedLocals, bundler resolution
capacitor.config.ts        # appId, webDir dist, StatusBar/Share
public/
  manifest.webmanifest     # PWA, shortcuts, maskable icon
  sw.js                    # cache shell, versi aegis-sound-lab-v8.9.6
  icons/                   # hasil tools/make-icons.mjs (jangan edit manual)
brand/aegis-music-icon.png # master logo Sanayacorp (phoenix + perisai + S)
tools/brand-icon.mjs       # decode PNG zero-dep, framing, downscale, ikon set
tools/make-icons.mjs       # CLI: tulis public/icons + store + mipmap Android
.github/workflows/android.yml

src/
  main.ts                  # mount, router hash, tema, shortcut, SW, status bar
  dsp/
    buffer.ts   Stereo, clamp, dbToGain/gainToDb, slice/concat/silence/sanitize
    biquad.ts   designBiquad + class Biquad (DF1)
    resample.ts resampleByStep(step<1 = lebih lambat), resampleTo, timeStretch(WSOLA)
    fft.ts      FFT radix-2
    denoise.ts  spectralDenoise(input, amount), voiceFocus
    reverb.ts   SPACES, decaySeconds, tailSeconds, applyReverb (menambah tail)
    dynamics.ts saturate, widen, monoBass, deEss, fade, orbit8d
    limiter.ts  limit(input, ceil=-1.2, attack=5ms, release=140ms)
    loudness.ts integratedLoudness, loudnessRange, samplePeakDb, truePeakDb,
                measure, computeTrim, TARGET_LUFS
    engine.ts   creativeChain, render, renderWithTail, expectedSeconds, signature
  model/
    settings.ts  EditSettings/NEUTRAL/AppSettings/FORMAT_META/TARGET_META/SPACE_META
    presets.ts   PRESETS[14]
  io/
    audioFile.ts decodeAudioData → Stereo, peaks, formatter
    encode.ts    encodeWav, encodeFlac, encode(); MP3 via lamejs
    storage.ts   saveExport/shareExport (Capacitor FS/Share + web download), session
    player.ts    PreviewPlayer (AudioBufferSourceNode)
  state/
    store.ts        observabel + localStorage
    forge.ts        loadSource, renderPreview, forgeExport, shareLast, fingerprint
    renderClient.ts worker pool 1 job; fallback sinkron
    session.ts      tier dari /api/auth, fallback FREE saat offline
    ops.ts          ledger operator: tambah/perpanjang/cabut, filter, JSON/CSV
    rating.ts       penilaian bintang: clampNote, summarize, rankByTarget, trendOf,
                    RatingBook (perangkat) + RemoteRatings (cache kanal)
  model/
    contact.ts      Telegram t.me/ElTzyy8, kode pesanan AEG-XXXX
  api/ (root)
    _lib/auth.js    HMAC, cookie, rate limit, deny list, extendLicense
    _lib/revoked.js serial dicabut (ditulis tools/revoke.mjs)
    auth.js         GET/POST/DELETE sesi
    license.js      GET meja + POST issue/extend/inspect
    rating.js       GET agregat (publik) / daftar ulasan (admin), POST kiriman
    health.js, csp-report.js
  .github/workflows/revoke.yml  ubah deny list dari HP → commit → deploy
  workers/render.worker.ts
  version.ts      APP_VERSION tunggal
  ui/
    rating.ts     blok RATING di SYSTEM: bintang per aplikasi/preset, catatan,
                  kirim ke /api/rating, agregat publik
    brand.ts      brandMark() untuk header + brandPlate() untuk TENTANG,
                  SVG dibuat via createElementNS (aman Trusted Types)
    motion.ts     tween, animateValue, scramble, ripple, magnet, tilt, burst,
                  kineticTitle, installScrollChrome, installNavPulse (move/hide)
    elements.ts   el(), fader/toggle/segmented(locks)/select/button, toast
    account.ts    sheet akun + paywall, focus trap, accountButton()
    waveform.ts   canvas timeline + trim handles
    scope.ts      oscilloscope
    haptics.ts
    screens/      deck.ts, lab.ts, arsenal.ts, system.ts, control.ts (#/control)
  model/
    tiers.ts      PLANS free/pro/admin, ALL_PRESET_IDS, can/presetAllowed/
                  formatAllowed/targetAllowed, upgradeHint
  state/
  security/
    sanitize.ts   setHtml() + Trusted Types policy `aegis` (DOMPurify allowlist)
    posture.ts    pembacaan header/probe (dipakai konsol, bukan UI publik)
  styles/         base.css, primitives.css, controls.css, app.css, motion.css,
                  security.css, account.css, rating.css, control.css
                  (token fluid, breakpoint 360/720/900/1080/1440, landscape,
                   safe-area, container query, view transition, scroll-driven,
                   kinetic/reveal/ripple/tilt/spark, reduced-motion kill sheet)
  assets/fonts/   Chakra Petch ×4, Share Tech Mono + OFL
```

## 4. Invarian UI (v8.1)

1. Tidak ada `width: 100vw` — pakai `100%` + padding gutter. Dijaga `tests/responsive.test.ts`.
2. Semua padding layar memakai `max(var(--gutter), var(--safe-left/right))`.
3. Target sentuh utama ≥ 44 px (`.btn`, `.toggle`, `.nav__btn`).
4. Hover hanya di `@media (hover: hover) and (pointer: fine)`.
5. Reveal-on-scroll harus selalu punya fallback `is-in` (sudah di `setupReveal`).
6. Dock hanya tampil pada `[data-route='deck']` dan disembunyikan ≥900 px.
7. `finish: 'auto'` wajib lewat `resolveFinish()`; jangan baca `settings.finish` mentah untuk warna.
8. Semua animasi baru harus punya pasangan di kill-sheet `motion.css` (`prefers-reduced-motion` + `[data-motion='reduced']`).
9. Animasi re-trigger hanya dari perubahan state nyata. Deck meng-cache tag/pipeline DOM (`lastTagSig`, `lastPipeSig`) supaya `store.emit()` tidak memutar ulang animasi.
10. `tween()` meng-anchor timeline di frame pertama; jangan pakai `performance.now()` sebagai start (rAF punya clock sendiri, dan jsdom berbeda).
11. **Jangan pernah** menulis `element.innerHTML = ...` langsung. Pakai `setHtml()` dari `src/security/sanitize.ts`; CSP produksi menegakkan `require-trusted-types-for 'script'`, jadi assignment langsung akan gagal (fail closed).
12. **Jangan menambah inline `<style>` atau atribut `style=`** di HTML. `style-src 'self'` aktif; styling dinamis lewat CSSOM (`node.style.cssText`, `Object.assign(node.style, …)`).
13. `npm run build` = `tsc --noEmit && vite build && node tools/sri.mjs`. SRI menghasilkan 3 tag bertanda tangan; kalau tool gagal menemukan aset, build gagal (disengaja).
14. Header keamanan hidup di `vercel.json` dan diuji statis oleh `tests/security.test.ts` — ubah keduanya bersamaan.
15. `vercel.json` memakai `rewrites` SPA `/((?!api/).*)`; jangan tambahkan rewrite yang menelan `/api/*`.
16. **Panel/indikator keamanan tidak boleh kembali ke UI publik.** Postur web hanya hidup di `#/control` (tab SECURITY), dan hanya untuk sesi `admin`.
17. Gating tier selalu lewat `src/model/tiers.ts`. Jangan menulis `if (tier === 'pro')` tersebar; pakai `can()` / `presetAllowed()` / `formatAllowed()` / `targetAllowed()`.
18. Setiap kontrol yang bisa dikunci harus memanggil `openPaywall()` alih-alih diam-diam gagal.
19. Konsol `#/control` tidak didaftarkan di `ROUTES` — hanya di `HIDDEN_ROUTES` (`ALL_ROUTE_IDS`). Tanpa tombol nav.
20. `session.refresh()` yang gagal **wajib** jatuh ke `free`, bukan mempertahankan tier terakhir (uang tidak boleh hilang karena jaringan).
21. Saat tier turun, `applyTierLimits()` di `main.ts` mematikan 8D/denoise/voiceMode dan mengembalikan format/target yang tidak sah — **hanya ketika `session.state.status === 'ready'`** (jangan hapus setelan user gara-gara jaringan putus).
22. Blok sesi di `main.ts` harus berada di level `boot()`, **bukan di dalam `store.subscribe()`**. Regresi ini pernah terjadi: `/api/auth` tidak pernah dipanggil dan konsol selalu bilang "kata sandi belum disetel". `tests/ui.test.ts` menjaga dengan memeriksa panggilan `/api/auth` saat boot.

## 5. Invarian DSP yang tidak boleh dilanggar

1. **Satu pipeline** untuk preview dan export (`engine.render`). Jangan bikin jalur kedua.
2. **Tidak ada loudnorm dinamis.** Hanya satu gain statis + limiter. Test "12 dB gap" menjaga ini.
3. **Limiter selalu terakhir**, ceiling −1.2 dBTP, deteksi 4× Catmull (sama dengan meter).
4. **Fade before reverb** supaya ekor reverb tidak ikut terpotong.
5. **Output selalu stereo 48 kHz.**
6. **Tidak ada upload.** Audio tidak pernah dikirim. Satu-satunya `fetch` adalah `/api/auth` (sesi) dan, di konsol, `/api/health`, `/api/license`, `/api/csp-report`. Tidak ada SDK analitik, tidak ada font eksternal.
7. **Harga dan kanal jual ada di satu tempat:** `PRO_PRICE`/`PRO_PASS_DAYS` di `src/model/tiers.ts`, Telegram di `src/model/contact.ts`. Jangan menulis "Rp 5.000" lepas di komponen.
7. **Clamp** selalu dari `buffer.ts`, jangan `Math.min/max` manual di DSP.
8. `resampleByStep(step)` — `step < 1` = **lebih lambat/lebih panjang/pitch turun**. Jangan dibalik.
9. FLAC = verbatim 24-bit. Jika nanti diganti encoder terkompresi, perbarui README + test parser.

## 6. Alur render

```
loadSource(file)
  decodeAudioData → Stereo + peaks → store.setSource

preview (tombol play)
  potong window 24 s (trim-aware) → renderOffThread → PreviewPlayer.load → play

export (tombol FORGE)
  renderOffThread(audio penuh, edit, source)
    → encode(format) → saveExport → history → report card
```

Worker mengembalikan buffer hasil dengan transfer; `renderClient` mempertahankan satu worker dan antrean per-id.

## 7. Tes: apa yang dijaga

- **dsp.test.ts** — kalibrasi BS.1770 (997 Hz @ −20 dBFS = −23.0 ±0.1), true peak vs sample peak, limiter ≤ −1.1 dBTP, panjang & pitch resample/WSOLA, respons filter, RT60, 8D level, mono bass, fade, denoise −3 dB.
- **engine.test.ts** — target loudness semua preset ±1.2 LU, gap dinamis 12 dB bertahan, trim, speed, tail reverb nyata, fingerprint, semua target (podcast/streaming/loud) ±0.7, klaim −9 pada materi low-crest.
- **encode.test.ts** — header WAV 16/24/32f, LIST/INFO, round-trip sample, parser FLAC (CRC8/CRC16 + PCM identik), MP3 frame sync.
- **ui.test.ts** — boot jsdom, 4 layar, 14 chip/preset, routing, apply preset, fader, theme toggle, forge tanpa source tidak crash, persist localStorage.
- **responsive.test.ts** — audit statis CSS: clamp, breakpoint, safe-area, larangan 100vw, target ≥44 px, hover gating, reduced motion, dock, view transition.
- **ui.test.ts** — boot jsdom, 4 layar, 14 chip/preset, routing, preset, fader, siklus tema auto→armor→cockpit, dock + meter + skeleton, persistensi.
- **security.test.ts** — header Vercel (CSP/TT/HSTS/COOP/COEP/Permissions/SRI), guard service worker, `security.txt`, endpoint CSP report (405/415/400/204 + redaksi query string), sanitizer (buang script/onerror/javascript:), pembaca posture.
- **motion.test.ts** — tween selesai + `onDone`, retarget `animateValue`, decode `scramble`, ripple muncul/hilang, `kineticTitle` tidak double-wrap, spark canvas tunggal, dan semua jalur instan saat Reduce Motion.
- **probe.test.ts** — angka referensi (bukan assertion ketat) untuk debugging.
- **auth.test.ts** — 18 tes: round-trip kunci, tanda tangan diubah, tier diubah, kedaluwarsa, perpanjangan (serial tetap, kunci mati bisa dihidupkan), pencabutan sesi, cookie, rate limit.
- **ops.test.ts** — 8 tes ledger: parsing kunci, dedupe serial, perpanjangan, filter status, nilai pass, ekspor/impor JSON+CSV.
- **control.test.ts** — 3 tes konsol: terkunci tanpa sesi, lima tab (LIVE/AKUN/RATING/TERBIT/KEAMANAN) + copy meja lisensi, offline tidak pernah memberi tier.
- **brand.test.ts** — 12 tes identitas: round-trip PNG, semua ukuran ikon ada, field datar di sudut, safe area maskable, tinta seal benar-benar ada, manifest menamai produk dan ikonnya ada, `brandMark()` punya nama aksesibel dan id gradien unik per instance.
- **rating.test.ts** — 14 tes penilaian: pembulatan/clamp bintang, pembersihan catatan (tautan & kendali), ringkasan distribusi, peringkat preset, tren 7 hari, satu suara per target, id perangkat stabil, dedupe remote, ekspor JSON.

## 8. Yang belum ada / kandidat lanjutan

- Encoder FLAC terkompresi (sekarang verbatim; file besar).
- Waveform rendering berbasis worker untuk file >20 menit (saat ini envelope 480 bucket, aman).
- iOS project (`npx cap add ios`) — butuh macOS untuk build; config sudah siap.
- Splash screen native (sekarang memakai boot splash web + background Capacitor).
- Riwayat export menyimpan metadata saja, bukan file audio (file ada di Documents/Downloads).
- Belum ada preset cloud/import-export JSON; `EditSettings` sudah serializable kalau mau ditambah.
- Ledger operator belum disinkron antar perangkat (ekspor/impor manual). Kalau nanti butuh multi-operator, baru pertimbangkan KV.
- Belum ada webhook pembayaran; pencocokan pembayaran masih manual lewat kode pesanan Telegram.

## 9. Cara verifikasi ulang cepat

```bash
npm ci
npm run typecheck
npm test
npm run build
npx vite preview --host 0.0.0.0   # cek dist
```

Untuk memastikan FLAC valid di luar test:

```bash
node -e "..." # lihat tools/make-icons.mjs sebagai contoh zero-dep node script
ffmpeg -v error -i hasil.flac -f null -
```

## 10. Aturan commit

- Branch kerja: `arena/985911e3-sancorp-x-aliongcorp`
- Commit message gaya `v8: <area> — <ringkasan>`
- Jangan commit `node_modules/`, `dist/`, `android/` hasil generate, atau file audio besar.

## 11. Deployment web (Vercel) — LIVE

| Hal | Nilai |
| --- | --- |
| **URL produksi** | **https://sanayacorp-aegismusic.vercel.app** |
| Alias lama | `sancorp-x-aliongcorp.vercel.app` — **dicabut 2026-10-20** lewat `remove_project_domain`; sekarang menjawab `404 DEPLOYMENT_NOT_FOUND`. Jangan dipasang ulang kecuali memang diminta |
| Project | `sanayacorp-aegismusic` · `prj_ccvhzBXmu7JK4rVcqkgTGJqucUBj` (nama project diganti 2026-10-20; ID tetap) |
| Team | `SANCORP` · `team_AWY0rnVWqjWBuD5zU7odihmb` (Hobby) |
| Framework | vite · `npm ci` · `npm run build` · output `dist` · region `sin1` |
| Deployment aktif | `dpl_25szhMPFH2NrNkFzy3R2kwtf4iHo` (commit `7f457a0`, v8.9.6) — `READY`/`PROMOTED`, satu-satunya domain project: `sanayacorp-aegismusic.vercel.app`; `/api/health` → `commit:"7f457a0"`, `/api/auth` → `{"signedIn":false,"lic":null,"adminEnabled":true,"google":true}` |
| Protection | **mati** (`ssoProtection: null`) |
| Prober | workflow `.github/workflows/probe.yml` + `tools/probe-prod.mjs` (tanpa secret) |

### Verifikasi produksi (workflow `probe`, hijau)

`node tools/probe-prod.mjs` memeriksa hal-hal yang hanya bisa dijawab produksi:

0. tunggu `/api/health` melaporkan sha commit yang baru di-push (bukan build sebelumnya)
1. root 200 + CSP `default-src 'none'`, `script-src 'self'`, Trusted Types, `frame-ancestors 'none'`
2. HSTS preload, COOP, COEP, XCTO, Referrer, Permissions-Policy
3. SRI sha-384 pada 3 aset masuk, `Cache-Control: immutable` untuk `/assets`
4. versi yang diharapkan dibaca dari `package.json` (bukan di-hardcode), cocok dengan literal di bundle
5. bundle memuat `AKSES OPERATOR` + `AEGIS OPS`, `DAFTAR AKUN`, `AKTIFKAN PRO`, `ElTzyy8`, `Rp 5.000`, dan copy paywall
6. `/api/health` 200 + `env: production` + commit sha
7. `/api/auth` → `tier: free`, **`devSecret: false`** (AEGIS_SECRET terpasang), **`adminEnabled: true`** (AEGIS_ADMIN_PASSWORD terpasang)
8. `/api/license` (GET meja & POST terbit) dan `GET /api/csp-report` menolak anonim (403), kunci palsu ditolak (401) tanpa Set-Cookie
9. `/api/rating` menjawab `summary` untuk anonim **tanpa** field `ratings` (teks ulasan hanya untuk sesi operator)

Catatan operasional: `probe` punya dua lapis penyaring. Lapis pertama `paths:` di trigger; lapis kedua langkah **gate** yang men-diff rentang push dan hanya menilai kalau `src/`, `api/`, `public/`, `index.html`, `vercel.json`, atau `package*.json` ikut berubah. Push dokumen/CI jadi no-op yang tetap hijau, bukan timeout empat menit. Deploy tetap manual lewat connector, jadi setelah push yang menyentuh build, buat deployment sebelum probe kehabisan waktu tunggu (4 menit). Kegagalan membuka/comment issue berlabel `monitor`. `tools/probe-prod.mjs` ikut dinilai, supaya perubahan pada probe sendiri tidak lolos tanpa diuji ke produksi. Kalau `entry bundle served` gagal padahal `/api/health` sudah melaporkan sha baru, itu race promosi HTML: probe sekarang mengambil ulang halaman dengan cache-buster sebelum menyimpulkan build hilang. Langkah tunggu juga mengenali commit yang **tersusul**: kalau sha yang di-push sudah menjadi nenek moyang commit yang live (`git merge-base --is-ancestor`), run selesai hijau tanpa menilai apa pun — dulu push yang tidak pernah di-deploy membuat probe menunggu empat menit lalu merah.

Kirim kegagalan sebagai annotation (`::error`) supaya tetap terbaca lewat API check-runs. Probe run terakhir: `39396855403` (push `5c39de9`) — **success**, 18/18 pemeriksaan, hanya annotation `warning` (Node 20) dan `notice` (runner Ubuntu)
walaupun log job tidak bisa diunduh dari sandbox.

### Riwayat blocker (sudah selesai)

- ~~Deployment Protection `all_except_custom_domains`~~ → dimatikan pemilik akun, `ssoProtection: null`.
- ~~GitHub Login Connection belum terpasang~~ → ternyata deploy berbasis git tetap jalan lewat `git_source`; deployment pertama gagal karena protection, bukan karena repo.
- Deploy yang tersisa: **satu**, `dpl_25szhMPFH2NrNkFzy3R2kwtf4iHo` (`7f457a0`, v8.9.6 — adaptif per perangkat, akun wajib, satu kunci satu perangkat). `/api/health` → `commit:"7f457a0"`; `/api/auth` → `"google":true`; `/api/auth/google/callback` → 302 `/?masuk=gagal` tanpa `state`. `/api/auth` → `"google":true`; `GET /api/auth?google=start` diteruskan ke `accounts.google.com` dengan `redirect_uri=https://sanayacorp-aegismusic.vercel.app/api/auth/google/callback`. **Env baru hanya terbaca deployment baru** — menyimpan `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` tanpa deploy ulang menyisakan `"google":false`. 19 deployment lama dihapus 2026-10-20 atas permintaan pemilik, jadi URL per-deployment yang beredar (`sancorp-x-aliongcorp-*.vercel.app`, `sanayacorp-aegismusic-*.vercel.app`) sekarang menjawab `404 DEPLOYMENT_NOT_FOUND`.
- Riwayat rilis tetap terbaca dari git, bukan dari Vercel: `07e09e4` (ikon + brand Sanayacorp), `9067373` (probe race), `f76335d` (rating), `a0200c3` (a11y), `cedbdee` (v8.6.0 pass 30 hari), `5457339` (probe per-sha), `5c39de9` (shortcut OPS), `54aebc5` (rename 8.9.0), `c3ce769`, `8dc378f`, `f984f5e`.
- Karena hanya satu deployment tersisa, **tidak ada sasaran rollback** di Vercel. Rollback berarti push ulang commit lama lalu buat deployment baru.

### Cara deploy berikutnya

```bash
# via connector / CLI
vercel --prod
# atau dari sesi: create_deployment dengan git_source JSON string
#   {"type":"github","ref":"arena/985911e3-sancorp-x-aliongcorp","repoId":1426487883}
```

Verifikasi selalu lewat job `probe` (target dari `.vercel-url`); jangan mengandalkan curl lokal — sandbox ini tidak bisa membuka TLS ke `*.vercel.app`.

### Catatan

- Tim `aegis-m-eltzy` (`team_MWFOZvHuvKThmyhWF8a2LqpP`) dibuat saat uji coba lepas dari default protection. Token connector tidak berizin menghapusnya — silakan hapus manual di dashboard, tidak dipakai.
- Satu project hanya boleh punya satu domain produksi. Domain yang pernah dipakai harus dicabut (`remove_project_domain`); kalau dibiarkan, aplikasi bisa dipasang sebagai PWA di origin lama dan menyimpan sesi serta ledger terpisah yang membingungkan operator.
- Lima fungsi serverless: `auth`, `license`, `health`, `csp-report`, `rating`. Semuanya berbagi `api/_lib/auth.js`. Kalau feed CSP membanjir, itu tanda ada aset yang melanggar direktif.
- Pencabutan: `api/_lib/revoked.js` dibaca setiap `readSession`, jadi sesi mati pada permintaan berikutnya setelah deploy. Untuk darurat tanpa deploy, isi `AEGIS_REVOKED` (dipisah koma) — nilainya dibaca saat cold start.
- `license.js` sekarang punya tiga operasi: `issue`, `extend` (serial tetap), `inspect` (validitas kunci tanpa membocorkan rahasia). `GET` hanya mengembalikan jumlah serial dicabut, bukan daftarnya.

## 12. Kanal penilaian (v8.7.0)

Bintang disimpan di perangkat lebih dulu (`aegis.rating.v1`), lalu dikirim lewat
`POST /api/rating`. Server tidak punya database, jadi kiriman diteruskan menjadi
**issue GitHub** di repo ini dengan judul `[RATING] ★★★★☆ <target>` dan satu baris
JSON di badan issue. Nol akun baru, nol tagihan, bisa diaudit di git.

| | |
| --- | --- |
| Target | `app` atau id preset (`night-shift`, `mecha-protocol`, …) |
| Satu suara | id = `<target>:<device>`; menilai ulang menimpa, bukan menambah |
| Pembersihan | catatan ≤140 karakter, tautan & karakter kendali dibuang |
| Batas | 6 kiriman / 10 menit per IP (per instance), 429 + `Retry-After: 600` |
| Baca publik | `GET /api/rating` → `{summary}` saja (rata-rata, distribusi, positif) |
| Baca operator | sesi admin → ikut `ratings[]` berisi catatan ulasan |
| Cache | 30 detik per instance; konsol punya cache lokal `aegis.rating.remote.v1` |

Mengaktifkan kanal tulis (opsional, tanpa ini rating tetap tersimpan di perangkat
dan endpoint menjawab `202 {sink:false, stored:false}`):

1. Buat fine-grained PAT dengan izin **Issues: read & write** untuk repo ini.
2. Tambahkan env Vercel `AEGIS_FEEDBACK_TOKEN` = token tersebut.
3. Opsional `AEGIS_FEEDBACK_REPO` bila repo dipindah (default `Sanycorp/Sancorp-X-Aliongcorp`).

Konsol: tab **RATING** (04) menampilkan rata-rata, distribusi 1–5, tren tujuh
hari, peringkat preset, dan dua belas ulasan terbaru. Tombol MUAT ULANG menarik
ulang kanal; angka tetap tampil dari cache saat jaringan mati.

Yang **tidak** dikirim: audio, nama file, kunci lisensi, tier, atau isi riwayat
export. Kalimat privasi di blok RATING menyebutkan ini secara eksplisit.

## 12e. Satu keputusan output (v8.9.5)

**Gejala.** Di SYSTEM pengguna memilih WAV, di DECK yang tampil MP3; atau
sebaliknya, deck menandai WAV 24 (yang terkunci) sementara SYSTEM menyimpan
pilihan lain. Pada sesi FREE hal yang sama bisa berujung ekspor FLAC.

**Sebab.** Format, bitrate, dan target disimpan **dua kali**: `store.settings`
(diedit layar SYSTEM) dan `store.edit` (yang dibaca encoder di `forge.ts`).
Keduanya ditulis terpisah oleh dua layar, dan `clampForTier()` hanya memangkas
`settings`. Jadi setelah downgrade, gerbang ekspor memeriksa `settings` yang
sudah jadi MP3 sementara encoder memakai `edit` yang masih FLAC. Target loudness
tidak punya gerbang sama sekali di jalur render, dan chip deck hanya tiga
(`mp3/wav24/flac`) sehingga WAV 16 digambar sebagai WAV 24.

**Perbaikan.**

- `store.setOutput({format?, bitrate?, target?})` adalah **satu-satunya penulis**
  untuk keputusan output: kedua salinan diubah dalam satu transaksi.
- `store.clampToTier(tier)` memangkas chain, keputusan output, **dan kedua slot
  A/B** dalam satu lintasan. Dipanggil saat sesi berubah (`main.ts`), saat preset
  dipakai, saat slot dipanggil ulang, dan sekali lagi tepat sebelum encoder
  (`forge.ts`).
- `clampForTier()` kini menulis ke `settings` **dan** `edit`; nilai terlarang
  jatuh ke `mp3` / `streaming`, bukan dibiarkan.
- `formatChoices(tier)` dan `targetChoices(tier)` menjadi satu daftar untuk deck
  dan SYSTEM. Deck menampilkan lima format yang sama, tanpa pemetaan diam-diam.
- `select()` mendapat semantik kunci yang sama dengan `segmented()`: opsi PRO
  tetap terlihat dan diberi label `· PRO`, tetapi memilihnya membuka paywall dan
  nilai lama dipulihkan — tidak pernah tersimpan.
- Gerbang render membaca `store.edit` (field yang dipakai encoder), bukan
  `settings`. Ditambah `targetBlocked()` dan satu `exportBlocked()` untuk kedua
  tombol FORGE (plate dan dock).
- `store.recallSlot()` tidak lagi memulihkan format/target dari slot: A/B
  membandingkan chain, bukan keputusan pengiriman.
- `store.restore()` menyelaraskan kedua salinan dan memvalidasi `settings`
  (format/target/finish/bitrate) seperti `edit`, jadi data lokal lama atau rusak
  tidak bisa menghasilkan label `undefined`.
- Bitrate hanya ditampilkan sebagai bagian dari MP3; pada WAV/FLAC barisnya
  diredupkan dan catatan menyebut bitrate tidak berlaku.

**Invarian yang dijaga tes.** `settings.format === edit.format`,
`settings.target === edit.target`, `settings.bitrate === edit.bitrate` setiap
saat; `mayRender('free', …)` menolak flac/wav24/wav32, target −16/−11/−9, 8D,
denoise, voice focus, dan preset non-gratis; `tests/tier-output.test.ts` (16 tes)
dan tiga tes di `tests/ui.test.ts` mengunci perilaku ini dari sisi model maupun
dari DOM yang benar-benar dirender.

## 12d. Masuk dengan Google & pagar tier (v8.9.4)

**Login pertama.** `src/ui/gate.ts` membuka satu layar saat kunjungan pertama
(bendera `aegis.gate.seen`): tombol Google, kotak **Ingat saya di perangkat ini**,
"Punya kunci PRO?", dan "Lanjut tanpa akun". Tidak ada yang dipaksa.

**Google.** Alur authorization-code lewat redirect, bukan Google Identity
Services — CSP `script-src 'self'` tidak dilonggarkan, tidak ada skrip pihak
ketiga, dan penukaran token terjadi di server.
`GET /api/auth?google=start&remember=1` → `accounts.google.com` →
`GET /api/auth/google/callback` → cookie sesi + redirect `/?masuk=ok`.
Path callback itu di-rewrite `vercel.json` ke `/api/auth?google=callback`, jadi
redirect URI yang didaftarkan di Google adalah path bersih (Google membandingkan
URI karakter per karakter).
`state` adalah nonce bertanda tangan HMAC, berlaku 10 menit, tanpa tabel sesi.
Env yang dibutuhkan: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan redirect URI
`https://sanayacorp-aegismusic.vercel.app/api/auth/google/callback`. Langkah
pembuatan client, nilai yang disalin, dan tabel kegagalan ada di `GOOGLE-OAUTH.md`.

**Premium per email.** Grant = `email:YYYYMMDD:HMAC(email|YYYYMMDD)`. Operator
membuatnya di `#/control → AKUN → AKUN GOOGLE` (tombol BERI PREMIUM), lalu
menempelkannya ke `AEGIS_PREMIUM` (dipisah koma) dan deploy ulang. Alamat tanpa
tanda tangan tidak memberi apa pun. Cabut = masukkan email ke `AEGIS_REVOKED`.
`GET /api/auth` membaca grant ulang pada setiap permintaan, jadi pemberian dan
pencabutan berlaku pada permintaan berikutnya, bukan saat sesi kedaluwarsa.

**Tiga bug yang diperbaiki**

1. *Aplikasi macet, tidak bisa diklik.* `.sheet-scrim` punya `display:grid` yang
   mengalahkan `[hidden]` dari UA, jadi scrim transparan menutupi seluruh layar
   setelah sheet akun ditutup. Sekarang `[hidden]{display:none}` dan
   `pointer-events:none` sampai `.is-open`. Timer tutup juga diberi token supaya
   sheet yang dibuka ulang tidak disembunyikan oleh timer lama.
2. *PRO tiba-tiba jadi FREE.* Blok `catch` di `session.load()` menulis
   `tier:'free'`. Sekarang jawaban terakhir server disimpan dan dipakai saat
   jaringan gagal (`status:'offline'`), dengan satu percobaan ulang 8 detik.
   Satu permintaan yang gagal tidak lagi mencabut akses yang sudah dibayar.
3. *FREE memakai fitur PRO.* `src/model/entitlements.ts` menegakkan aturan di
   tiga pintu: boot/perubahan sesi (`main.ts`), tombol FORGE (preset dan format
   diperiksa sebelum render), dan matriks `PLANS` sebagai satu-satunya sumber
   daftar preset/format.

## 12c. ID akun premium (v8.9.3)

Serial di dalam kunci lisensi **adalah** id akun: dipakai ledger, dipertahankan
saat perpanjangan, dan jadi sasaran pencabutan. Karena tidak ada database untuk
mengecek duplikat, id itu harus unik dengan sendirinya.

| | v8.9.2 | v8.9.3 |
| --- | --- | --- |
| Sumber acak | `Math.random()` | `crypto.randomBytes()` |
| Panjang | 4 simbol (36⁴ ≈ 1,7 jt) | **10 simbol (2⁵⁰ ≈ 1,1 kuadriliun)** |
| Alfabet | A–Z + 2–9 | A–Z tanpa I/L/O + 2–9 (tanpa 0/1) |
| Bentuk | `AEGIS-PRO-AB12-20301231-ZWVX26` | `AEGIS-PRO-7QK4M2XP9T-20301231-ZWVX26` |

32 simbol membagi 256 dengan pas, jadi `byte % 32` tidak berbias. Kunci lama
dengan serial 4 simbol tetap diterima (`verifyLicense` menerima keduanya) —
pelanggan yang sudah bayar tidak boleh terkunci oleh naiknya format.

`DAFTAR AKUN` mendapat tombol **BUAT AKUN PRO**: satu ketuk menerbitkan pass 30
hari, menamai akun `USER-<4 simbol pertama>`, memasukkannya ke ledger, dan
menyalin kunci ke clipboard. Tidak ada yang diketik.

## 12b. Kunci operator (v8.9.2)

Konsol `#/control` tidak lagi memakai kata sandi yang diketik orang. Kuncinya
dibuat mesin: **120 bit acak** dalam Crockford base32, `AEGIS-XXXXXX-XXXXXX-XXXXXX-XXXXXX`
(24 simbol, alfabet tanpa I/L/O/U). Disimpan hanya di `AEGIS_ADMIN_PASSWORD`
(Vercel, encrypted, semua environment) — tidak pernah ada di repo, di bundel,
atau di localStorage.

Tiga cara masuk, semuanya tanpa mengetik:

1. **Tautan sekali klik** `https://sanayacorp-aegismusic.vercel.app/#/control?op=<kunci>`.
   Aplikasi membaca fragmen, langsung `POST /api/auth`, lalu menghapus kunci dari
   address bar dengan `history.replaceState` (bukan `pushState` — tidak ada sisa
   di back stack). Fragmen `#` tidak pernah dikirim ke server, dan
   `Referrer-Policy: no-referrer` menutup kebocoran lewat header.
2. **Tempel di gerbang** — event `paste` langsung mengirim; tanpa tombol, tanpa
   izin clipboard.
3. Mengetik, kalau tautannya hilang.

Server membandingkan lewat `adminPasswordMatches()`: trim + bandingkan
case-insensitive, tetap `timingSafeEqual`. Sesi 30 hari di cookie httpOnly, jadi
satu klik cukup sampai kuartal berikutnya.

Rotasi: ganti `AEGIS_ADMIN_PASSWORD` di Vercel lalu deploy ulang. Kunci lama
langsung mati; tidak ada data lain yang perlu dibersihkan.

## 13. Identitas merek (v8.9.0 → v8.9.1)

Logo perusahaan hidup di **chrome web**, bukan sebagai gambar di dalam halaman:

| Tempat | Berkas |
| --- | --- |
| Tab browser | `public/icons/seal.svg` (vektor, `rel="icon"` + `mask-icon`) |
| Ikon install | `public/icons/icon-192/512/maskable-512.png` |
| Header | `brandMark()` di `src/ui/brand.ts`, 26–32 px, ikut finish |
| Preview tautan | `og:image` / `twitter:image` → `/icons/icon-512.png` |

Probe produksi sekarang ikut memeriksa ikon vektor (`vector tab icon served`) dan memastikan kelas `brand-block` tidak kembali ke bundel.

Blok logo 64 px di TENTANG beserta `brandPlate()` dan CSS `.brand-block` sudah
dihapus pada v8.9.1; TENTANG tetap menyebut perusahaan lewat `infoCell('PERUSAHAAN', 'SANAYACORP')`.


| | |
| --- | --- |
| Perusahaan | **Sanayacorp** — pemilik logo (phoenix, perisai, huruf S, jalur sirkuit, pita holografik) |
| Produk | **Aegis Sound Lab** — aplikasi forge audio web/PWA |
| Master | `brand/aegis-music-icon.png` (1600², RGB) |
| Turunan | `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `favicon-64.png`, `store/icon-512.png`, mipmap Android bila `android/` ada |
| Perintah | `npm run icons` |

Pipeline sengaja tanpa dependensi gambar: `tools/brand-icon.mjs` men-decode PNG
sendiri (filter 0–4, 8-bit RGB/RGBA), memotong ke kotak isi dengan warna kertas
hasil sampling sudut, lalu menyeragamkan latar ke `#e8ecf3` (sama dengan
`theme_color`) supaya grain kertas bawaan gambar AI hilang dan ikon tetap ringan
— `icon-512.png` turun dari 196 kB ke ±118 kB tanpa kehilangan ketajaman.

Di dalam aplikasi, logo dipakai dua kali sebagai vektor, bukan PNG:
`brandMark()` (30 px, header) dan `brandPlate()` (64 px, SYSTEM → TENTANG).
Vektor dipilih karena ikut berganti warna di finish cockpit dan tetap tajam di
layar 3×. Setiap instance punya id gradien sendiri supaya dua pemakaian dalam
satu halaman tidak saling menimpa.

Penamaan (v8.9.0): wordmark header = **AEGIS SOUND LAB** (produk di atas),
sub-lini = **SANAYACORP 8.9.x** (perusahaan), kicker layar = *AEGIS SOUND LAB / …*,
judul dokumen = `Aegis Sound Lab · <LAYAR>`, manifest = `Aegis Sound Lab —
Sanayacorp` dengan `short_name` **Aegis Sound** (peluncur memotong label di
sekitar 12 karakter, jadi nama pendek dipakai khusus untuk ikon).

Ikon **tidak** memuat teks, jadi mengganti nama tidak memerlukan gambar baru.
Kalau nama berubah lagi, cukup `grep -ri "Aegis Sound Lab"` dan ganti; tidak ada
jalur render yang membakar nama ke dalam PNG.

## 12f. Adaptif per perangkat, akun wajib, satu kunci satu perangkat (v8.9.6)

**Tujuan.** Satu bundel yang sama harus terasa dibuat untuk perangkat yang sedang
dipakai: PC 27", laptop 14", tablet, dan HP dengan OS berbeda. Tidak ada pemilih
mode manual — semuanya dibaca dari browser saat boot.

### Deteksi (`src/model/platform.ts`)

| Fakta | Sumber | Ditulis ke |
| --- | --- | --- |
| Bentuk | `maxTouchPoints`, `userAgentData.mobile`, lebar viewport | `html[data-form="phone|tablet|desktop"]` |
| OS | UA + `userAgentData.platform`; iPadOS dikenali dari `maxTouchPoints > 1` walau UA-nya "Macintosh" | `html[data-os]` |
| Mesin | Blink / WebKit / Gecko | `html[data-engine]` |
| Input | sentuh atau mouse | `html[data-input]` |
| Performa | `saveData`, `hardwareConcurrency ≤ 4`, `deviceMemory ≤ 4` → `lite` | `html[data-perf]` |
| Kapabilitas | audio, worker, share, file picker, `dvh`, backdrop-filter | `html[data-no-*]` |

`bootPlatform()` dipanggil sebelum layar dibangun, jadi paint pertama sudah benar.
Resize hanya mengevaluasi ulang bentuk perangkat (debounce 180 ms), bukan OS.

**`data-perf="lite"` tidak pernah menurunkan kualitas audio.** Yang dimatikan:
`backdrop-filter`, lapisan aurora/grain, bayangan besar, animasi masuk layar, dan
efek magnet/tilt. DSP berjalan di jalur yang sama persis.

### CSS (`src/styles/adaptive.css`, diimpor dari `main.ts`)

- `-webkit-text-size-adjust: 100%` + `font-size: max(16px, 1em)` pada input di
  WebKit: Safari iOS memperbesar viewport setiap kali field < 16 px difokuskan.
- `@media (pointer: coarse)`: target sentuh ≥ 44 px, efek hover dimatikan.
- `html[data-no-dvh="1"]` memakai `--vh` yang diukur dari `innerHeight`
  (diperbarui saat resize) untuk WebView lama.
- Safe area iPhone/iPad (atas untuk header di mode terpasang, bawah untuk dock).
- `@media (hover: none)` menampilkan aksi baris yang biasanya hanya muncul saat
  hover — di layar sentuh hover tidak pernah terjadi.
- Landscape HP (`max-height: 500px`) menyembunyikan dock dan sub-merek.
- `.screen` 1240 px di desktop, 980 px di tablet; `scrollbar-gutter: stable`.

### Akun wajib (`src/ui/gate.ts`)

Tidak ada "lanjut tanpa akun", tidak ada tutup lewat klik luar, tidak ada Escape.
`#app` diberi `inert` selama gate terbuka, fokus terjebak di kartu, dan
`main.ts` hanya memanggil `closeGate()` setelah `/api/auth` menjawab
`subject != null`. Satu pengecualian: rute `#/control` — konsol operator punya
kredensial sendiri dan harus bisa dibuka saat belum ada sesi.

Kunci PRO **bukan** jalan masuk alternatif. `POST /api/auth` menolak kunci tanpa
akun (`403 google_required`); kunci ditempel di AKUN setelah masuk, dan sesi
memakai email Google sebagai `subject` sehingga akun yang sama bisa masuk di
perangkat lain sebagai FREE tanpa menggandakan lisensi.

### Satu kunci, satu perangkat (`src/state/device.ts` + `api/_lib/devices.js`)

- Setiap browser membuat id acak `d` + 32 hex di `localStorage`
  (`aegis.device.v1`) dan mengirimnya sebagai `x-aegis-device` pada setiap
  panggilan `/api/auth`. Ini **bukan** fingerprint: layar, font, dan canvas tidak
  dibaca, karena nilainya berubah antar kunjungan dan akan mengunci pelanggan.
- Cookie sesi menyimpan `dev`; `currentSession()` menolak cookie yang dibawa
  perangkat lain (`GET /api/auth` menjawab `signedIn:false`, `deviceMismatch:true`,
  dan menghapus cookie itu).
- Ikatan kunci→perangkat dicatat di salah satu dari tiga tempat:
  | Mode | Syarat | Perilaku |
  | --- | --- | --- |
  | `github` | env `AEGIS_LEDGER_TOKEN` (+ opsional `AEGIS_FEEDBACK_REPO`) → `store/devices.json` lewat Contents API | otomatis, bisa dilepas dari konsol |
  | `lock` | env `AEGIS_DEVICE_LOCK="SERIAL:deviceId,…"` | manual, untuk pemeriksaan cepat |
  | `session` | tanpa keduanya | jujur: tidak ada penyimpanan ikatan antar kunjungan |
- GitHub tidak terjangkau → `degraded`: pembelian baru **tidak** dikunci. Jangan
  pernah menahan pelanggan karena infrastruktur kita yang mati.
- Konsol `#/control` → tab AKUN → panel **03c IKATAN PERANGKAT** menampilkan mode,
  jumlah ikatan, daftar serial + id pendek (`0123-4567`), dan tombol LEPAS
  IKATAN (`POST /api/license {op:'unbind', serial}`).

### Kinerja

- `src/ui/scope.ts` mengukur ukuran kanvas lewat `ResizeObserver` dan warna tema
  lewat `MutationObserver`; sebelumnya `getComputedStyle` + `getBoundingClientRect`
  dipanggil **setiap frame**, yang memaksa style recalc + layout pass di tiap
  frame. Loop berhenti saat panel keluar viewport atau tab disembunyikan, dan
  turun ke 30 fps dengan `data-perf="lite"`.
- `src/ui/waveform.ts` tidak lagi memasang `window.resize` (tidak pernah dilepas
  dan menggambar dua kali); `ResizeObserver` sudah menangani rotasi.
- `content-visibility`, `will-change`, dan efek magnet/tilt hanya dipasang di
  tier penuh.

### Tes

`tests/adaptive.test.ts` (18) · `tests/device.test.ts` (13) ·
`tests/boot.test.ts` (gate wajib, jsdom) · `tests/boot-signed.test.ts` (akun
masuk tidak diblokir).

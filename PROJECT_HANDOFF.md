# PROJECT HANDOFF — EL TZY AEGIS-M v8.7.0

Dokumen ini untuk siapa pun (atau model berikutnya) yang melanjutkan repo ini. Ringkas, faktual, tanpa narasi sejarah Flutter.

## 1. Identitas

| | |
| --- | --- |
| Produk | EL TZY AEGIS-M |
| Versi | 8.7.0 (`package.json` + `src/version.ts` → `APP_VERSION`, jangan duplikasi) |
| App ID | `com.eltzy.app` (`capacitor.config.ts`) |
| Basis | TypeScript 7.0.2 · Vite 8.3.4 · Vitest 5.0.5 |
| Native | Capacitor 8.5.3 (core/cli/android, app 8.1.2, filesystem 8.1.5, share 8.0.3, haptics 8.0.2, status-bar 8.0.4) |
| MP3 | `@breezystack/lamejs` 1.2.7 (dimuat dinamis, chunk `codec`) |
| Nama branch kerja | `arena/985911e3-sancorp-x-aliongcorp` |

## 2. Status

- `npx tsc --noEmit` → **clean**
- `npx vitest run` → **180 test lulus** (14 file: dsp 27, engine 29, security 18, encode 7, android 6, motion 12, responsive 12, ui 18, probe 1, tiers 7, auth 18, control 3, ops 8, rating 14)
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
  sw.js                    # cache shell, versi aegis-m-v8.7.0
  icons/                   # hasil tools/make-icons.mjs (jangan edit manual)
tools/make-icons.mjs       # generator PNG tanpa dependency + mipmap Android
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
| Alias lama | `sancorp-x-aliongcorp.vercel.app` — tetap terpasang di project, jadi tautan lama masih melayani build yang sama |
| Project | `sanayacorp-aegismusic` · `prj_ccvhzBXmu7JK4rVcqkgTGJqucUBj` (nama project diganti 2026-10-20; ID tetap) |
| Team | `SANCORP` · `team_AWY0rnVWqjWBuD5zU7odihmb` (Hobby) |
| Framework | vite · `npm ci` · `npm run build` · output `dist` · region `sin1` |
| Deployment aktif | `dpl_4JvKzABL2spYQkYmaUYXPciybBCj` (commit `5c39de9`, v8.6.0) — `READY`/`PROMOTED`, alias utama `sanayacorp-aegismusic.vercel.app` + alias lama; `/api/health` melaporkan `commit:"5c39de9"` |
| Protection | **mati** (`ssoProtection: null`) |
| Prober | workflow `.github/workflows/probe.yml` + `tools/probe-prod.mjs` (tanpa secret) |

### Verifikasi produksi (workflow `probe`, hijau)

`node tools/probe-prod.mjs` memeriksa hal-hal yang hanya bisa dijawab produksi:

0. tunggu `/api/health` melaporkan sha commit yang baru di-push (bukan build sebelumnya)
1. root 200 + CSP `default-src 'none'`, `script-src 'self'`, Trusted Types, `frame-ancestors 'none'`
2. HSTS preload, COOP, COEP, XCTO, Referrer, Permissions-Policy
3. SRI sha-384 pada 3 aset masuk, `Cache-Control: immutable` untuk `/assets`
4. versi `8.x` dibaca dari bundle, bukan dari HTML statis
5. bundle memuat `AKSES OPERATOR` + `AEGIS OPS`, `DAFTAR AKUN`, `AKTIFKAN PRO`, `ElTzyy8`, `Rp 5.000`, dan copy paywall
6. `/api/health` 200 + `env: production` + commit sha
7. `/api/auth` → `tier: free`, **`devSecret: false`** (AEGIS_SECRET terpasang), **`adminEnabled: true`** (AEGIS_ADMIN_PASSWORD terpasang)
8. `/api/license` (GET meja & POST terbit) dan `GET /api/csp-report` menolak anonim (403), kunci palsu ditolak (401) tanpa Set-Cookie

Catatan operasional: `probe` punya dua lapis penyaring. Lapis pertama `paths:` di trigger; lapis kedua langkah **gate** yang men-diff rentang push dan hanya menilai kalau `src/`, `api/`, `public/`, `index.html`, `vercel.json`, atau `package*.json` ikut berubah. Push dokumen/CI jadi no-op yang tetap hijau, bukan timeout empat menit. Deploy tetap manual lewat connector, jadi setelah push yang menyentuh build, buat deployment sebelum probe kehabisan waktu tunggu (4 menit). Kegagalan membuka/comment issue berlabel `monitor`.

Kirim kegagalan sebagai annotation (`::error`) supaya tetap terbaca lewat API check-runs. Probe run terakhir: `39396855403` (push `5c39de9`) — **success**, 18/18 pemeriksaan, hanya annotation `warning` (Node 20) dan `notice` (runner Ubuntu)
walaupun log job tidak bisa diunduh dari sandbox.

### Riwayat blocker (sudah selesai)

- ~~Deployment Protection `all_except_custom_domains`~~ → dimatikan pemilik akun, `ssoProtection: null`.
- ~~GitHub Login Connection belum terpasang~~ → ternyata deploy berbasis git tetap jalan lewat `git_source`; deployment pertama gagal karena protection, bukan karena repo.
- Deploy yang berhasil: `dpl_J8jsTmGUB63ZguqY41gLiSeJpQzP` (v8.4.0), `dpl_H59F8ztNZSNAPXUrp8QDoW7R7Eim` (v8.4.1), `dpl_Fe2rvrszrxnGTraza5uBy4SEvg2V`, `dpl_JDkgdgmpi5vQrJnNwoVVBpCDTJhj`, `dpl_qiWVwUkzCXnwh5k2K29khpRgq9cx`, `dpl_5wnMuwHHTHc32oxkjMZnUNix2yd6` (v8.5.0), `dpl_8XhXi8od6p35T8b4DB8w4yrYCLzq` (a0200c3), lalu `dpl_Hirrjqr9cp5uWpMSpCX7VqA7CgEz` (cedbdee) `dpl_8uR6fRoihDUxTA8n5VAR6owDmjNr` (5457339), `dpl_2rJbzzVHzZh7JbuaywyoLNsySeie` (de70cf1, v8.6.0), dan `dpl_4JvKzABL2spYQkYmaUYXPciybBCj` (5c39de9, shortcut OPS).

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

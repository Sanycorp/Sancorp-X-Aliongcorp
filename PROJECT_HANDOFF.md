# PROJECT HANDOFF — EL TZY AEGIS-M v8.4.0

Dokumen ini untuk siapa pun (atau model berikutnya) yang melanjutkan repo ini. Ringkas, faktual, tanpa narasi sejarah Flutter.

## 1. Identitas

| | |
| --- | --- |
| Produk | EL TZY AEGIS-M |
| Versi | 8.4.0 (`package.json` + `src/version.ts` → `APP_VERSION`, jangan duplikasi) |
| App ID | `com.eltzy.app` (`capacitor.config.ts`) |
| Basis | TypeScript 7.0.2 · Vite 8.3.4 · Vitest 5.0.5 |
| Native | Capacitor 8.5.3 (core/cli/android, app 8.1.2, filesystem 8.1.5, share 8.0.3, haptics 8.0.2, status-bar 8.0.4) |
| MP3 | `@breezystack/lamejs` 1.2.7 (dimuat dinamis, chunk `codec`) |
| Nama branch kerja | `arena/985911e3-sancorp-x-aliongcorp` |

## 2. Status

- `npx tsc --noEmit` → **clean**
- `npx vitest run` → **123 test lulus** (dsp 27, engine 29, security 17, encode 7, android 6, motion 12, responsive 12, ui 12, probe 1)
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
  sw.js                    # cache shell, versi aegis-m-v8.4.0
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
  workers/render.worker.ts
  version.ts      APP_VERSION tunggal
  ui/
    motion.ts     tween, animateValue, scramble, ripple, magnet, tilt, burst,
                  kineticTitle, installScrollChrome, installNavPulse
    elements.ts   el(), fader/toggle/segmented/select/button, toast
    waveform.ts   canvas timeline + trim handles
    scope.ts      oscilloscope
    haptics.ts
    screens/      deck.ts, lab.ts, arsenal.ts, system.ts
  security/
    sanitize.ts   setHtml() + Trusted Types policy `aegis` (DOMPurify allowlist)
    posture.ts    pembacaan header/probe runtime untuk panel SECURITY
  styles/         base.css, primitives.css, controls.css, app.css, motion.css, security.css
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

## 5. Invarian DSP yang tidak boleh dilanggar

1. **Satu pipeline** untuk preview dan export (`engine.render`). Jangan bikin jalur kedua.
2. **Tidak ada loudnorm dinamis.** Hanya satu gain statis + limiter. Test "12 dB gap" menjaga ini.
3. **Limiter selalu terakhir**, ceiling −1.2 dBTP, deteksi 4× Catmull (sama dengan meter).
4. **Fade before reverb** supaya ekor reverb tidak ikut terpotong.
5. **Output selalu stereo 48 kHz.**
6. **Tidak ada upload.** Tidak ada `fetch` ke server di runtime aplikasi.
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

## 8. Yang belum ada / kandidat lanjutan

- Encoder FLAC terkompresi (sekarang verbatim; file besar).
- Waveform rendering berbasis worker untuk file >20 menit (saat ini envelope 480 bucket, aman).
- iOS project (`npx cap add ios`) — butuh macOS untuk build; config sudah siap.
- Splash screen native (sekarang memakai boot splash web + background Capacitor).
- Riwayat export menyimpan metadata saja, bukan file audio (file ada di Documents/Downloads).
- Belum ada preset cloud/import-export JSON; `EditSettings` sudah serializable kalau mau ditambah.

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

## 11. Deployment web (Vercel)

| Hal | Nilai |
| --- | --- |
| Project | `sancorp-x-aliongcorp` · `prj_ccvhzBXmu7JK4rVcqkgTGJqucUBj` |
| Team | `SANCORP` · `team_AWY0rnVWqjWBuD5zU7odihmb` (plan Hobby) |
| Framework | vite · install `npm ci` · build `npm run build` · output `dist` |
| Region | `sin1` |
| Header | 100% dari `vercel.json` (CSP, HSTS, COOP/COEP, CORP, Permissions-Policy, SRI) |
| Prober | job `probe` di `android.yml`, target dibaca dari `.vercel-url` |

**Blocker yang butuh aksi pemilik akun** (tidak bisa dilakukan lewat API connector):

1. **Deployment Protection** — team default `ssoProtection: all_except_custom_domains`
   membuat semua URL `.vercel.app` redirect ke login Vercel (302 ke `vercel.com/sso-api`).
   Matikan di Project → Settings → Deployment Protection → Vercel Authentication → Disabled.
2. **GitHub Login Connection** — deploy berbasis git ditolak dengan
   `You need to add a Login Connection to your GitHub account first`.
   Hubungkan di Account Settings → Authentication → Login Connections → GitHub.
   Setelah tersambung: `create_deployment` dengan `git_source` (JSON string, bukan object)
   akan bekerja, dan setiap push otomatis membangun ulang.

**Catatan teknis penting**

- Param `files` pada connector Vercel menerima **array of JSON strings**
  (`["{\"file\":\"index.html\",\"data\":\"...\"}"]`), dan file yang di-upload mendarat
  di direktori `src/` pada snapshot deployment. Untuk deploy statis tanpa git,
  set `root_directory` project ke `src` lalu `output_directory` ke `.`.
- Tanpa akses HTTP keluar ke `*.vercel.app`, verifikasi deploy dilakukan lewat job
  `probe` di GitHub Actions; hasil diagnostik dibaca dari **annotations API**
  (`gh api repos/.../check-runs/<job_id>/annotations`) karena log artifact diblokir.


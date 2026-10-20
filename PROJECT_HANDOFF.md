# PROJECT HANDOFF — EL TZY 7.0.0 "AEGIS-M"

Dokumen ini adalah peta kerja untuk siapa pun (manusia atau agen) yang melanjutkan
proyek ini. Isinya: keputusan yang sudah final, angka yang sudah divalidasi, jebakan
FFmpeg yang tidak boleh diulang, dan sisa pekerjaan.

---

## 1. Status

| Area | Status |
|---|---|
| DSP (filter graph) | **Validated** — 14/14 preset PASS pada FFmpeg 7.0.2 (I −14.0…−16.0 LUFS, TP −0.5…−5.0 dB, 0 NaN/Inf) |
| Port Dart `graph_builder.dart` | 1:1 dengan `engine.py` (dibandingkan baris per baris, belum dijalankan tanpa SDK) |
| UI Flutter | Semua layar & widget selesai; **belum pernah dikompilasi** (sandbox tanpa Flutter/Dart) |
| Prototipe HTML | Selesai, interaktif, lolos 19 smoke test DOM (jsdom) tanpa error |
| Android | Scaffold lengkap: AGP 8.11.1, Gradle 8.13, Kotlin 2.2.0, compileSdk 36, FileProvider, SAF bridge |
| APK | **Belum dibangun** — harus lewat bot ZIP→APK milik owner atau Flutter SDK lokal |

> Tidak ada Flutter SDK, Dart, JDK, Gradle, adb, atau browser di sandbox. Semua
> verifikasi Dart bersifat statis (import graph, keseimbangan delimiter, nama
> parameter konstruktor, nama field `MechaColors`, enum `label/hint/spec/lossy/mime`).

---

## 2. Angka yang sudah divalidasi

Sumber uji: `test_music.wav`, 30 s stereo 44.1 kHz, mean −13.4 dB, peak 0.0 dBFS.
Pengukuran memakai `volumedetect` + `ebur128=peak=true` tanpa limiter; trim statis
diterapkan sebelum limiter.

| Preset | Trim | Out LUFS | Out TP |
|---|---|---|---|
| night_shift | 0.841 | −14.1 | −1.20 |
| neon_nightcore | 0.923 | −15.0 | −1.00 |
| deep_orbit | 0.861 | −14.2 | — |
| void_drift | 0.822 | −14.1 | — |
| bass_forge | 0.543 | −14.1 | −5.00 |
| orbit_8d | 1.023 | −16.0 | −0.80 |
| phonk_protocol | 0.822 | −14.0 | — |
| liquid_drum | 0.661 | −14.1 | — |
| submerged | 0.638 | −14.1 | −2.90 |
| glass_cathedral | 0.966 | −15.2 | — |
| tape_memory | 0.891 | −15.5 | — |
| signal_clean | 6.095 | −38.3 | — |
| club_ready | 0.582 | −14.1 | −4.20 |
| mecha_protocol | 0.891 | −14.6 | — |

Catatan penting:

- **orbit_8d** keluar −18.4 LUFS pada percobaan pertama → `apulsator` kehilangan
  level. Solusi final: `level_out=10^(4.2·amount/20)` di dalam filter, bukan `volume`
  terpisah. Preset sudah diturunkan depth-nya ke 0.60.
- **signal_clean** memakai `arnndn` → musik hancur (−41 LUFS input, +6.1 trim).
  Preset final memakai `afftdn nr=18` tanpa model neural. **Jangan pernah** mengaktifkan
  `voiceMode` untuk musik; fitur ini tetap ada tetapi digerbangi di UI.
- Durasi output = `processedDuration + tailSeconds`; ekor reverb membuat output
  melebihi window trim secara sah (night 38.90 s, void 48.03 s, orbit 32.89 s).

---

## 3. Jebakan FFmpeg (jangan diulang)

| Percobaan | Akibat | Keputusan |
|---|---|---|
| `loudnorm` | pumping, tidak cocok untuk master musik | satu gain statis |
| `acompressor` glue | artefak pada materi panas | dihapus |
| `afir` | crash/rusak di FFmpeg 7 & 8 | `aecho` multi-tap |
| `asoftclip=level=` | opsi tidak ada | hanya `type=tanh` |
| `apulsator` + `volume` makeup | true peak naik, pan law salah | `level_out` |
| `aecho` wet/dry via `amix normalize=1` | level drop | constant-gain mix (0.86→0.70 dry, 0.35+0.9·level wet) |
| `adeclick` | merusak transient musik | dihapus |
| `apad` | ekor mati | dihapus, biarkan ekor reverb alami |
| `afftdn nr>12` | suara kusam | cap nr 18, `nf=-42` |
| limiter `limit=0.97` | TP overshoot | limit 0.89 (≈ −1.0 dBFS) + `latency=true` |
| fade setelah reverb | ekor terpotong paksa | fade sebelum send reverb |
| `arnndn` untuk musik | −27 dB, musik hilang | hanya mode vokal |

**Urutan pengukuran:** graph `measure=true` (tanpa limiter, tanpa resample 48 k)
→ `[aout]volumedetect,ebur128=peak=true:framelog=quiet` → parse `max_volume`,
`I: ... LUFS`, `Peak: ... dBFS` → `computeTrim`.

`computeTrim` = `min(10^((target−I)/20), 10^((−1−max(peak,TP))/20))`, clamp 0.2–4.0.
Bila target `OFF`, trim hanya dibatasi ceiling dan tidak pernah > 1.0.

---

## 4. Yang belum diverifikasi / risiko build

1. **Kompilasi Flutter belum pernah dijalankan.** Prioritas pertama saat SDK tersedia:
   `flutter analyze` lalu `flutter build apk`.
2. API FFmpegKit sudah dicocokkan dengan sumber paket `ffmpeg_kit_flutter_new` dan
   contoh nyata pemakaian `ffmpeg_kit_flutter_new_audio` 2.5.7:
   - `FFmpegKit.executeAsync(cmd, complete, log, statistics)`
   - `session.getReturnCode()` → `Future<ReturnCode?>`
   - `session.getSessionId()` → `int?`
   - `Statistics.getTime()` → `int` (ms)
   - `FFprobeKit.getMediaInformation(path)` → session, `getMediaInformation()` **sinkron**
3. `FilePicker.platform.pickFiles(type: FileType.audio)` mengembalikan `path` null pada
   sebagian provider SAF; UI menampilkan error, bukan crash.
4. `StorageService.save()` melakukan `rename` lalu fallback `copy` + delete untuk
   perpindahan lintas mount.
5. Folder SAF kustom: `copyToTree` mengembalikan URI dokumen, bukan path filesystem.
   Riwayat menyimpan `saf://<label>/<nama>` sehingga tombol share dinonaktifkan.

### 4b. Guards that ship with the repo

`test/graph_builder_test.dart` (pure Dart, no plugins) locks in the rules above:
`[0:a:0]` input, `[aout]` output, no `loudnorm`/`acompressor`/`afir`, limiter
`limit=0.89 level=false latency=true`, 48 kHz + triangular dither, fades before the
reverb send, 8D `level_out` compensation, retro vs modern speed, trim math
(including the −1 dBFS ceiling and the sane 0.2–4.0 range) and preset integrity.

Run with `flutter test`. It is the fastest way to catch a DSP regression without
a device.

Note: every FFmpeg command that reports progress is executed with `-stats`
injected, because stderr is a pipe and FFmpeg otherwise suppresses progress lines.

---

## 5. Design system

- **MechaColors** (Armor / Cockpit): `canvas, panel, panelAlt, inset, ink, inkSoft,
  inkFaint, line, lineStrong, cobalt, cobaltDeep, crimson, amber, signal, steel,
  plate` + `isDark`.
  - Armor: `#E8ECF3 / #FFFFFF / #0A0D12 / #0B4FD6 / #D91E2B`
  - Cockpit: `#070A0F / #0E131B / #E9EFF8 / #3D7BFF / #FF4D5A`
- **Tipografi:** Chakra Petch (display/UI) + Share Tech Mono (telemetri).
  Helper `T.hero / T.title / T.label / T.body / T.metric`.
- **Bentuk:** semua panel memakai `chamferPath` (potongan sudut 10–12 px) dengan
  bracket cobalt di kiri-atas dan crimson di kanan-bawah.
- **Interaksi:** tekan → skala 0.985 + haptic; knob drag vertikal (170 px = full range),
  double-tap reset; rack membuka dengan `AnimatedSize`; reveal bertahap saat masuk.
- **Copywriting:** UI berbahasa Inggris (label teknis), hint berbahasa Indonesia.
- **Aksesibilitas:** `reduceMotion` mematikan HUD animasi, boot dipersingkat, dan
  `Reveal` langsung tampil.

---

## 6. Peta file

```
lib/core/            palette, typography, theme, format
lib/widgets/         mecha_panel (+MechaRack), mecha_button, mecha_controls,
                     mecha_knob, mecha_meter, reveal, waveform, signal_path,
                     hud_background, boot_screen, export_console
lib/models/          edit_settings, preset (14), app_settings
lib/audio/           graph_builder, audio_engine, waveform_service
lib/services/        storage_service, history_service, prefs
lib/state/           forge_controller, forge_scope
lib/screens/         deck, lab, archive, system
android/             Gradle 8.13 / AGP 8.11.1 / Kotlin 2.2.0 + MainActivity bridge
preview/index.html   prototipe interaktif (tanpa Flutter)
```

### Method channel `com.eltzy.app/storage`

| Method | Argumen | Hasil |
|---|---|---|
| `pickTree` | — | `String?` tree URI (persistable permission) |
| `copyToTree` | `tree`, `src`, `name` | `String` document URI |
| `shareFile` | `path`, `mime` | `true` |

---

## 7. Backlog yang masuk akal (belum dikerjakan)

- Undo/redo per perubahan parameter (sekarang hanya A/B snapshot).
- Batch queue multi-file.
- Export ke folder default tanpa dialog setiap kali (sudah ada untuk app vault).
- Waveform stereo (sekarang mono peak, cukup untuk trim).
- Localization `id_ID` penuh untuk label UI.
- Unit test murni Dart untuk `GraphBuilder` (bisa dijalankan tanpa device).

Yang **tidak** diklaim: neural codec, stem separation, neural mastering,
Atmos/MPEG-H, HRTF personal. Jangan menjanjikan itu di rilis.

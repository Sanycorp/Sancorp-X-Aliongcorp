# Video pipeline — cara pakai

Satu lagu + satu foto → MP4 1920×1080 dengan intro (fade in dari hitam), lagu,
dan outro (fade out ke hitam), plus thumbnail. Audionya dirender oleh **mesin
aplikasi yang sama** (`tools/render-cli.ts` → `renderWithTail`): preset, limiter,
dan target −14 LUFS identik dengan APK.

## Langkah

1. Taruh lagu dan foto di Google Drive, set **Anyone with the link**.
2. Salin link-nya.
3. Sunting `video/request.json` (contoh di bawah), lalu push. Job `video` jalan
   sendiri.
4. Hasilnya ada di branch `video`, tiga berkas: `<slug>.mp4`, `<slug>.jpg`,
   `render.json` (angka LUFS/true peak hasil render).

## Bentuk request

```json
{
  "audio": "https://drive.google.com/file/d/<ID-LAGU>/view",
  "photo": "https://drive.google.com/file/d/<ID-FOTO>/view",
  "preset": "kino_katedral",
  "title": "Judul di layar",
  "subtitle": "slowed + reverb",
  "slug": "nama-file",
  "size": "1920x1080",
  "fps": 30,
  "introSeconds": 4,
  "outroSeconds": 5,
  "zoom": true,
  "trimEnd": 60,
  "seconds": 72
}
```

- `photo` boleh diganti `photoFile` untuk gambar yang sudah ada di repo
  (mis. `video/assets/cover-night.jpg`). Tanpa keduanya, latar hitam polos.
- `preset`: id apa pun dari arsenal (`kino_katedral`, `kino_berputar`,
  `kino_pelan_sekali`, `mahakarya`, …). Kosongkan untuk rantai netral.
- `trimEnd` memotong sumber sebelum diproses; `seconds` memotong video jadi.
  Keduanya berbeda: `trimEnd` menghemat waktu render, `seconds` memotong hasil.
- `size` lain yang sudah diuji: `1080x1920` (vertikal), `1080x1080` (kotak).

## Yang perlu diketahui

- Job berjalan 2–5 menit untuk lagu pendek, dan itu **menunggu**, bukan
  real-time. Tidak ada progres di aplikasi.
- Berkas Drive harus publik; kalau tidak, langkah download gagal dengan pesan
  jelas, bukan diam.
- Foto 16:9 paling aman. Rasio lain akan di-crop tengah.

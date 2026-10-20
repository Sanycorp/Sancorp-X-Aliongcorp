# Membuat OAuth client Google untuk Aegis Sound Lab

Panduan ini berisi langkah di Google Cloud Console dan Vercel, ditambah semua
nilai yang harus disalin. Tidak ada yang perlu dikarang: setiap kotak di bawah
sudah berisi teks yang persis dipakai aplikasi.

Hasil akhirnya cuma dua baris di Vercel:

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

---

## 0. Nilai yang dipakai (salin apa adanya)

| Keperluan | Nilai |
| --- | --- |
| Nama aplikasi (Branding) | `Aegis Sound Lab` |
| Email dukungan | email Google-mu sendiri |
| User type / Audience | `External` |
| Scope | `openid`, `email`, `profile` (ketiganya non-sensitif) |
| Authorized redirect URI | `https://sanayacorp-aegismusic.vercel.app/api/auth/google/callback` |
| Authorized JavaScript origin (opsional) | `https://sanayacorp-aegismusic.vercel.app` |
| Env Vercel | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Cek setelah deploy | `https://sanayacorp-aegismusic.vercel.app/api/auth` harus memuat `"google":true` |

Redirect URI di atas **tidak boleh** diubah bentuknya: tanpa `www`, tanpa garis
miring di ujung, `https`, dan path-nya `google/callback`. Google membandingkan
string itu karakter per karakter; beda satu karakter = `redirect_uri_mismatch`.
Alamat lama `sancorp-x-aliongcorp.vercel.app` sudah mati, jangan didaftarkan.

---

## 1. Buat project

1. Buka <https://console.cloud.google.com/> dan masuk dengan akun Google yang
   kamu pakai untuk Vercel.
2. Di bar atas, klik pemilih project → **New project**.
3. Name: `Aegis Sound Lab` → **Create** → tunggu beberapa detik → pilih project
   itu (nama project di bar atas harus berubah).

Tidak perlu mengaktifkan API apa pun. Login memakai OpenID Connect, bukan Gmail
atau Drive, jadi tidak ada API tambahan yang harus di-enable dan tidak ada
tagihan.

## 2. Isi layar izin (Branding)

Menu kiri: **APIs & Services → OAuth consent screen**. Di console terbaru
halaman ini bernama **Google Auth Platform**, dengan tab sendiri.

1. Klik **Get started** bila muncul.
2. **App information**
   - App name: `Aegis Sound Lab`
   - User support email: pilih emailmu
3. **Audience**: pilih **External**.
4. **Contact information**: isi emailmu lagi → **Create**.

Kalau diminta mengisi tab **Branding** secara terpisah: App name
`Aegis Sound Lab`, User support email dan Developer contact email diisi emailmu.
Logo, homepage, dan privacy policy boleh dikosongkan.

## 3. Audience: tambah penguji lalu publikasikan

Masih di **Google Auth Platform → Audience**:

1. Status awal aplikasi `Testing`. Di mode ini hanya akun yang kamu daftarkan
   yang bisa masuk (maksimal 100).
2. **Test users → Add users** → masukkan alamat Gmail yang akan kamu pakai untuk
   mencoba → **Save**. Ulangi untuk setiap akun yang mau ikut uji.
3. Setelah yakin, klik **Publish app → Confirm**. Status berubah jadi `In
   production`.

Scope yang dipakai (`openid email profile`) termasuk non-sensitif, jadi
penerbitan tidak memerlukan verifikasi Google dan tidak ada layar "app not
verified" untuk pengguna umum. Kalau nanti kamu menambah scope sensitif,
verifikasi baru diperlukan — jangan tambah tanpa alasan.

## 4. Buat client ID

Menu kiri: **APIs & Services → Credentials** (atau **Google Auth Platform →
Clients**).

1. **Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Name: `Aegis Sound Lab Web`.
4. **Authorized JavaScript origins** — opsional untuk alur ini, tapi isi saja:
   ```
   https://sanayacorp-aegismusic.vercel.app
   ```
5. **Authorized redirect URIs** — ini yang wajib, tempel persis:
   ```
   https://sanayacorp-aegismusic.vercel.app/api/auth/google/callback
   ```
6. **Create**. Muncul dua nilai:
   - **Client ID** — berakhiran `apps.googleusercontent.com`
   - **Client secret** — berawalan `GOCSPX-`

Salin keduanya sekarang. Client secret hanya ditampilkan utuh di layar ini;
kalau hilang, buat secret baru lewat tombol **Add secret**, lalu pakai yang baru.
Client ID bukan rahasia, secret **adalah** rahasia — jangan dimasukkan ke repo,
jangan dikirim ke siapa pun, jangan ditempel di issue.

## 5. Pasang di Vercel

1. Buka <https://vercel.com/sancorp/sanayacorp-aegismusic/settings/environment-variables>.
2. **Add New** dua kali:

   | Key | Value | Environments |
   | --- | --- | --- |
   | `GOOGLE_CLIENT_ID` | Client ID dari langkah 4 | Production (tambahkan Preview kalau perlu) |
   | `GOOGLE_CLIENT_SECRET` | Client secret dari langkah 4 | Production (tambahkan Preview kalau perlu) |

   Jangan menambahkan spasi atau tanda kutip; tempel apa adanya.
3. Simpan, lalu **deploy ulang** (Deployments → deployment terakhir → ⋯ →
   **Redeploy**). Environment variable baru hanya terbaca oleh deployment baru.
4. Variabel `AEGIS_SECRET` dan `AEGIS_ADMIN_PASSWORD` sudah ada dan tidak perlu
   disentuh. `AEGIS_SECRET` juga yang menandatangani `state` OAuth, jadi jangan
   dirotasi saat ada pengguna di tengah proses masuk.

## 6. Uji

1. Buka `https://sanayacorp-aegismusic.vercel.app/api/auth` di browser.
   Jawabannya harus JSON dan memuat `"google":true` dan `"signedIn":false`.
   Kalau `"google":false`, env belum terbaca: ulangi langkah 5 poin 3.
2. Buka `https://sanayacorp-aegismusic.vercel.app/` di jendela privat. Layar
   masuk muncul. Klik **Masuk dengan Google**, centang atau kosongkan **Ingat
   saya di perangkat ini**, lalu pilih akun.
3. Kamu kembali ke beranda dengan `?masuk=ok`; nama akun tampil dan statusnya
   `FREE` sampai email itu diberi premium.
4. Buka `#/control`, masuk dengan kunci operator, lihat bagian **03b AKUN
   GOOGLE** — emailmu harus terdaftar di situ. Pilih 30 hari → **BERI PREMIUM**
   → salin token `email:YYYYMMDD:...` ke env `AEGIS_PREMIUM` di Vercel →
   redeploy. Muat ulang halaman: tier berubah jadi `PRO` tanpa perlu keluar
   dulu, karena grant dibaca ulang pada setiap permintaan.

Kalau login di mode `Testing` dan akunmu belum terdaftar sebagai test user,
Google menolak dengan **Error 403: access_denied**. Itu bukan bug aplikasi.

## 7. Kalau gagal

| Yang terlihat | Artinya | Perbaikan |
| --- | --- | --- |
| `Error 400: redirect_uri_mismatch` | URI yang dikirim tidak sama dengan yang terdaftar | Pastikan daftar di console persis `https://sanayacorp-aegismusic.vercel.app/api/auth/google/callback`, tanpa `/` di ujung, tanpa `?google=callback` |
| `Error 403: access_denied` | App masih `Testing` dan akun tidak ada di test users | Tambah akun di Audience → Test users, atau Publish app |
| `Error 401: invalid_client` | Client ID/secret salah, tertukar, atau ada spasi | Ulangi tempel di Vercel, pastikan secret berawalan `GOCSPX-`, redeploy |
| Halaman "Masuk dengan Google belum aktif" (503) | Env belum ada di deployment yang berjalan | Simpan env di environment yang benar, lalu redeploy |
| Kembali ke `/?masuk=gagal` | `state` kedaluwarsa (>10 menit), cookie diblokir, atau penukaran kode ditolak | Coba lagi dari awal di jendela normal; pastikan jam perangkat benar |
| Login berhasil tapi tetap `FREE` | Belum ada grant untuk email itu | Buat grant di `#/control` → 03b, tempel ke `AEGIS_PREMIUM`, redeploy |
| Sudah PRO lalu balik `FREE` | Email masuk `AEGIS_REVOKED`, atau grant kedaluwarsa | Cek `AEGIS_REVOKED`; perpanjang grant |

Redirect `/?masuk=gagal` sengaja tidak menampilkan pesan teknis ke pengunjung.
Detail penyebabnya tidak pernah dikirim ke browser; kalau perlu menyelidiki,
periksa log function di Vercel → Deployments → Functions → `/api/auth`.

## 8. Batasan yang perlu diingat

- Satu client ID untuk satu domain produksi. Preview deployment memakai domain
  lain, jadi login di sana akan `redirect_uri_mismatch` kecuali kamu juga
  mendaftarkan domain preview tersebut.
- Sesi Google berlaku 30 hari bila **Ingat saya** dicentang, dan berakhir saat
  browser ditutup bila tidak. Sesi itu hanya membuktikan identitas; tier tetap
  ditentukan grant di server.
- Penukaran kode terjadi di server dengan client secret, lalu identitas dibaca
  dari ID token: `aud` harus sama dengan client ID, `iss` harus
  `accounts.google.com`, `exp` belum lewat, dan `email_verified` tidak `false`.
- Tidak ada skrip Google yang dimuat di halaman, jadi CSP `script-src 'self'`
  tetap utuh.

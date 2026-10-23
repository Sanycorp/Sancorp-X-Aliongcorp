/**
 * What every knob does, in the words of the person using it.
 *
 * Three questions are answered for each control, and only these three:
 *   what  — what it is, in one sentence a non-engineer can repeat;
 *   more  — what actually happens as you turn it up (and when to stop);
 *   tip   — a starting point you can trust before you have an opinion.
 *
 * The rule is that no sentence may contain a word that is not explained
 * somewhere in this file. "Send" is explained as "seberapa banyak suara
 * dikirim ke ruangan"; "room" as "ukuran ruangan". If a sentence needs a
 * second sentence to be understood, it goes in `more`, not `what`.
 */

export interface HelpEntry {
  /** Plain-language name shown in the guide. */
  term: string;
  what: string;
  more: string;
  tip: string;
}

export type HelpKey =
  | 'speed'
  | 'speedMode'
  | 'fadeIn'
  | 'fadeOut'
  | 'reverbEnabled'
  | 'reverbType'
  | 'reverbLevel'
  | 'reverbRoom'
  | 'reverbDamp'
  | 'spatial8d'
  | 'spinRate'
  | 'depth'
  | 'width'
  | 'bass'
  | 'bassFreq'
  | 'sub'
  | 'clarity'
  | 'presence'
  | 'air'
  | 'lowpass'
  | 'warmth'
  | 'finalGain'
  | 'deEsser'
  | 'monoBass'
  | 'denoise'
  | 'denoiseAmount'
  | 'voiceMode'
  | 'normalizeInput'
  | 'target'
  | 'format'
  | 'trim';

export const HELP: Record<HelpKey, HelpEntry> = {
  speed: {
    term: 'Kecepatan',
    what: 'Seberapa cepat lagu berjalan dibanding aslinya. 1.00× berarti tidak diubah.',
    more: 'Di bawah 1.00× lagu jadi lebih lambat dan lebih berat. Di atas 1.00× jadi lebih cepat dan terasa ringan. Di bawah 0.85× vokal mulai terdengar mengantuk — bagus kalau memang itu yang dicari.',
    tip: 'Slowed: 0.85–0.92×. Nightcore: 1.15–1.30×.',
  },
  speedMode: {
    term: 'Cara memperlambat',
    what: 'Menentukan apakah nada ikut turun saat lagu diperlambat.',
    more: 'MODERN menjaga nada tetap sama, hanya tempo yang berubah — aman untuk vokal. RETRO menurunkan nada bersama tempo, seperti kaset yang diputar pelan; ini yang membuat slowed terasa "berat".',
    tip: 'Slowed klasik: RETRO. Remix yang nadanya harus tetap: MODERN.',
  },
  fadeIn: {
    term: 'Fade masuk',
    what: 'Lamanya suara muncul perlahan dari hening di awal lagu.',
    more: 'Makin panjang, makin halus kemunculannya. Berguna kalau lagu mulai mendadak dan kamu ingin pembukaan yang tenang.',
    tip: '0.5–2 detik sudah cukup terasa.',
  },
  fadeOut: {
    term: 'Fade keluar',
    what: 'Lamanya suara menghilang perlahan di akhir lagu.',
    more: 'Makin panjang, makin lembut penutupnya. Fade panjang menyembunyikan potongan yang kasar di ujung.',
    tip: '2–6 detik untuk lagu yang berakhir mendadak.',
  },
  reverbEnabled: {
    term: 'Reverb (gema ruangan)',
    what: 'Menambahkan gema seperti suara di dalam ruangan, bukan di ruang kedap.',
    more: 'Kalau dimatikan, suara terdengar dekat dan kering. Kalau dinyalakan, ada ekor suara yang membuat lagu terasa punya tempat.',
    tip: 'Nyalakan untuk hampir semua lagu; matikan kalau ingin terdengar sangat dekat.',
  },
  reverbType: {
    term: 'Jenis ruangan',
    what: 'Bentuk ruangan yang dipakai untuk gema.',
    more: 'PLATE = pelat logam, terang dan rapat, umum di vokal. HALL = aula besar, lebar dan panjang. CHAMBER = ruangan sedang, hangat. CATHEDRAL = gereja, sangat panjang dan gelap — hati-hati, mudah menelan ketukan.',
    tip: 'PLATE untuk vokal, HALL untuk lagu lambat, CATHEDRAL hanya untuk ambient.',
  },
  reverbLevel: {
    term: 'Send (banyaknya gema)',
    what: 'Seberapa banyak suara dikirim masuk ke ruangan. Bukan volume gema, tapi jumlah suara yang dibasahi.',
    more: 'Naikkan sedikit demi sedikit. Lewat 45% vokal mulai tenggelam dan bass jadi kabur; di atas 60% lagu terdengar seperti direkam di gua.',
    tip: 'Vokal 15–30%, instrumental 20–40%.',
  },
  reverbRoom: {
    term: 'Room (ukuran ruangan)',
    what: 'Seberapa besar ruangannya. Ini yang menentukan panjang gema, bukan banyaknya.',
    more: 'Kecil = gema pendek dan rapat, terasa seperti kamar. Besar = gema panjang, terasa seperti aula. Kalau lagu terasa penuh, kecilkan room sebelum mengecilkan send.',
    tip: '30–50% untuk lagu biasa.',
  },
  reverbDamp: {
    term: 'Damp (peredam dinding)',
    what: 'Seberapa cepat bagian treble dari gema meredup.',
    more: 'Rendah = dinding keras, gema tetap terang dan bisa terdengar "logam". Tinggi = dinding berlapis kain, gema menggelap dan lebih nyaman.',
    tip: '30–45%. Naikkan kalau gema terasa menusuk.',
  },
  spatial8d: {
    term: '8D orbit',
    what: 'Membuat suara berputar kiri-kanan seperti mengelilingi kepala, terutama di earphone.',
    more: 'Putaran lambat terasa seperti berayun; cepat terasa berputar. Kecepatan 0.08–0.15 Hz paling nyaman — di atas itu bisa memualkan.',
    tip: 'Nyalakan hanya untuk lagu yang memang ingin terasa "berputar".',
  },
  spinRate: {
    term: 'Rate (kecepatan putar)',
    what: 'Berapa kali suara mengelilingi kepala dalam satu detik.',
    more: '0.05 Hz = satu putaran 20 detik, sangat halus. 0.25 Hz = satu putaran 4 detik, terasa jelas berputar. Di atas 0.3 Hz cepat melelahkan.',
    tip: '0.08–0.15 Hz.',
  },
  depth: {
    term: 'Depth (jarak ayunan)',
    what: 'Seberapa jauh suara bergeser dari tengah ke samping saat berputar.',
    more: 'Rendah = hanya bergoyang sedikit di tengah. Tinggi = penuh dari kiri ke kanan. Depth tinggi membuat pemandangan stereo lebar tapi bisa mengurangi fokus vokal.',
    tip: '50–70%.',
  },
  width: {
    term: 'Width (lebar stereo)',
    what: 'Jarak antara kanal kiri dan kanan.',
    more: 'Di bawah 50% suara menyempit ke tengah, terasa lebih padat dan aman di speaker HP. Di atas 50% melebar, terasa besar di earphone tapi bisa hilang kalau didengar mono.',
    tip: '50% netral. 60% untuk earphone.',
  },
  bass: {
    term: 'Bass',
    what: 'Menambah atau mengurangi tubuh nada rendah, sekitar 80–200 Hz.',
    more: 'Ini yang membuat lagu terasa "berdaging". Naikkan untuk lagu yang tipis; terlalu tinggi membuat vokal tertutup dan speaker kecil bergetar kotor.',
    tip: '10–35%.',
  },
  bassFreq: {
    term: 'Bass freq (titik bass)',
    what: 'Titik frekuensi yang dinaikkan oleh kontrol Bass.',
    more: 'Rendah (80–100 Hz) menambah kedalaman. Tinggi (150–200 Hz) menambah hangat dan tubuh pada vokal pria, tapi mudah membuat lagu terasa "boks".',
    tip: '110–140 Hz.',
  },
  sub: {
    term: 'Sub',
    what: 'Menambah nada sangat rendah di bawah 55 Hz — yang terasa di dada, bukan di telinga.',
    more: 'Terasa hanya di speaker besar atau earphone bagus. Di speaker HP efeknya hampir tidak ada, dan kalau berlebihan bisa memicu limiter bekerja terus sehingga lagu kehilangan dinamika.',
    tip: '0–20%.',
  },
  clarity: {
    term: 'Clarity',
    what: 'Mengurangi bagian yang membuat suara terdengar "tertutup", sekitar 680 Hz.',
    more: 'Makin tinggi, makin bersih dan terbuka — tapi kalau terlalu jauh, vokal kehilangan tubuh dan terdengar tipis seperti telepon.',
    tip: '15–40%.',
  },
  presence: {
    term: 'Presence',
    what: 'Menonjolkan bagian yang membuat vokal dan snare terdengar dekat, sekitar 2.8 kHz.',
    more: 'Sedikit saja sudah membuat lagu terdengar "di depan". Terlalu banyak membuat telinga cepat lelah, terutama di volume tinggi.',
    tip: '10–25%.',
  },
  air: {
    term: 'Air',
    what: 'Menambah kesan udara dan kilau di bagian paling tinggi, sekitar 8 kHz.',
    more: 'Membuat lagu terasa modern dan lapang. Terlalu tinggi membuat huruf "s" menusuk dan simbal berbunyi tajam.',
    tip: '10–25%.',
  },
  lowpass: {
    term: 'Low pass',
    what: 'Memotong seluruh treble, menyisakan suara yang makin tumpul.',
    more: 'Sedikit = sedikit lebih gelap dan hangat. Banyak = seperti dari balik dinding, cocok untuk efek "muffled" atau intro.',
    tip: '0% untuk lagu normal; 30–60% untuk efek.',
  },
  warmth: {
    term: 'Warmth (saturasi)',
    what: 'Menambah harmonisa supaya lagu terdengar lebih padat dan "berisi".',
    more: 'Rendah = sedikit lebih tebal, hampir tidak terasa. Tinggi = terdengar seperti tape yang didorong, sedikit kasar. Ini menambah karakter, bukan sekadar volume.',
    tip: '10–30%.',
  },
  finalGain: {
    term: 'Out gain',
    what: 'Volume akhir sebelum limiter. Ini mengubah seberapa keras limiter bekerja.',
    more: 'Naik = lebih keras dan lebih padat, tapi limiter memotong lebih banyak puncak sehingga lagu terasa "ditekan". Turun = lebih lega dan dinamis.',
    tip: 'Biarkan 0 dB. Naikkan paling banyak +3 dB.',
  },
  deEsser: {
    term: 'De-esser',
    what: 'Meredam huruf "s", "sy", dan "c" yang menusuk, di sekitar 5–9 kHz.',
    more: 'Berguna untuk vokal rekaman HP atau mikrofon murah yang tajam. Kalau vokalnya sudah halus, membiarkannya menyala tidak merugikan.',
    tip: 'Nyalakan untuk vokal; matikan untuk instrumental.',
  },
  monoBass: {
    term: 'Mono bass',
    what: 'Menyatukan seluruh nada rendah ke tengah, sehingga bass terdengar sama di kiri dan kanan.',
    more: 'Membuat bass tetap utuh di klub, speaker Bluetooth, dan HP yang hanya punya satu speaker. Jarang ada alasan untuk mematikannya.',
    tip: 'Selalu nyalakan.',
  },
  denoise: {
    term: 'Denoise (pembersih desis)',
    what: 'Mengurangi desis dan suara latar yang konstan, seperti kipas atau noise rekaman.',
    more: 'Makin tinggi Amount, makin bersih, tapi makin banyak detail halus yang ikut hilang — lagu bisa terdengar "berair" atau seperti kompresi buruk.',
    tip: 'Rekaman HP: 30–50%. Rekaman bersih: matikan.',
  },
  denoiseAmount: {
    term: 'Amount (kekuatan denoise)',
    what: 'Seberapa agresif desis dibersihkan.',
    more: 'Di bawah 30% biasanya tidak terasa. Di atas 70% biasanya sudah merusak treble. Dengarkan simbal: kalau berubah jadi "sss" tipis, terlalu tinggi.',
    tip: '30–50%.',
  },
  voiceMode: {
    term: 'Voice focus',
    what: 'Menyempitkan fokus ke rentang suara manusia, membuang sisa noise di luar itu.',
    more: 'Paling berguna untuk rekaman bicara atau vokal solo. Jangan dipakai untuk lagu penuh — drum dan bass akan ikut teredam.',
    tip: 'Nyalakan hanya untuk vokal/bicara.',
  },
  normalizeInput: {
    term: 'Normalize input',
    what: 'Menyamakan volume awal berkas sebelum diproses, ke −0.5 dBFS.',
    more: 'Berguna kalau sumbernya sangat pelan, supaya efek terdengar konsisten. Kalau sumbernya sudah keras, tidak ada yang berubah.',
    tip: 'Nyalakan kalau hasilnya terasa terlalu pelan.',
  },
  target: {
    term: 'Target loudness',
    what: 'Seberapa keras lagu akhirnya, diukur dalam LUFS — angka yang dipakai Spotify dan YouTube.',
    more: '−14 LUFS adalah acuan platform streaming. −11 dan −9 lebih keras untuk klub, tapi platform akan menurunkannya lagi. OFF berarti hanya menjaga puncak, tanpa menyamakan volume.',
    tip: '−14 LUFS untuk hampir semua lagu.',
  },
  format: {
    term: 'Format keluaran',
    what: 'Jenis berkas yang dihasilkan.',
    more: 'MP3 paling kecil dan bisa diputar di mana saja. WAV 16 aman untuk semua perangkat. WAV 24/32F dan FLAC menyimpan kualitas penuh untuk diedit lagi di DAW.',
    tip: 'Dengar sehari-hari: MP3 320. Simpan master: WAV 24.',
  },
  trim: {
    term: 'Potong (trim)',
    what: 'Memilih bagian lagu yang diproses: dari detik berapa sampai detik berapa.',
    more: 'Bagian di luar potongan dibuang, bukan disenyapkan — berkasnya lebih pendek. Pakai untuk membuang jeda kosong di awal atau memotong lagu jadi cuplikan.',
    tip: 'Biarkan penuh kalau tidak yakin.',
  },
};

/** Section-level help: what the whole group is for. */
export const SECTION_HELP: Record<string, { title: string; plain: string; when: string }> = {
  time: {
    title: 'Waktu & pemotongan',
    plain: 'Bagian ini mengubah tempo, nada, dan bagian lagu yang dipakai.',
    when: 'Mulai dari sini: tentukan dulu lagunya mau lambat atau cepat, baru sentuh yang lain.',
  },
  space: {
    title: 'Ruang & gema',
    plain: 'Bagian ini menaruh lagu di dalam sebuah ruangan, dan mengatur seberapa besar ruangannya.',
    when: 'Kalau lagu terasa kering atau datar, tambahkan gema sedikit. Kalau terasa penuh, kurangi send dulu.',
  },
  orbit: {
    title: 'Gerak 8D',
    plain: 'Bagian ini membuat suara berputar mengelilingi kepala.',
    when: 'Hanya untuk earphone. Di speaker, efek ini hampir tidak terdengar.',
  },
  tone: {
    title: 'Nada',
    plain: 'Bagian ini mengatur tebal, terang, dan tumpulnya suara.',
    when: 'Kerjakan terakhir tapi sebelum volume: bass dulu, lalu clarity, lalu air.',
  },
  dynamics: {
    title: 'Karakter & kepadatan',
    plain: 'Bagian ini menambah kehangatan dan memastikan bass tetap utuh di speaker apa pun.',
    when: 'Warmth 10–30% sudah cukup; mono bass sebaiknya selalu menyala.',
  },
  repair: {
    title: 'Perbaikan rekaman',
    plain: 'Bagian ini membersihkan rekaman yang berisik atau terlalu pelan.',
    when: 'Kalau sumbernya sudah bersih, lewati bagian ini sepenuhnya.',
  },
};

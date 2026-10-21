/**
 * The DSP chain, in the order the engine actually runs it.
 *
 * `src/dsp/engine.ts` is the authority; this table is the same order written
 * once for the interface, so the landing page, the pipeline row on the deck and
 * the handoff document cannot drift apart. Each stage carries the technical
 * name of the process, not a marketing name.
 */

export interface ChainStage {
  /** Stable id, also used as a CSS hook. */
  id: string;
  /** Short label as shown on the deck's PIPELINE row. */
  label: string;
  /** What the process is, in correct audio-engineering terms. */
  term: string;
  /** One sentence a user can act on. */
  detail: string;
  /** Runs only when the corresponding control is enabled. */
  conditional?: boolean;
}

export const CHAIN_STAGES: ChainStage[] = [
  {
    id: 'clean',
    label: 'CLEAN',
    term: 'Pembersihan sinyal',
    detail: 'High-pass 24 Hz orde dua membuang DC dan rumble, sekaligus menyaring sampel NaN sebelum masuk rantai.',
  },
  {
    id: 'repair',
    label: 'REPAIR',
    term: 'Reparasi spektral',
    detail: 'Denoise STFT 1024/256 dengan Wiener mask, atau voice focus yang membatasi pita dan meredam noise.',
    conditional: true,
  },
  {
    id: 'trim',
    label: 'TRIM',
    term: 'Titik potong',
    detail: 'In/out point dipotong di domain waktu; normalisasi input opsional ke −0.5 dBFS.',
    conditional: true,
  },
  {
    id: 'time',
    label: 'TIME',
    term: 'Time-stretch / resample',
    detail: 'Mode MODERN memakai WSOLA sehingga pitch tetap. Mode RETRO me-resample, jadi pitch ikut tempo seperti tape.',
    conditional: true,
  },
  {
    id: 'tone',
    label: 'TONE',
    term: 'Filter RBJ biquad',
    detail: 'Lowshelf 80–200 Hz, sub 55 Hz, peaking 680 Hz dan 2.8 kHz, highshelf 8 kHz, low-pass 20 kHz–120 Hz.',
    conditional: true,
  },
  {
    id: 'space',
    label: 'SPACE',
    term: 'Reverb FDN',
    detail: 'Delapan jalur delay dengan umpan balik matriks Hadamard; RT60 dipetakan dari room size dan damping.',
    conditional: true,
  },
  {
    id: 'orbit',
    label: 'ORBIT',
    term: 'Rotasi stereo 8D',
    detail: 'Rotasi panorama pada 0.125 Hz dengan kompensasi level ±4.2 dB supaya tidak ada kanal yang drop.',
    conditional: true,
  },
  {
    id: 'warmth',
    label: 'WARMTH',
    term: 'Saturasi soft-knee',
    detail: 'Kurva tanh bertingkat untuk menambah harmonisa orde dua dan tiga tanpa mengangkat puncak sampel.',
    conditional: true,
  },
  {
    id: 'mono',
    label: 'MONO',
    term: 'Mono bass',
    detail: 'Komponen di bawah 120 Hz dijumlahkan ke mono, supaya bass tetap utuh di klub dan speaker Bluetooth.',
    conditional: true,
  },
  {
    id: 'deess',
    label: 'DE-ESS',
    term: 'De-esser',
    detail: 'Kompresor pita sempit 5–9 kHz yang menurunkan sibilance tanpa menutup kekaburan high-end.',
    conditional: true,
  },
  {
    id: 'master',
    label: 'MASTER',
    term: 'Gain statis + loudness',
    detail: 'Satu gain tetap untuk seluruh berkas, diukur dengan ITU-R BS.1770-4. Tidak ada loudnorm dinamis yang memompa.',
  },
  {
    id: 'limit',
    label: 'LIMIT',
    term: 'True-peak limiter',
    detail: 'Lookahead 5 ms, ceiling −1.2 dBTP, true peak diukur 4× oversampling supaya aman di codec lossy.',
  },
];

/** The stages as grouped for the landing page (same order, fewer headings). */
export const CHAIN_GROUPS: { id: string; index: string; title: string; stages: string[]; detail: string }[] = [
  {
    id: 'masuk',
    index: '01',
    title: 'Masuk & dibersihkan',
    stages: ['clean', 'repair', 'trim'],
    detail: 'Rumble dan DC dibuang, noise direparasi bila diminta, lalu titik potong ditetapkan sebelum apa pun diubah.',
  },
  {
    id: 'waktu',
    index: '02',
    title: 'Waktu',
    stages: ['time'],
    detail: 'WSOLA menjaga pitch saat tempo diturunkan; mode tape me-resample sehingga pitch ikut turun.',
  },
  {
    id: 'nada',
    index: '03',
    title: 'Nada',
    stages: ['tone'],
    detail: 'Enam filter biquad RBJ: low shelf, sub, dua peaking, high shelf, dan low-pass variabel.',
  },
  {
    id: 'ruang',
    index: '04',
    title: 'Ruang & gerak',
    stages: ['space', 'orbit'],
    detail: 'Reverb FDN delapan jalur, lalu rotasi stereo 8D dengan kompensasi level per kanal.',
  },
  {
    id: 'karakter',
    index: '05',
    title: 'Karakter',
    stages: ['warmth', 'mono', 'deess'],
    detail: 'Saturasi soft-knee, mono bass di bawah 120 Hz, de-esser 5–9 kHz — urutan yang menjaga bass tetap mono setelah reverb.',
  },
  {
    id: 'master',
    index: '06',
    title: 'Master & tulis',
    stages: ['master', 'limit'],
    detail: 'Loudness diukur, gain statis diselesaikan terhadap target, lalu limiter true-peak −1.2 dBTP menutup rantai sebelum encode.',
  },
];

/** Format ladder, in the order the deck shows it. */
export const FORMAT_LADDER: { id: string; label: string; detail: string; pro?: boolean }[] = [
  { id: 'mp3', label: 'MP3', detail: '320 kbps CBR · 44.1/48 kHz', pro: false },
  { id: 'wav16', label: 'WAV 16', detail: '16-bit PCM · tanpa lossy', pro: false },
  { id: 'wav24', label: 'WAV 24', detail: '24-bit PCM · master', pro: true },
  { id: 'wav32', label: 'WAV 32F', detail: '32-bit float · untuk DAW', pro: true },
  { id: 'flac', label: 'FLAC', detail: 'Lossless terkompresi', pro: true },
];

/**
 * Which of the six groups a progress report belongs to.
 *
 * `engine.ts` reports finer names than the deck can show (DENOISE, VOICE,
 * DEESS…) and two steps that are not filters at all (ENCODE, WRITE). Leaving
 * that mapping to `indexOf` on a short list meant the pips froze at MASTER for
 * every stage the list did not know. Six groups, one number, no guessing.
 */
const GROUP_OF_STAGE: Record<string, number> = {
  CLEAN: 0,
  VOICE: 0,
  DENOISE: 0,
  TIME: 1,
  TONE: 2,
  SPACE: 3,
  ORBIT: 3,
  WARMTH: 4,
  MONO: 4,
  DEESS: 4,
  MASTER: 5,
  LIMIT: 5,
  ENCODE: CHAIN_GROUPS.length,
  WRITE: CHAIN_GROUPS.length,
  DONE: CHAIN_GROUPS.length,
};

/** Group index for an engine stage name; -1 when the name is not a chain stage. */
export function stageGroupIndex(stage: string): number {
  const hit = GROUP_OF_STAGE[stage.toUpperCase()];
  return hit === undefined ? -1 : hit;
}

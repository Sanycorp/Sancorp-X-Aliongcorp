import type { EditSettings } from './settings';

export type PresetTag =
  | 'SLOW'
  | 'FAST'
  | 'BASS'
  | 'POWER'
  | 'SPACE'
  | 'RETRO'
  | 'REPAIR'
  | 'SIGNATURE';
export type PresetAccent = 'cobalt' | 'crimson' | 'amber' | 'signal' | 'ink';

export interface Preset {
  id: string;
  name: string;
  tagline: string;
  detail: string;
  tag: PresetTag;
  accent: PresetAccent;
  apply: (s: EditSettings) => void;
  /**
   * Why these numbers. Written for the owner, not for a brochure: the filter,
   * the amount in dB, and what it is meant to fix. Shown in ARSENAL.
   */
  why?: string;
  /** Part of the owner edition: built for this one person, never resold. */
  owner?: boolean;
  /**
   * Which shelf the preset lives on. Kino presets were measured against one
   * specific file and are kept separate, so they are never mixed in with the
   * general arsenal.
   */
  family?: 'kino' | 'owner' | 'classic';
}

/**
 * The preset arsenal: 14 classics ported 1:1 from the Python engine that was
 * validated against FFmpeg, plus 20 builds written for the owner edition.
 *
 * Every one of them is rendered against the test bed in CI: each must land
 * inside its loudness target and stay at true peak ≤ −1 dBFS. The `why` field
 * carries the reason for the numbers, so a preset is never a magic box.
 */
export const PRESETS: Preset[] = [
  {
    id: 'night_shift',
    name: 'NIGHT SHIFT',
    tagline: 'Slowed · hall · warm tape',
    detail: '0.84× tape slowdown into a wide hall with a soft top end. The default late-night listen.',
    why: '0,84× = −3,02 semitone, penurunan tape yang masih terdengar seperti penyanyi yang sama. Hall 38% ruang 55% redam 30%, low shelf +3,5 dB di 140 Hz, 680 Hz −0,63 dB. Fade keluar 1,5 detik supaya ekor hall tidak terpotong.',
    tag: 'SLOW',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        bassFreq: 0.5,
        speed: 0.84,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.38,
        reverbRoom: 0.55,
        reverbDamp: 0.3,
        bass: 0.14,
        sub: 0.12,
        clarity: 0.25,
        warmth: 0.12,
        width: 0.56,
        fadeIn: 0.3,
        fadeOut: 1.5,
      });
    },
  },
  {
    id: 'neon_nightcore',
    name: 'NEON NIGHTCORE',
    tagline: 'Fast · plate · bright',
    detail: '1.28× pitch-up with a tight plate and air lift. Anime-opener energy.',
    why: '1,28× = +4,27 semitone, batas atas nightcore sebelum suara jadi kartun. Pelat 14% ruang 18% (pendek), 8 kHz +1,6 dB, 680 Hz −0,5 dB, width 0,6. Tanpa bass tambahan: pitch naik sudah mengencangkan low-end.',
    tag: 'FAST',
    accent: 'amber',
    apply: (s) => {
      Object.assign(s, {
        speed: 1.28,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.14,
        reverbRoom: 0.18,
        reverbDamp: 0.5,
        air: 0.4,
        clarity: 0.2,
        width: 0.6,
        fadeIn: 0.2,
        fadeOut: 0.8,
      });
    },
  },
  {
    id: 'deep_orbit',
    name: 'DEEP ORBIT',
    tagline: 'Slow · wide hall · sub',
    detail: 'Deep dive: 0.78×, long hall and a sub layer that sits under the kick.',
    why: '0,78× = −4,30 semitone. Hall 40% ruang 78% redam 20% (ekor ±2,5 detik), low shelf +3,5 dB di 140 Hz, sub +2,85 dB di 55 Hz. Mono bass 120 Hz supaya sub tidak hilang di speaker mono.',
    tag: 'SPACE',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        monoBass: true,
        speed: 0.78,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.4,
        reverbRoom: 0.78,
        reverbDamp: 0.2,
        bass: 0.14,
        sub: 0.18,
        clarity: 0.3,
        warmth: 0.15,
        width: 0.56,
        fadeIn: 0.4,
        fadeOut: 2.0,
      });
    },
  },
  {
    id: 'void_drift',
    name: 'VOID DRIFT',
    tagline: 'Cathedral · huge decay',
    detail: '0.72× into a 6-second stone cathedral. Long fades, no floor.',
    why: '0,72× = −5,69 semitone. Katedral 46% ruang 92% redam 15% memberi ekor ±6 detik. Low-pass 0,12 → 11,5 kHz mencegah ekor yang terlalu terang; sub +3,4 dB di 55 Hz, mono bass.',
    tag: 'SPACE',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
        monoBass: true,
        speed: 0.72,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'cathedral',
        reverbLevel: 0.46,
        reverbRoom: 0.92,
        reverbDamp: 0.15,
        bass: 0.18,
        sub: 0.25,
        clarity: 0.25,
        warmth: 0.18,
        lowpass: 0.12,
        width: 0.54,
        fadeIn: 0.5,
        fadeOut: 2.5,
      });
    },
  },
  {
    id: 'bass_forge',
    name: 'BASS PRESSURE',
    tagline: 'Low end · club master',
    detail: 'Straight tempo, maximum low-end reinforcement. Built for subwoofers.',
    why: 'Low shelf +6,7 dB di 130 Hz (bukan 90 Hz: kick tetap punya serangan) dan sub +4,5 dB di 55 Hz. 680 Hz −1,0 dB membuat ruang untuk bass, 8 kHz +0,8 dB menjaga hi-hat tetap hidup. Mono bass wajib di level ini.',
    tag: 'BASS',
    accent: 'amber',
    apply: (s) => {
      Object.assign(s, {
        monoBass: true,
        bassFreq: 0.42,
        bass: 0.45,
        sub: 0.4,
        clarity: 0.4,
        air: 0.2,
        presence: 0.15,
        width: 0.55,
      });
    },
  },
  {
    id: 'orbit_8d',
    name: 'ORBIT 8D',
    tagline: 'Rotating stereo · headphones',
    detail: '0.125 Hz rotation with level compensation, so nothing drops out.',
    why: '0,125 Hz = satu putaran 8 detik. Depth 0,6 dengan kompensasi level dari mesin orbit, hall 18% hanya untuk ruang, width 0,75. Titik lemah terendah dipertahankan −3 dB, jadi tidak ada sisi yang hilang.',
    tag: 'SPACE',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        spatial8d: true,
        spinRate: 0.125,
        depth: 0.6,
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.18,
        reverbRoom: 0.45,
        width: 0.75,
        air: 0.15,
      });
    },
  },
  {
    id: 'phonk_protocol',
    name: 'PHONK PROTOCOL',
    tagline: '0.88 · 8D · cowbell space',
    detail: 'Slow phonk pocket: heavy sub, slow sway and a tight room.',
    why: '0,88× = −2,21 semitone. 8D 0,08 Hz depth 0,55, hall 22% ruang 30%. Low shelf +7,8 dB di 140 Hz dan sub +4,9 dB di 55 Hz — mono bass 120 Hz supaya 808 tidak membatalkan diri di stereo.',
    tag: 'BASS',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
        monoBass: true,
        speed: 0.88,
        spatial8d: true,
        spinRate: 0.08,
        depth: 0.55,
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.22,
        reverbRoom: 0.3,
        reverbDamp: 0.4,
        bass: 0.55,
        sub: 0.45,
        clarity: 0.45,
        air: 0.2,
        warmth: 0.12,
        width: 0.65,
        fadeOut: 1.2,
      });
    },
  },
  {
    id: 'liquid_drum',
    name: 'LIQUID DRUM',
    tagline: 'Liquid DnB · air',
    detail: '1.05× with a plate and air band. Leram-style liquid texture.',
    why: '1,05× = +0,84 semitone, hanya untuk mengencangkan groove. Pelat 12% ruang 18%, low shelf +5,2 dB di 128 Hz, 8 kHz +1,0 dB, presence +0,25 dB di 2,8 kHz.',
    tag: 'FAST',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        bassFreq: 0.4,
        speed: 1.05,
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.12,
        reverbRoom: 0.18,
        reverbDamp: 0.6,
        bass: 0.3,
        sub: 0.25,
        air: 0.25,
        clarity: 0.25,
        presence: 0.1,
      });
    },
  },
  {
    id: 'submerged',
    name: 'SUBMERGED',
    tagline: 'Muffled · underwater',
    detail: '0.80× with the top rolled back and the low end pushed forward.',
    why: '0,80× = −3,86 semitone. Low shelf +7,8 dB di 140 Hz dan sub +5,3 dB di 55 Hz, 680 Hz −0,88 dB, hall 25% ruang 35% redam 50%. Mono bass 120 Hz agar dengung tidak melebar.',
    tag: 'SLOW',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        monoBass: true,
        speed: 0.8,
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.25,
        reverbRoom: 0.35,
        reverbDamp: 0.5,
        bass: 0.55,
        sub: 0.5,
        clarity: 0.35,
        warmth: 0.15,
        width: 0.52,
        fadeOut: 2.0,
      });
    },
  },
  {
    id: 'glass_cathedral',
    name: 'GLASS CATHEDRAL',
    tagline: 'Bright · long cathedral',
    detail: '0.90×, cathedral tail and a glassy top. Ambient / cinematic.',
    why: '0,90× = −1,82 semitone. Katedral 40% ruang 85% redam 10%: ekor panjang tapi tetap terang. 8 kHz +0,4 dB, width 0,7, fade 0,6 masuk dan 3 detik keluar.',
    tag: 'SPACE',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.9,
        reverbEnabled: true,
        reverbType: 'cathedral',
        reverbLevel: 0.4,
        reverbRoom: 0.85,
        reverbDamp: 0.1,
        clarity: 0.2,
        air: 0.1,
        width: 0.7,
        warmth: 0.08,
        fadeIn: 0.6,
        fadeOut: 3.0,
      });
    },
  },
  {
    id: 'tape_memory',
    name: 'TAPE MEMORY',
    tagline: 'Lo-fi · warm · low-pass',
    detail: '0.96× tape saturation with a rolling low-pass. Dusty and close.',
    why: 'Low-pass 0,35 → 4,0 kHz adalah batas pita kaset yang jujur. Saturasi 45% menambah harmonisa, pelat 18% ruang 30% redam 70% (gema tenggelam), width 0,48 menyempitkan stereo. 0,96× = −0,71 semitone.',
    tag: 'SLOW',
    accent: 'amber',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.96,
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.18,
        reverbRoom: 0.3,
        reverbDamp: 0.7,
        lowpass: 0.35,
        warmth: 0.45,
        clarity: 0.1,
        width: 0.48,
        fadeIn: 0.25,
        fadeOut: 1.0,
      });
    },
  },
  {
    id: 'signal_clean',
    name: 'SIGNAL CLEAN',
    tagline: 'Repair · de-ess · clear',
    detail: 'Spectral repair and de-essing for noisy takes and phone recordings.',
    why: 'Denoise 55%: cukup untuk menghapus derau, belum cukup untuk membuat suara berpasir. De-esser aktif, 680 Hz −0,38 dB, 2,8 kHz +0,25 dB, 8 kHz tidak diangkat supaya desis tidak kembali.',
    tag: 'REPAIR',
    accent: 'signal',
    apply: (s) => {
      Object.assign(s, {
        denoise: true,
        denoiseAmount: 0.55,
        deEsser: true,
        clarity: 0.15,
        presence: 0.1,
        width: 0.55,
      });
    },
  },
  {
    id: 'club_ready',
    name: 'CLUB READY',
    tagline: 'Modern tempo · club EQ',
    detail: 'Pitch-locked 1.0× with a club curve and peak-safe master. No slowdown character.',
    why: 'Speed 1,0× mode modern: tempo dan nada utuh. Low shelf +5,7 dB di 134 Hz, sub +3,0 dB di 55 Hz, 680 Hz −0,75 dB, 8 kHz +1,2 dB. Mono bass 120 Hz dan limiter terakhir menjaga true peak ≤ −1 dBFS.',
    tag: 'BASS',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        monoBass: true,
        bassFreq: 0.45,
        speed: 1,
        speedMode: 'modern',
        bass: 0.35,
        sub: 0.2,
        clarity: 0.3,
        air: 0.3,
        presence: 0.1,
        width: 0.6,
        warmth: 0.08,
      });
    },
  },
  {
    id: 'mecha_protocol',
    name: 'MECHA PROTOCOL',
    tagline: 'Signature · 8D plate',
    detail: 'The house sound: 0.88×, slow 8D sway, plate sheen and tight lows.',
    why: '0,88× = −2,21 semitone. Pelat 26% ruang 40% redam 35%, 8D 0,06 Hz depth 0,35, low shelf +4,1 dB di 140 Hz, sub +3,0 dB. Mono bass 120 Hz dan limiter terakhir: bunyi tanda tangan, bukan efek.',
    tag: 'SIGNATURE',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
        monoBass: true,
        speed: 0.88,
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.26,
        reverbRoom: 0.4,
        reverbDamp: 0.35,
        spatial8d: true,
        spinRate: 0.06,
        depth: 0.35,
        bass: 0.2,
        sub: 0.2,
        clarity: 0.3,
        air: 0.12,
        warmth: 0.15,
        width: 0.62,
        fadeIn: 0.2,
        fadeOut: 2.0,
      });
    },
  },
  // ---------------------------------------------------------------------
  // EDISI OWNER — 20 preset yang dibangun untuk satu orang.
  //
  // Setiap angka di sini punya alasan yang bisa diperiksa di rantai DSP:
  //   bass   → low shelf 80–200 Hz, +2…+12,5 dB
  //   sub    → low shelf 55 Hz, +1,5…+9 dB
  //   clarity→ potong 680 Hz (kotak "mud"), maks −2,5 dB
  //   presence→ angkat 2,8 kHz, maks +2,5 dB
  //   air    → high shelf 8 kHz, maks +4 dB
  //   lowpass→ 20 kHz × 100^−x  (0,30 ≈ 5 kHz · 0,50 ≈ 2 kHz)
  //   warmth → saturasi tanh, sebelum mono bass dan de-esser
  //   monoBass selalu dipakai saat sub > 0,25 supaya low-end tidak saling
  //   membatalkan di speaker klub.
  // ---------------------------------------------------------------------
  {
    id: 'vokal_bening',
    owner: true,
    name: 'VOKAL BENING',
    tagline: 'Vokal di depan · jernih',
    detail:
      'Take vokal dekat mic. Fokus vokal menekan ruangan, de-esser menahan huruf S, dan levelnya mendarat di standar podcast.',
    why: '680 Hz −0,9 dB (kotak mud vokal), 2,8 kHz +0,75 dB untuk kejelasan kata, 8 kHz +0,7 dB untuk udara. Fokus vokal + de-esser sebelum limiter, target −16 LUFS, true peak ≤ −1 dBFS.',
    tag: 'REPAIR',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        voiceMode: true,
        deEsser: true,
        clarity: 0.35,
        presence: 0.3,
        air: 0.18,
        warmth: 0.1,
        width: 0.52,
        normalizeInput: true,
        target: 'podcast',
        fadeIn: 0.05,
        fadeOut: 0.4,
      });
    },
  },
  {
    id: 'wawancara_jelas',
    owner: true,
    name: 'WAWANCARA JELAS',
    tagline: 'Dua suara · ruang berAC',
    detail:
      'Dua orang, satu mikrofon, ruangan berAC. Denoise membersihkan desis tanpa menggerus konsonan, level dua suara disamakan.',
    why: 'Spectral denoise 50% — di atas itu konsonan mulai berpasir. 680 Hz −0,75 dB, 2,8 kHz +0,6 dB, de-esser aktif. Normalize input ke −0,5 dBFS supaya tamu yang jauh dari mic tidak tenggelam.',
    tag: 'REPAIR',
    accent: 'signal',
    apply: (s) => {
      Object.assign(s, {
        denoise: true,
        denoiseAmount: 0.5,
        deEsser: true,
        clarity: 0.3,
        presence: 0.24,
        air: 0.1,
        width: 0.5,
        normalizeInput: true,
        target: 'podcast',
        fadeIn: 0.1,
        fadeOut: 0.3,
      });
    },
  },
  {
    id: 'rekaman_hp',
    owner: true,
    name: 'REKAMAN HP',
    tagline: 'Selamatkan take darurat',
    detail:
      'Rekaman dari HP di ruangan ramai: derau dibersihkan, mud dipotong, konsonan diangkat, dengung ruangan dikunci mono.',
    why: 'Denoise 70% masih menyisakan 30% tekstur supaya suara tidak berlogam. 680 Hz −1,05 dB, 2,8 kHz +0,9 dB, 8 kHz +0,8 dB. Mono bass 120 Hz mencegah dengung ruangan melebar.',
    tag: 'REPAIR',
    accent: 'signal',
    apply: (s) => {
      Object.assign(s, {
        denoise: true,
        denoiseAmount: 0.7,
        deEsser: true,
        clarity: 0.42,
        presence: 0.35,
        air: 0.2,
        monoBass: true,
        width: 0.52,
        normalizeInput: true,
        target: 'podcast',
        fadeIn: 0.15,
        fadeOut: 0.5,
      });
    },
  },
  {
    id: 'akustik_intim',
    owner: true,
    name: 'AKUSTIK INTIM',
    tagline: 'Gitar + vokal · ruang kecil',
    detail:
      'Satu take gitar akustik dan vokal, terdengar seperti duduk berhadapan di ruang kayu. Gema pendek, sedikit hangat.',
    why: 'Chamber 22% dengan ruang 32% (ekor pendek) dan redam 55% supaya tidak berkaleng. 680 Hz −0,5 dB, 2,8 kHz +0,4 dB, 8 kHz +0,5 dB: jelas tanpa sibilan.',
    tag: 'SPACE',
    accent: 'amber',
    apply: (s) => {
      Object.assign(s, {
        reverbEnabled: true,
        reverbType: 'chamber',
        reverbLevel: 0.22,
        reverbRoom: 0.32,
        reverbDamp: 0.55,
        clarity: 0.2,
        presence: 0.15,
        air: 0.12,
        warmth: 0.15,
        width: 0.52,
        fadeIn: 0.08,
        fadeOut: 0.9,
      });
    },
  },
  {
    id: 'piano_hall',
    owner: true,
    name: 'PIANO HALL',
    tagline: 'Piano tunggal · aula kayu',
    detail:
      'Piano sendirian di aula. Hall sedang dengan ekor yang cukup untuk pedal, tapi not cepat tetap terpisah.',
    why: 'Hall 28%, ruang 60%, redam 35%: ekor sekitar 1,8 detik. 8 kHz +0,6 dB untuk senar, 680 Hz −0,4 dB supaya badan piano tidak jadi kotak.',
    tag: 'SPACE',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.28,
        reverbRoom: 0.6,
        reverbDamp: 0.35,
        clarity: 0.15,
        presence: 0.1,
        air: 0.15,
        width: 0.6,
        fadeIn: 0.1,
        fadeOut: 1.8,
      });
    },
  },
  {
    id: 'balada_galau',
    owner: true,
    name: 'BALADA GALAU',
    tagline: 'Tempo turun · hall lembut',
    detail:
      'Lagu sedih dengan tempo 6% lebih lambat dan nada ikut turun satu semitone. Hall lembut, fade panjang di akhir.',
    why: '0,94× resample = −1,07 semitone: masih suara penyanyi yang sama, bukan chipmunk. Low shelf +3,9 dB di 128 Hz, sub +2,4 dB di 55 Hz, hall 30% ruang 55%.',
    tag: 'SLOW',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.94,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.3,
        reverbRoom: 0.55,
        reverbDamp: 0.4,
        bass: 0.18,
        bassFreq: 0.4,
        sub: 0.12,
        clarity: 0.25,
        warmth: 0.14,
        width: 0.58,
        fadeIn: 0.35,
        fadeOut: 2.2,
      });
    },
  },
  {
    id: 'rock_tebal',
    owner: true,
    name: 'ROCK TEBAL',
    tagline: 'Gitar berdaging · −11 LUFS',
    detail:
      'Gitar distorsi dan drum keras: saturasi menambah daging, presence mengangkat petikan, mud dibuang.',
    why: 'Warmth 35% (tanh) menambah harmonisa tanpa menghapus transient; 2,8 kHz +0,75 dB untuk petikan; 680 Hz −0,75 dB supaya tidak berongga; low shelf +4,6 dB di 134 Hz.',
    tag: 'POWER',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
        warmth: 0.35,
        clarity: 0.3,
        presence: 0.3,
        air: 0.12,
        bass: 0.25,
        bassFreq: 0.45,
        sub: 0.1,
        width: 0.6,
        target: 'loud',
      });
    },
  },
  {
    id: 'metal_presisi',
    owner: true,
    name: 'METAL PRESISI',
    tagline: 'Double kick · low-end mono',
    detail:
      'Tremolo picking dan double kick: low-end dikunci mono, mud dibuang tegas, presence dinaikkan. Rapi, bukan berdengung.',
    why: 'Mono bass di bawah 120 Hz mencegah kick dan bass saling membatalkan. 680 Hz −1,25 dB, 2,8 kHz +1 dB, low shelf +4,1 dB di 140 Hz, sub hanya +2,4 dB.',
    tag: 'POWER',
    accent: 'ink',
    apply: (s) => {
      Object.assign(s, {
        monoBass: true,
        clarity: 0.5,
        presence: 0.4,
        air: 0.1,
        bass: 0.2,
        bassFreq: 0.5,
        sub: 0.12,
        warmth: 0.12,
        width: 0.58,
        target: 'loud',
      });
    },
  },
  {
    id: 'trap_sub',
    owner: true,
    name: 'TRAP SUB',
    tagline: '808 · sub · mono · −11 LUFS',
    detail:
      '808 dan sub bass jadi raja. Sub diangkat 5,6 dB, bass 6,2 dB, seluruh low-end dibuat mono agar tidak hilang di speaker mana pun.',
    why: 'Sub +5,6 dB di 55 Hz dan low shelf +6,2 dB di 110 Hz — batas sebelum limiter mulai bekerja keras. Mono bass wajib: 808 stereo adalah kesalahan paling umum di master trap. Target −11 LUFS, bukan −9: sub sebesar ini tidak bisa dipaksa lebih keras tanpa limiter mulai mendistorsi.',
    tag: 'BASS',
    accent: 'amber',
    apply: (s) => {
      Object.assign(s, {
        sub: 0.55,
        bass: 0.4,
        bassFreq: 0.25,
        monoBass: true,
        clarity: 0.35,
        presence: 0.12,
        width: 0.55,
        target: 'loud',
      });
    },
  },
  {
    id: 'koplo_panggung',
    owner: true,
    name: 'KOPLO PANGGUNG',
    tagline: 'Kendang · bass · −9 LUFS',
    detail:
      'Kendang dan bass koplo harus terasa di dada. Low shelf di titik pukulan kendang, sub secukupnya, presence untuk seruling dan vokal.',
    why: '146 Hz adalah pukulan kendang, bukan rumble: +6,2 dB di sana. Sub hanya +3,75 dB di 55 Hz supaya low-end tidak jadi lumpur. Mono bass + target −9 LUFS untuk panggung (±1 dB).',
    tag: 'BASS',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
        bass: 0.4,
        bassFreq: 0.55,
        sub: 0.3,
        monoBass: true,
        clarity: 0.32,
        presence: 0.28,
        air: 0.2,
        warmth: 0.1,
        width: 0.62,
        target: 'club',
      });
    },
  },
  {
    id: 'keroncong_hangat',
    owner: true,
    name: 'KERONCONG HANGAT',
    tagline: 'Ukulele · cello · hangat',
    detail:
      'Ukulele, cello, dan vokal keroncong: saturasi ringan, ujung atas dipangkas sedikit, gema pelat tipis.',
    why: 'Low-pass 0,12 → 11,5 kHz membuang desis rekaman lama. Warmth 30% menambah badan, 680 Hz −0,55 dB, pelat 15% ruang 30% supaya vokal tetap di depan.',
    tag: 'RETRO',
    accent: 'amber',
    apply: (s) => {
      Object.assign(s, {
        warmth: 0.3,
        lowpass: 0.12,
        clarity: 0.22,
        presence: 0.12,
        bass: 0.15,
        bassFreq: 0.35,
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.15,
        reverbRoom: 0.3,
        reverbDamp: 0.6,
        width: 0.5,
        fadeOut: 1.1,
      });
    },
  },
  {
    id: 'dub_guwa',
    owner: true,
    name: 'DUB GUWA',
    tagline: 'Gema panjang · sub dalam',
    detail:
      'Dub: gema panjang yang sengaja terdengar, sub dalam, dan ekor yang dibiarkan memudar sendiri.',
    why: 'Hall 45% ruang 85% redam 35% memberi ekor sekitar 3 detik tanpa mengubah tempo. Sub +4,5 dB di 55 Hz, mono bass, fade out 2,5 detik supaya ekor tidak terpotong.',
    tag: 'SPACE',
    accent: 'ink',
    apply: (s) => {
      Object.assign(s, {
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.45,
        reverbRoom: 0.85,
        reverbDamp: 0.35,
        sub: 0.4,
        bass: 0.32,
        bassFreq: 0.3,
        monoBass: true,
        clarity: 0.2,
        width: 0.6,
        fadeOut: 2.5,
      });
    },
  },
  {
    id: 'ambient_luas',
    owner: true,
    name: 'AMBIENT LUAS',
    tagline: 'Katedral · nada tetap',
    detail:
      'Musik ambient dan drone: tempo 10% lebih lambat dengan nada tetap, katedral besar, fade masuk-keluar panjang.',
    why: 'Mode modern: tempo turun tanpa mengubah pitch — beda dari tape. Katedral 42% ruang 95%, 8 kHz +0,8 dB, fade 0,8 detik masuk dan 3,5 detik keluar.',
    tag: 'SPACE',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.9,
        speedMode: 'modern',
        reverbEnabled: true,
        reverbType: 'cathedral',
        reverbLevel: 0.42,
        reverbRoom: 0.95,
        reverbDamp: 0.2,
        air: 0.2,
        width: 0.7,
        fadeIn: 0.8,
        fadeOut: 3.5,
      });
    },
  },
  {
    id: 'sinematik',
    owner: true,
    name: 'SINEMATIK',
    tagline: 'Trailer · berat · lebar',
    detail:
      'Trailer dan skor film: sub dalam, hall lebar, level −11 LUFS supaya terasa besar di layar. Intro pelan, akhir panjang.',
    why: 'Low shelf +4,6 dB di 134 Hz dan sub +3,75 dB di 55 Hz memberi berat. Hall 35% ruang 85%, fade 0,5/2,8 detik, target −11 LUFS dengan true peak ≤ −1 dBFS.',
    tag: 'POWER',
    accent: 'ink',
    apply: (s) => {
      Object.assign(s, {
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.35,
        reverbRoom: 0.85,
        reverbDamp: 0.25,
        bass: 0.25,
        bassFreq: 0.45,
        sub: 0.3,
        monoBass: true,
        air: 0.15,
        width: 0.68,
        target: 'loud',
        fadeIn: 0.5,
        fadeOut: 2.8,
      });
    },
  },
  {
    id: 'synth_80',
    owner: true,
    name: 'SYNTH 80AN',
    tagline: 'Pad lebar · kilau 8 kHz',
    detail:
      'Synthwave: stereo selebar mungkin, kilau di 8 kHz, pelat pendek yang membuat pad berkilau tanpa mengaburkan arpeggio.',
    why: 'Width 0,72 dan pelat 20% ruang 35%. 8 kHz +1,1 dB, 2,8 kHz +0,5 dB, low shelf +4,1 dB di 116 Hz supaya kick tetap terdengar di bawah pad.',
    tag: 'FAST',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.2,
        reverbRoom: 0.35,
        reverbDamp: 0.5,
        width: 0.72,
        air: 0.28,
        presence: 0.2,
        bass: 0.2,
        bassFreq: 0.3,
        sub: 0.12,
        fadeIn: 0.2,
        fadeOut: 1.2,
      });
    },
  },
  {
    id: 'malam_berputar',
    owner: true,
    name: 'MALAM BERPUTAR',
    tagline: '8D pelan · headphone',
    detail:
      '8D untuk headphone malam: satu putaran sekitar 14 detik, kedalaman sedang, pelat tipis. Suara berjalan mengelilingi kepala, bukan berputar panik.',
    why: '0,07 Hz = satu putaran ±14 detik: cukup lambat agar tidak memicu pusing. Depth 0,5 dengan kompensasi level dari mesin orbit, pelat 20%. Jangan dipakai di speaker mono.',
    tag: 'SPACE',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
        spatial8d: true,
        spinRate: 0.07,
        depth: 0.5,
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.2,
        reverbRoom: 0.3,
        reverbDamp: 0.5,
        width: 0.75,
        air: 0.15,
        fadeIn: 0.4,
        fadeOut: 2.0,
      });
    },
  },
  {
    id: 'kaset_senja',
    owner: true,
    name: 'KASET SENJA',
    tagline: 'Tape · 5 kHz · empuk',
    detail:
      'Kaset pita yang sudah diputar ratusan kali: tempo 8% lebih lambat, ujung atas hilang di 5 kHz, dan saturasi yang membuat drum terasa empuk.',
    why: '0,92× = −1,44 semitone, karakter tape yang jujur. Low-pass 0,30 → 5,0 kHz adalah batas pitanya. Warmth 40% menambah harmonisa; width 0,46 menyempitkan stereo seperti kaset.',
    tag: 'RETRO',
    accent: 'amber',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.92,
        speedMode: 'retro',
        lowpass: 0.3,
        warmth: 0.4,
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.12,
        reverbRoom: 0.25,
        reverbDamp: 0.7,
        width: 0.46,
        fadeIn: 0.25,
        fadeOut: 1.4,
      });
    },
  },
  {
    id: 'radio_am',
    owner: true,
    name: 'RADIO AM',
    tagline: 'Pita 2 kHz · hampir mono',
    detail:
      'Siaran radio AM jadul: pita 2 kHz, saturasi tebal, hampir mono. Untuk intro, vokal telepon, atau efek siaran tengah malam.',
    why: 'Low-pass 0,50 → 2,0 kHz adalah batas pita AM. Warmth 55% membuatnya padat, width 0,40 mendekati mono seperti pemancar AM, 2,8 kHz +0,5 dB supaya kata masih tertangkap.',
    tag: 'RETRO',
    accent: 'ink',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.98,
        speedMode: 'retro',
        lowpass: 0.5,
        warmth: 0.55,
        clarity: 0.4,
        presence: 0.2,
        bass: 0.1,
        bassFreq: 0.2,
        width: 0.4,
        fadeIn: 0.3,
        fadeOut: 0.8,
      });
    },
  },
  {
    id: 'mahakarya',
    owner: true,
    name: 'MAHAKARYA',
    tagline: 'Preset utama edisi owner',
    detail:
      'Preset utama: tempo 0,9×, pelat sedang, 8D tipis, low-end mono, dan tiga koreksi kecil. Dibuat untuk didengar berulang, bukan untuk mengejutkan sekali.',
    why: '0,90× = −1,82 semitone. Pelat 26% ruang 42% redam 40%; 8D hanya 0,05 Hz depth 0,28 (gerak halus). 680 Hz −0,8 dB, 2,8 kHz +0,4 dB, 8 kHz +0,56 dB, mono bass 120 Hz, limiter terakhir.',
    tag: 'SIGNATURE',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.9,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.26,
        reverbRoom: 0.42,
        reverbDamp: 0.4,
        spatial8d: true,
        spinRate: 0.05,
        depth: 0.28,
        bass: 0.2,
        bassFreq: 0.4,
        sub: 0.16,
        clarity: 0.32,
        presence: 0.16,
        air: 0.14,
        warmth: 0.16,
        monoBass: true,
        width: 0.64,
        fadeIn: 0.2,
        fadeOut: 2.2,
      });
    },
  },
  {
    id: 'aegis_prime',
    owner: true,
    name: 'AEGIS PRIME',
    tagline: 'Pitch utuh · −11 LUFS',
    detail:
      'Master pitch-locked: tempo 4% lebih lambat tapi nada tetap, de-esser aktif di target keras, stereo lebar. Terdengar mahal tanpa diubah nadanya.',
    why: 'Mode modern: −4% tempo, pitch utuh. Target −11 LUFS membuat sibilance lebih menonjol, jadi de-esser dinyalakan. 8 kHz +0,8 dB, 680 Hz −0,75 dB, sub +2,85 dB di 55 Hz, pelat 18%.',
    tag: 'SIGNATURE',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.96,
        speedMode: 'modern',
        clarity: 0.3,
        presence: 0.2,
        air: 0.2,
        bass: 0.2,
        bassFreq: 0.35,
        sub: 0.18,
        warmth: 0.12,
        deEsser: true,
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.18,
        reverbRoom: 0.3,
        reverbDamp: 0.5,
        width: 0.66,
        target: 'loud',
        fadeIn: 0.2,
        fadeOut: 1.8,
      });
    },
  },
  // ---------------------------------------------------------------------
  // KINO — sepuluh preset untuk satu lagu, semuanya slowed + reverb.
  //
  // Sumber: "Kino — Спокойная ночь [Outro Loop]" (Taivas edit), opus 48 kHz,
  // 8:56, 132 kbps. Diukur di runner dengan ffmpeg + numpy:
  //   integrated −11,4 LUFS · LRA 2,0 dB · true peak +0,7 dBTP (berkasnya clip)
  //   energi band: sub −11,6 · bass −8,3 · low-mid 250–500 −6,9 · mid −5,9
  //                presence 2–4k −12,0 · brilliance 4–8k −20,0 · air −27,9 dB
  //   centroid 2335 Hz · 85% energi di bawah 1,26 kHz · energi samping 11%
  //   tempo ≈100 BPM
  //
  // Aturan yang dipegang kesepuluh preset ini:
  //   * speed selalu < 1 (slowed), reverb selalu nyala,
  //   * 8D hanya di satu preset (BERPUTAR) — sisanya stereo biasa,
  //   * mono bass selalu nyala: sub −11,6 dB pada citra stereo 11%,
  //   * tidak ada yang menambah loudness di atas sumbernya; target −14 LUFS
  //     justru menurunkan 2,6 dB dan mengembalikan headroom dari kliping +0,7,
  //   * ujung atas diangkat karena berkas ini kehilangan 27,9 dB di 8–16 kHz.
  // ---------------------------------------------------------------------
  {
    id: 'kino_malam_lambat',
    family: 'kino',
    owner: true,
    name: 'MALAM LAMBAT',
    tagline: '0,90× tape · hall sedang',
    detail:
      'Titik awal yang aman: tempo 10% lebih lambat dengan nada ikut turun, hall sedang yang tidak menenggelamkan vokal, dan ujung atas dibuka sedikit.',
    why: '0,90× resample = −1,82 semitone, karakter tape. Hall 30% ruang 55% redam 40% memberi ekor ±2,4 detik. 680 Hz −0,9 dB (band low-mid −6,9 dB adalah yang terkuat), 2,8 kHz +0,5 dB, 8 kHz +1,4 dB dari air −27,9 dB. Mono bass 120 Hz, target −14 LUFS.',
    tag: 'SLOW',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.9,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.3,
        reverbRoom: 0.55,
        reverbDamp: 0.4,
        clarity: 0.36,
        presence: 0.2,
        air: 0.35,
        monoBass: true,
        width: 0.66,
        target: 'streaming',
        fadeIn: 0.25,
        fadeOut: 2.5,
      });
    },
  },
  {
    id: 'kino_udara_malam',
    family: 'kino',
    owner: true,
    name: 'UDARA MALAM',
    tagline: '0,94× · katedral terang',
    detail:
      'Slowed paling ringan di sini, tapi ruangnya paling besar: katedral terang, ujung atas diangkat 2,2 dB, de-esser menjaga huruf S.',
    why: '0,94× = −1,07 semitone. Katedral 26% ruang 80% redam 25% (ekor ±4,5 detik, tetap terang). 8 kHz +2,2 dB menambal air −27,9 dB; de-esser nyala karena mengangkat 8 kHz di master −11,4 LUFS membuat sibilance menonjol. Mono bass 120 Hz, target −14 LUFS.',
    tag: 'SPACE',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.94,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'cathedral',
        reverbLevel: 0.26,
        reverbRoom: 0.8,
        reverbDamp: 0.25,
        clarity: 0.4,
        presence: 0.3,
        air: 0.55,
        deEsser: true,
        monoBass: true,
        width: 0.7,
        target: 'streaming',
        fadeIn: 0.4,
        fadeOut: 3.0,
      });
    },
  },
  {
    id: 'kino_kamar_kecil',
    family: 'kino',
    owner: true,
    name: 'KAMAR KECIL',
    tagline: '0,88× · chamber dekat',
    detail:
      'Slowed yang terasa dekat, bukan besar: ruang kecil, saturasi tipis, ujung atas dipangkas. Seperti mendengar dari kamar sebelah.',
    why: '0,88× = −2,21 semitone. Chamber 24% ruang 32% redam 60% = ekor ±0,8 detik, jadi tempo yang turun tidak jadi kabur. Saturasi 0,22, low-pass 0,10 → 12,6 kHz (membuang desis opus), 680 Hz −0,7 dB, mono bass 120 Hz, target −14 LUFS.',
    tag: 'SLOW',
    accent: 'amber',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.88,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'chamber',
        reverbLevel: 0.24,
        reverbRoom: 0.32,
        reverbDamp: 0.6,
        clarity: 0.28,
        presence: 0.18,
        air: 0.25,
        warmth: 0.22,
        lowpass: 0.1,
        monoBass: true,
        width: 0.58,
        target: 'streaming',
        fadeIn: 0.2,
        fadeOut: 2.0,
      });
    },
  },
  {
    id: 'kino_pelat_panjang',
    family: 'kino',
    owner: true,
    name: 'PELAT PANJANG',
    tagline: '0,92× · plate 38%',
    detail:
      'Pelat logam panjang yang membuat vokal seolah memantul di ruang beton. Tempo 8% lebih lambat, stereo paling lebar setelah 8D.',
    why: '0,92× = −1,44 semitone. Plate 38% ruang 66% redam 35% (ekor ±3,2 detik). 680 Hz −1,0 dB supaya pantulan low-mid tidak menumpuk, 2,8 kHz +0,6 dB, 8 kHz +1,6 dB, width 0,72 dari citra 11%. Mono bass 120 Hz, target −14 LUFS.',
    tag: 'SPACE',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.92,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.38,
        reverbRoom: 0.66,
        reverbDamp: 0.35,
        clarity: 0.42,
        presence: 0.24,
        air: 0.4,
        monoBass: true,
        width: 0.72,
        target: 'streaming',
        fadeIn: 0.3,
        fadeOut: 3.0,
      });
    },
  },
  {
    id: 'kino_katedral',
    family: 'kino',
    owner: true,
    name: 'KATEDRAL',
    tagline: '0,84× · ekor 6 detik',
    detail:
      'Versi paling megah: tempo 16% lebih lambat, katedral batu dengan ekor panjang, fade masuk dan keluar panjang. Untuk didengar dengan headphone di ruangan gelap.',
    why: '0,84× = −3,02 semitone. Katedral 40% ruang 92% redam 20% = ekor ±6 detik. Fade 0,6 detik masuk dan 3,5 detik keluar supaya ekor tidak terpotong keras. 680 Hz −0,9 dB, 8 kHz +1,3 dB, mono bass 120 Hz, target −14 LUFS.',
    tag: 'SPACE',
    accent: 'ink',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.84,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'cathedral',
        reverbLevel: 0.4,
        reverbRoom: 0.92,
        reverbDamp: 0.2,
        clarity: 0.35,
        presence: 0.2,
        air: 0.32,
        monoBass: true,
        width: 0.68,
        target: 'streaming',
        fadeIn: 0.6,
        fadeOut: 3.5,
      });
    },
  },
  {
    id: 'kino_sub_tenang',
    family: 'kino',
    owner: true,
    name: 'SUB TENANG',
    tagline: '0,86× · bass dalam, mono',
    detail:
      'Slowed dengan bobot: low-end diangkat 4,1 dB di 110 Hz dan 3,4 dB di 55 Hz, lalu dikunci mono supaya sub tidak hilang di speaker mana pun.',
    why: '0,86× = −2,59 semitone. Low shelf +4,1 dB di 110 Hz, sub +3,4 dB di 55 Hz — sumbernya sudah −11,6 dB di sub, jadi masih ada ruang. Mono bass 120 Hz wajib. Hall 22% ruang 45% redam 50% menjaga ekor tetap pendek agar bass tidak jadi lumpur. Target −14 LUFS.',
    tag: 'BASS',
    accent: 'amber',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.86,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.22,
        reverbRoom: 0.45,
        reverbDamp: 0.5,
        bass: 0.2,
        bassFreq: 0.25,
        sub: 0.22,
        clarity: 0.34,
        presence: 0.16,
        air: 0.3,
        monoBass: true,
        width: 0.6,
        target: 'streaming',
        fadeIn: 0.3,
        fadeOut: 2.5,
      });
    },
  },
  {
    id: 'kino_pelan_sekali',
    family: 'kino',
    owner: true,
    name: 'PELAN SEKALI',
    tagline: '0,78× · hall 82%',
    detail:
      'Slowed paling lambat: tempo tinggal 78%, hall lebar, dan tarikan napas antar frasa jadi bagian dari lagunya. Bukan untuk didengar cepat.',
    why: '0,78× = −4,30 semitone. Hall 42% ruang 82% redam 30% = ekor ±3,5 detik; di tempo ini ekor terasa dua kali lebih panjang. 680 Hz −0,9 dB, 2,8 kHz +0,4 dB, 8 kHz +1,2 dB, mono bass 120 Hz, target −14 LUFS, fade 0,5/3 detik.',
    tag: 'SLOW',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.78,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'hall',
        reverbLevel: 0.42,
        reverbRoom: 0.82,
        reverbDamp: 0.3,
        clarity: 0.35,
        presence: 0.16,
        air: 0.3,
        monoBass: true,
        width: 0.7,
        target: 'streaming',
        fadeIn: 0.5,
        fadeOut: 3.0,
      });
    },
  },
  {
    id: 'kino_berputar',
    family: 'kino',
    owner: true,
    name: 'BERPUTAR',
    tagline: 'satu-satunya 8D · 0,90×',
    detail:
      'Satu-satunya preset 8D di rak ini. Suara berjalan mengelilingi kepala satu putaran ±18 detik, dengan pelat tipis di belakangnya. Khusus headphone.',
    why: '0,90× = −1,82 semitone. 8D 0,055 Hz = satu putaran ±18 detik; depth 0,35 dengan kompensasi level dari mesin orbit, jadi tidak ada sisi yang hilang. Pelat 24% ruang 40% redam 45% mengisi belakang. 8 kHz +1,5 dB, mono bass 120 Hz, target −14 LUFS. Jangan dipakai di speaker mono.',
    tag: 'SPACE',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.9,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.24,
        reverbRoom: 0.4,
        reverbDamp: 0.45,
        spatial8d: true,
        spinRate: 0.055,
        depth: 0.35,
        clarity: 0.36,
        presence: 0.2,
        air: 0.38,
        monoBass: true,
        width: 0.75,
        target: 'streaming',
        fadeIn: 0.4,
        fadeOut: 2.8,
      });
    },
  },
  {
    id: 'kino_hangat_pita',
    family: 'kino',
    owner: true,
    name: 'HANGAT PITA',
    tagline: '0,92× · saturasi · 9 kHz',
    detail:
      'Slowed dengan tekstur pita: saturasi 35%, ujung atas ditutup di 9 kHz, dan pelat pendek. Hangat, bukan gelap — sumbernya sudah gelap, jadi ini soal tekstur.',
    why: '0,92× = −1,44 semitone. Saturasi 0,35 menambah harmonisa tanpa menggerus transient. Low-pass 0,15 → 9 kHz: opus 132 kbps tidak menyimpan apa pun di atas itu, memotongnya mencegah artefak codec ikut terangkat. Pelat 20% ruang 34% redam 65%, mono bass 120 Hz, target −14 LUFS.',
    tag: 'RETRO',
    accent: 'amber',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.92,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'plate',
        reverbLevel: 0.2,
        reverbRoom: 0.34,
        reverbDamp: 0.65,
        warmth: 0.35,
        lowpass: 0.15,
        clarity: 0.3,
        presence: 0.18,
        air: 0.15,
        monoBass: true,
        width: 0.56,
        target: 'streaming',
        fadeIn: 0.25,
        fadeOut: 2.2,
      });
    },
  },
  {
    id: 'kino_dekat_telinga',
    family: 'kino',
    owner: true,
    name: 'DEKAT DI TELINGA',
    tagline: '0,96× · chamber 16%',
    detail:
      'Slowed paling halus: tempo hanya 4% lebih lambat, ruang sangat kecil, vokal terdengar 30 cm dari telinga. Untuk mendengar liriknya, bukan suasananya.',
    why: '0,96× = −0,71 semitone, hampir tidak terasa melambat. Chamber 16% ruang 24% redam 70% = ekor ±0,5 detik. 680 Hz −1,1 dB, 2,8 kHz +0,9 dB, 8 kHz +0,8 dB, de-esser nyala, width 0,5 (hampir mono seperti rekaman vokal dekat), mono bass 120 Hz, target −14 LUFS.',
    tag: 'SIGNATURE',
    accent: 'signal',
    apply: (s) => {
      Object.assign(s, {
        speed: 0.96,
        speedMode: 'retro',
        reverbEnabled: true,
        reverbType: 'chamber',
        reverbLevel: 0.16,
        reverbRoom: 0.24,
        reverbDamp: 0.7,
        clarity: 0.45,
        presence: 0.38,
        air: 0.3,
        deEsser: true,
        monoBass: true,
        width: 0.5,
        target: 'streaming',
        fadeIn: 0.15,
        fadeOut: 1.5,
      });
    },
  },
];

export const presetById = (id: string | null | undefined): Preset | undefined =>
  id ? PRESETS.find((p) => p.id === id) : undefined;

export const presetByName = (name: string | null | undefined): Preset | undefined =>
  name ? PRESETS.find((p) => p.name === name) : undefined;

/** The shelf a preset belongs to. Kino is never mixed into the general list. */
export const familyOf = (preset: Preset): 'kino' | 'owner' | 'classic' =>
  preset.family ?? (preset.owner ? 'owner' : 'classic');

export const KINO_PRESETS = PRESETS.filter((p) => familyOf(p) === 'kino');

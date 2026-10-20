import type { EditSettings } from './settings';

export type PresetTag = 'SLOW' | 'FAST' | 'BASS' | 'SPACE' | 'REPAIR' | 'SIGNATURE';
export type PresetAccent = 'cobalt' | 'crimson' | 'amber' | 'signal' | 'ink';

export interface Preset {
  id: string;
  name: string;
  tagline: string;
  detail: string;
  tag: PresetTag;
  accent: PresetAccent;
  apply: (s: EditSettings) => void;
}

/**
 * The 14 curated presets, ported 1:1 from the Python engine that was validated
 * against FFmpeg (14/14 pass: −14…−16 LUFS, true peak ≤ −1 dBFS, no NaN).
 */
export const PRESETS: Preset[] = [
  {
    id: 'night_shift',
    name: 'NIGHT SHIFT',
    tagline: 'Slowed · hall · warm tape',
    detail: '0.84× tape slowdown into a wide hall with a soft top end. The default late-night listen.',
    tag: 'SLOW',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
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
    tag: 'SPACE',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
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
    tag: 'SPACE',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
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
    name: 'BASS FORGE',
    tagline: 'Low end · club master',
    detail: 'Straight tempo, maximum low-end reinforcement. Built for subwoofers.',
    tag: 'BASS',
    accent: 'amber',
    apply: (s) => {
      Object.assign(s, {
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
    tag: 'BASS',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
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
    tag: 'FAST',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
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
    tag: 'SLOW',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
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
    tag: 'BASS',
    accent: 'cobalt',
    apply: (s) => {
      Object.assign(s, {
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
    tag: 'SIGNATURE',
    accent: 'crimson',
    apply: (s) => {
      Object.assign(s, {
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
];

export const presetById = (id: string | null | undefined): Preset | undefined =>
  id ? PRESETS.find((p) => p.id === id) : undefined;

export const presetByName = (name: string | null | undefined): Preset | undefined =>
  name ? PRESETS.find((p) => p.name === name) : undefined;

import type { LoudnessTarget, OutputFormat } from './settings';

/**
 * Plan matrix.
 *
 * The free tier has to be genuinely useful — the DSP is the product, so it is
 * never crippled. What is paid is the *workflow*: the full preset arsenal, the
 * delivery formats professionals actually ask for, repair tools, the 8D engine,
 * A/B comparison and unlimited history. Export length is capped so a free key
 * cannot be resold as a render farm.
 */

export type Tier = 'free' | 'pro' | 'admin';

export interface Plan {
  id: Tier;
  label: string;
  price: string;
  cadence: string;
  tagline: string;
  perks: string[];
  limits: { maxMinutes: number; history: number };
  presets: string[];
  formats: OutputFormat[];
  targets: LoudnessTarget[];
  features: Record<Feature, boolean>;
}

export type Feature =
  | 'orbit8d'
  | 'repair'
  | 'abMemory'
  | 'presetExport'
  | 'batchQueue'
  | 'allPresets'
  | 'lossless'
  | 'clubTarget';

const FREE_PRESETS = ['night_shift', 'neon_nightcore', 'signal_clean', 'club_ready'];

/** Every key the arsenal ships. Kept as a list so a new preset is gated by default. */
export const ALL_PRESET_IDS = [
  'night_shift',
  'neon_nightcore',
  'deep_orbit',
  'void_drift',
  'bass_forge',
  'orbit_8d',
  'phonk_protocol',
  'liquid_drum',
  'submerged',
  'glass_cathedral',
  'tape_memory',
  'signal_clean',
  'club_ready',
  'mecha_protocol',
];

export const PLANS: Record<Tier, Plan> = {
  free: {
    id: 'free',
    label: 'FREE',
    price: 'Rp 0',
    cadence: 'selamanya',
    tagline: 'Rantai DSP penuh, tanpa batas kualitas',
    perks: [
      '4 preset pilihan',
      'MP3 320 kbps + WAV 16-bit',
      'Target −14 LUFS',
      'Export sampai 12 menit',
      'Riwayat 3 export terakhir',
    ],
    limits: { maxMinutes: 12, history: 3 },
    presets: FREE_PRESETS,
    formats: ['mp3', 'wav16'],
    targets: ['off', 'streaming'],
    features: {
      orbit8d: false,
      repair: false,
      abMemory: false,
      presetExport: false,
      batchQueue: false,
      allPresets: false,
      lossless: false,
      clubTarget: false,
    },
  },
  pro: {
    id: 'pro',
    label: 'PRO',
    price: 'Rp 79.000',
    cadence: 'per tahun',
    tagline: 'Seluruh arsenal, semua format, tanpa batas',
    perks: [
      '14 preset tervalidasi',
      'MP3 · WAV 16/24/32 · FLAC',
      'Semua target −16…−9 LUFS',
      '8D orbit engine',
      'Repair: denoise + voice focus',
      'A/B memory + riwayat penuh',
      'Export tanpa batas durasi',
    ],
    limits: { maxMinutes: Infinity, history: Infinity },
    presets: ALL_PRESET_IDS,
    formats: ['mp3', 'wav16', 'wav24', 'wav32', 'flac'],
    targets: ['off', 'podcast', 'streaming', 'loud', 'club'],
    features: {
      orbit8d: true,
      repair: true,
      abMemory: true,
      presetExport: true,
      batchQueue: true,
      allPresets: true,
      lossless: true,
      clubTarget: true,
    },
  },
  admin: {
    id: 'admin',
    label: 'ADMIN',
    price: '—',
    cadence: 'internal',
    tagline: 'Akses penuh + konsol kontrol',
    perks: ['Semua fitur PRO', 'Konsol kontrol', 'Generator lisensi', 'Feed CSP live'],
    limits: { maxMinutes: Infinity, history: Infinity },
    presets: ALL_PRESET_IDS,
    formats: ['mp3', 'wav16', 'wav24', 'wav32', 'flac'],
    targets: ['off', 'podcast', 'streaming', 'loud', 'club'],
    features: {
      orbit8d: true,
      repair: true,
      abMemory: true,
      presetExport: true,
      batchQueue: true,
      allPresets: true,
      lossless: true,
      clubTarget: true,
    },
  },
};

export function planFor(tier: Tier): Plan {
  return PLANS[tier] ?? PLANS.free;
}

export function can(tier: Tier, feature: Feature): boolean {
  return planFor(tier).features[feature] ?? false;
}

export function presetAllowed(tier: Tier, presetId: string): boolean {
  return planFor(tier).presets.includes(presetId);
}

export function formatAllowed(tier: Tier, format: OutputFormat): boolean {
  return planFor(tier).formats.includes(format);
}

export function targetAllowed(tier: Tier, target: LoudnessTarget): boolean {
  return planFor(tier).targets.includes(target);
}

export function isPro(tier: Tier): boolean {
  return tier === 'pro' || tier === 'admin';
}

/** Human label for the paywall copy. */
export function upgradeHint(feature: string): string {
  const map: Record<string, string> = {
    preset: 'Preset ini bagian dari arsenal PRO.',
    format: 'Format lossless tersedia di PRO.',
    target: 'Target loudness ini khusus PRO.',
    orbit8d: '8D orbit engine khusus PRO.',
    repair: 'Repair & denoise khusus PRO.',
    abMemory: 'A/B memory khusus PRO.',
    limit: 'Durasi export gratis dibatasi 12 menit.',
    history: 'Riwayat lebih dari 3 export khusus PRO.',
  };
  return map[feature] ?? 'Fitur ini khusus PRO.';
}

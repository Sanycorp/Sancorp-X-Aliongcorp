export type SpeedMode = 'retro' | 'modern';
export type ReverbType = 'hall' | 'plate' | 'chamber' | 'cathedral';
export type LoudnessTarget = 'off' | 'podcast' | 'streaming' | 'loud' | 'club';
export type OutputFormat = 'mp3' | 'wav16' | 'wav24' | 'wav32' | 'flac';

export interface EditSettings {
  speed: number;
  speedMode: SpeedMode;

  trimStart: number;
  trimEnd: number; // 0 = end of file
  fadeIn: number;
  fadeOut: number;

  reverbEnabled: boolean;
  reverbType: ReverbType;
  reverbLevel: number;
  reverbRoom: number;
  reverbDamp: number;

  spatial8d: boolean;
  spinRate: number;
  depth: number;
  width: number;

  bass: number;
  bassFreq: number;
  sub: number;
  clarity: number;
  presence: number;
  air: number;
  lowpass: number;

  warmth: number;
  deEsser: boolean;
  monoBass: boolean;

  denoise: boolean;
  denoiseAmount: number;
  voiceMode: boolean;

  finalGain: number;
  target: LoudnessTarget;
  normalizeInput: boolean;

  format: OutputFormat;
  bitrate: number;

  activePreset: string | null;
}

export const NEUTRAL: EditSettings = {
  speed: 1,
  speedMode: 'retro',
  trimStart: 0,
  trimEnd: 0,
  fadeIn: 0,
  fadeOut: 0,
  reverbEnabled: false,
  reverbType: 'hall',
  reverbLevel: 0.4,
  reverbRoom: 0.5,
  reverbDamp: 0.3,
  spatial8d: false,
  spinRate: 0.125,
  depth: 0.6,
  width: 0.5,
  bass: 0,
  bassFreq: 0.5,
  sub: 0,
  clarity: 0,
  presence: 0,
  air: 0,
  lowpass: 0,
  warmth: 0,
  deEsser: false,
  monoBass: false,
  denoise: false,
  denoiseAmount: 0.5,
  voiceMode: false,
  finalGain: 1,
  target: 'streaming',
  normalizeInput: false,
  format: 'mp3',
  bitrate: 320,
  activePreset: null,
};

export interface SourceInfo {
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  size: number;
}

export interface AppSettings {
  finish: 'armor' | 'cockpit';
  reduceMotion: boolean;
  haptics: boolean;
  format: OutputFormat;
  bitrate: number;
  target: LoudnessTarget;
  shareAfterExport: boolean;
  keepHistory: boolean;
  analystMode: boolean;
}

export const APP_DEFAULTS: AppSettings = {
  finish: 'armor',
  reduceMotion: false,
  haptics: true,
  format: 'mp3',
  bitrate: 320,
  target: 'streaming',
  shareAfterExport: false,
  keepHistory: true,
  analystMode: false,
};

export const FORMAT_META: Record<
  OutputFormat,
  { label: string; ext: string; spec: string; lossy: boolean; mime: string; note: string }
> = {
  mp3: {
    label: 'MP3',
    ext: 'mp3',
    spec: '320K',
    lossy: true,
    mime: 'audio/mpeg',
    note: 'Universal — plays everywhere.',
  },
  wav16: {
    label: 'WAV 16',
    ext: 'wav',
    spec: '44.1/48K',
    lossy: false,
    mime: 'audio/wav',
    note: 'CD-depth, smallest lossless file.',
  },
  wav24: {
    label: 'WAV 24',
    ext: 'wav',
    spec: '24-BIT',
    lossy: false,
    mime: 'audio/wav',
    note: 'Master depth for further editing.',
  },
  wav32: {
    label: 'WAV 32F',
    ext: 'wav',
    spec: 'FLOAT',
    lossy: false,
    mime: 'audio/wav',
    note: 'Unclipped float master.',
  },
  flac: {
    label: 'FLAC',
    ext: 'flac',
    spec: 'LOSSLESS',
    lossy: false,
    mime: 'audio/flac',
    note: 'Bit-perfect 24-bit, siap untuk arsip dan editing lanjut.',
  },
};

export const TARGET_META: Record<
  LoudnessTarget,
  { label: string; hint: string; lufs: number | null }
> = {
  off: { label: 'OFF', hint: 'No normalisation — keep the source level.', lufs: null },
  podcast: { label: '-16', hint: 'Spoken word / podcast standard.', lufs: -16 },
  streaming: { label: '-14', hint: 'Spotify / Apple / YouTube reference.', lufs: -14 },
  loud: { label: '-11', hint: 'Louder master, still true-peak safe.', lufs: -11 },
  club: { label: '-9', hint: 'Maximum competitive level for clubs.', lufs: -9 },
};

export const SPEED_MODE_META: Record<SpeedMode, { label: string; hint: string }> = {
  retro: {
    label: 'RETRO',
    hint: 'Pitch follows speed — classic slowed / nightcore tape character.',
  },
  modern: {
    label: 'MODERN',
    hint: 'Pitch stays put (WSOLA time-stretch) — clean DJ-style tempo change.',
  },
};

export const SPACE_META: Record<ReverbType, { label: string; hint: string }> = {
  hall: { label: 'HALL', hint: 'Wide concert space, 1.4–4.2 s decay.' },
  plate: { label: 'PLATE', hint: 'Bright studio plate — tight and modern.' },
  chamber: { label: 'CHAMBER', hint: 'Small wooden room, dense reflections.' },
  cathedral: { label: 'CATHEDRAL', hint: 'Huge stone space, up to 6 s decay.' },
};

export function cloneSettings(s: EditSettings): EditSettings {
  return { ...s };
}

export function neutralSettings(keep?: Partial<EditSettings>): EditSettings {
  return { ...NEUTRAL, ...keep };
}

export function effectiveEnd(s: EditSettings, duration: number): number {
  if (s.trimEnd <= 0.05) return duration;
  return Math.min(s.trimEnd, duration);
}

export function sourceWindow(s: EditSettings, duration: number): number {
  return Math.max(0, effectiveEnd(s, duration) - s.trimStart);
}

export function processedDuration(s: EditSettings, duration: number): number {
  const w = sourceWindow(s, duration);
  return s.speed > 0 ? w / s.speed : w;
}

export function isNeutral(s: EditSettings): boolean {
  const keys: (keyof EditSettings)[] = [
    'speed', 'reverbEnabled', 'spatial8d', 'bass', 'sub', 'clarity', 'presence', 'air',
    'lowpass', 'warmth', 'deEsser', 'monoBass', 'denoise', 'voiceMode', 'finalGain',
    'fadeIn', 'fadeOut',
  ];
  return keys.every((k) => {
    const v = s[k];
    if (typeof v === 'boolean') return v === false;
    if (typeof v === 'number') return k === 'speed' || k === 'finalGain' ? v === 1 : v === 0;
    return true;
  });
}

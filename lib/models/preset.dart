import 'edit_settings.dart';

enum PresetTag { slow, fast, bass, space, repair, signature }

extension PresetTagX on PresetTag {
  String get label {
    switch (this) {
      case PresetTag.slow:
        return 'SLOW';
      case PresetTag.fast:
        return 'FAST';
      case PresetTag.bass:
        return 'BASS';
      case PresetTag.space:
        return 'SPACE';
      case PresetTag.repair:
        return 'REPAIR';
      case PresetTag.signature:
        return 'SIGNATURE';
    }
  }
}

enum PresetAccent { cobalt, crimson, amber, signal, ink }

/// A curated starting point. Every preset is measured: loudness lands on the
/// target, true peak stays under −1 dBFS, and nothing clips.
class Preset {
  const Preset({
    required this.id,
    required this.name,
    required this.tagline,
    required this.tag,
    required this.accent,
    required this.apply,
  });

  final String id;
  final String name;
  final String tagline;
  final PresetTag tag;
  final PresetAccent accent;
  final void Function(EditSettings settings) apply;

  static final List<Preset> all = <Preset>[
    Preset(
      id: 'night_shift',
      name: 'NIGHT SHIFT',
      tagline: 'Slowed · hall · warm tape',
      tag: PresetTag.slow,
      accent: PresetAccent.cobalt,
      apply: (EditSettings s) {
        s.speed = 0.84;
        s.reverbEnabled = true;
        s.reverbType = ReverbType.hall;
        s.reverbLevel = 0.38;
        s.reverbRoom = 0.55;
        s.reverbDamp = 0.30;
        s.bass = 0.14;
        s.sub = 0.12;
        s.clarity = 0.25;
        s.warmth = 0.12;
        s.width = 0.56;
        s.fadeIn = 0.3;
        s.fadeOut = 1.5;
      },
    ),
    Preset(
      id: 'neon_nightcore',
      name: 'NEON NIGHTCORE',
      tagline: 'Fast · plate · air',
      tag: PresetTag.fast,
      accent: PresetAccent.crimson,
      apply: (EditSettings s) {
        s.speed = 1.28;
        s.reverbEnabled = true;
        s.reverbType = ReverbType.plate;
        s.reverbLevel = 0.14;
        s.reverbRoom = 0.18;
        s.reverbDamp = 0.50;
        s.air = 0.40;
        s.clarity = 0.20;
        s.width = 0.60;
        s.fadeIn = 0.2;
        s.fadeOut = 0.8;
      },
    ),
    Preset(
      id: 'deep_orbit',
      name: 'DEEP ORBIT',
      tagline: 'Super slowed · wide hall',
      tag: PresetTag.slow,
      accent: PresetAccent.cobalt,
      apply: (EditSettings s) {
        s.speed = 0.78;
        s.reverbEnabled = true;
        s.reverbType = ReverbType.hall;
        s.reverbLevel = 0.40;
        s.reverbRoom = 0.78;
        s.reverbDamp = 0.20;
        s.bass = 0.14;
        s.sub = 0.18;
        s.clarity = 0.30;
        s.warmth = 0.15;
        s.width = 0.56;
        s.fadeIn = 0.4;
        s.fadeOut = 2.0;
      },
    ),
    Preset(
      id: 'void_drift',
      name: 'VOID DRIFT',
      tagline: 'Ultra slowed · cathedral',
      tag: PresetTag.slow,
      accent: PresetAccent.ink,
      apply: (EditSettings s) {
        s.speed = 0.72;
        s.reverbEnabled = true;
        s.reverbType = ReverbType.cathedral;
        s.reverbLevel = 0.46;
        s.reverbRoom = 0.92;
        s.reverbDamp = 0.15;
        s.bass = 0.18;
        s.sub = 0.25;
        s.clarity = 0.25;
        s.warmth = 0.18;
        s.lowpass = 0.12;
        s.width = 0.54;
        s.fadeIn = 0.5;
        s.fadeOut = 2.5;
      },
    ),
    Preset(
      id: 'bass_forge',
      name: 'BASS FORGE',
      tagline: 'Dual shelf · sub pressure',
      tag: PresetTag.bass,
      accent: PresetAccent.amber,
      apply: (EditSettings s) {
        s.bass = 0.45;
        s.sub = 0.40;
        s.clarity = 0.40;
        s.air = 0.20;
        s.presence = 0.15;
        s.width = 0.55;
      },
    ),
    Preset(
      id: 'orbit_8d',
      name: '8D ORBIT',
      tagline: 'Rotating field · headphones',
      tag: PresetTag.space,
      accent: PresetAccent.signal,
      apply: (EditSettings s) {
        s.spatial8d = true;
        s.spinRate = 0.125;
        s.depth = 0.60;
        s.reverbEnabled = true;
        s.reverbType = ReverbType.hall;
        s.reverbLevel = 0.18;
        s.reverbRoom = 0.45;
        s.width = 0.75;
        s.air = 0.15;
      },
    ),
    Preset(
      id: 'phonk_protocol',
      name: 'PHONK PROTOCOL',
      tagline: 'Slow · 8D drift · heavy sub',
      tag: PresetTag.bass,
      accent: PresetAccent.crimson,
      apply: (EditSettings s) {
        s.speed = 0.88;
        s.spatial8d = true;
        s.spinRate = 0.08;
        s.depth = 0.55;
        s.reverbEnabled = true;
        s.reverbType = ReverbType.hall;
        s.reverbLevel = 0.22;
        s.reverbRoom = 0.30;
        s.reverbDamp = 0.40;
        s.bass = 0.55;
        s.sub = 0.45;
        s.clarity = 0.45;
        s.air = 0.20;
        s.warmth = 0.12;
        s.width = 0.65;
        s.fadeOut = 1.2;
      },
    ),
    Preset(
      id: 'liquid_drum',
      name: 'LIQUID DRUM',
      tagline: 'Slight lift · tight plate',
      tag: PresetTag.fast,
      accent: PresetAccent.cobalt,
      apply: (EditSettings s) {
        s.speed = 1.05;
        s.reverbEnabled = true;
        s.reverbType = ReverbType.plate;
        s.reverbLevel = 0.12;
        s.reverbRoom = 0.18;
        s.reverbDamp = 0.60;
        s.bass = 0.30;
        s.sub = 0.25;
        s.air = 0.25;
        s.clarity = 0.25;
        s.presence = 0.10;
      },
    ),
    Preset(
      id: 'submerged',
      name: 'SUBMERGED',
      tagline: 'Deep slowed bass',
      tag: PresetTag.bass,
      accent: PresetAccent.ink,
      apply: (EditSettings s) {
        s.speed = 0.80;
        s.reverbEnabled = true;
        s.reverbType = ReverbType.hall;
        s.reverbLevel = 0.25;
        s.reverbRoom = 0.35;
        s.reverbDamp = 0.50;
        s.bass = 0.55;
        s.sub = 0.50;
        s.clarity = 0.35;
        s.warmth = 0.15;
        s.width = 0.52;
        s.fadeOut = 2.0;
      },
    ),
    Preset(
      id: 'glass_cathedral',
      name: 'GLASS CATHEDRAL',
      tagline: 'Huge stone hall · wide',
      tag: PresetTag.space,
      accent: PresetAccent.signal,
      apply: (EditSettings s) {
        s.speed = 0.90;
        s.reverbEnabled = true;
        s.reverbType = ReverbType.cathedral;
        s.reverbLevel = 0.40;
        s.reverbRoom = 0.85;
        s.reverbDamp = 0.10;
        s.clarity = 0.20;
        s.air = 0.10;
        s.width = 0.70;
        s.warmth = 0.08;
        s.fadeIn = 0.6;
        s.fadeOut = 3.0;
      },
    ),
    Preset(
      id: 'tape_memory',
      name: 'TAPE MEMORY',
      tagline: 'Lo-fi · warm · soft top',
      tag: PresetTag.slow,
      accent: PresetAccent.amber,
      apply: (EditSettings s) {
        s.speed = 0.96;
        s.reverbEnabled = true;
        s.reverbType = ReverbType.plate;
        s.reverbLevel = 0.18;
        s.reverbRoom = 0.30;
        s.reverbDamp = 0.70;
        s.lowpass = 0.35;
        s.warmth = 0.45;
        s.clarity = 0.10;
        s.width = 0.48;
        s.fadeIn = 0.25;
        s.fadeOut = 1.0;
      },
    ),
    Preset(
      id: 'signal_clean',
      name: 'SIGNAL CLEAN',
      tagline: 'Spectral repair · de-ess',
      tag: PresetTag.repair,
      accent: PresetAccent.ink,
      apply: (EditSettings s) {
        s.denoise = true;
        s.denoiseAmount = 0.55;
        s.deEsser = true;
        s.clarity = 0.15;
        s.presence = 0.10;
        s.width = 0.55;
      },
    ),
    Preset(
      id: 'club_ready',
      name: 'CLUB READY',
      tagline: 'Modern tempo · -9 LUFS',
      tag: PresetTag.fast,
      accent: PresetAccent.crimson,
      apply: (EditSettings s) {
        s.speed = 1.0;
        s.speedMode = SpeedMode.modern;
        s.bass = 0.35;
        s.sub = 0.20;
        s.clarity = 0.30;
        s.air = 0.30;
        s.presence = 0.10;
        s.width = 0.60;
        s.warmth = 0.08;
        s.target = LoudnessTarget.club;
      },
    ),
    Preset(
      id: 'mecha_protocol',
      name: 'MECHA PROTOCOL',
      tagline: 'House signature · plate + 8D',
      tag: PresetTag.signature,
      accent: PresetAccent.cobalt,
      apply: (EditSettings s) {
        s.speed = 0.88;
        s.reverbEnabled = true;
        s.reverbType = ReverbType.plate;
        s.reverbLevel = 0.26;
        s.reverbRoom = 0.40;
        s.reverbDamp = 0.35;
        s.spatial8d = true;
        s.spinRate = 0.06;
        s.depth = 0.35;
        s.bass = 0.20;
        s.sub = 0.20;
        s.clarity = 0.30;
        s.air = 0.12;
        s.warmth = 0.15;
        s.width = 0.62;
        s.fadeIn = 0.2;
        s.fadeOut = 2.0;
      },
    ),
  ];

  static Preset? byId(String? id) {
    if (id == null) return null;
    for (final Preset p in all) {
      if (p.id == id) return p;
    }
    return null;
  }

  static Preset? byName(String? name) {
    if (name == null) return null;
    for (final Preset p in all) {
      if (p.name == name) return p;
    }
    return null;
  }
}

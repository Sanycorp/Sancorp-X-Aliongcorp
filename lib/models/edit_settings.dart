/// AEGIS-M render settings + format matrix.
library;

enum SpeedMode {
  /// Rate shift: pitch drops/rises with the tempo (classic chopped & slowed).
  retro,

  /// Time-stretch: tempo changes, pitch preserved (modern nightcore/DJ).
  modern,
}

enum ReverbType { hall, plate, chamber, cathedral }

enum LoudnessTarget { off, podcast, streaming, loud, club }

enum OutputFormat { mp3, wav24, wav32, flac, m4a, alac, ogg, opus, wav }

extension SpeedModeX on SpeedMode {
  String get label => this == SpeedMode.retro ? 'RETRO' : 'MODERN';
  String get hint => this == SpeedMode.retro
      ? 'Pitch moves with speed — classic slowed / nightcore character.'
      : 'Pitch stays put — clean tempo change for DJ edits.';
}

extension ReverbTypeX on ReverbType {
  String get label {
    switch (this) {
      case ReverbType.hall:
        return 'HALL';
      case ReverbType.plate:
        return 'PLATE';
      case ReverbType.chamber:
        return 'CHAMBER';
      case ReverbType.cathedral:
        return 'CATHEDRAL';
    }
  }

  String get hint {
    switch (this) {
      case ReverbType.hall:
        return 'Wide concert space, 1.4–4.2 s decay.';
      case ReverbType.plate:
        return 'Bright studio plate — tight and modern.';
      case ReverbType.chamber:
        return 'Small wooden room, dense early reflections.';
      case ReverbType.cathedral:
        return 'Huge stone space, up to 6 s decay.';
    }
  }
}

extension LoudnessTargetX on LoudnessTarget {
  String get label {
    switch (this) {
      case LoudnessTarget.off:
        return 'OFF';
      case LoudnessTarget.podcast:
        return '-16';
      case LoudnessTarget.streaming:
        return '-14';
      case LoudnessTarget.loud:
        return '-11';
      case LoudnessTarget.club:
        return '-9';
    }
  }

  double? get lufs {
    switch (this) {
      case LoudnessTarget.off:
        return null;
      case LoudnessTarget.podcast:
        return -16.0;
      case LoudnessTarget.streaming:
        return -14.0;
      case LoudnessTarget.loud:
        return -11.0;
      case LoudnessTarget.club:
        return -9.0;
    }
  }

  String get hint {
    switch (this) {
      case LoudnessTarget.off:
        return 'No loudness normalisation — keep the source level.';
      case LoudnessTarget.podcast:
        return 'Spoken word / podcast standard.';
      case LoudnessTarget.streaming:
        return 'Spotify / Apple / YouTube reference level.';
      case LoudnessTarget.loud:
        return 'Louder master, still true-peak safe.';
      case LoudnessTarget.club:
        return 'Maximum competitive level for clubs.';
    }
  }
}

extension OutputFormatX on OutputFormat {
  String get label {
    switch (this) {
      case OutputFormat.mp3:
        return 'MP3';
      case OutputFormat.wav24:
        return 'WAV 24';
      case OutputFormat.wav32:
        return 'WAV 32F';
      case OutputFormat.flac:
        return 'FLAC';
      case OutputFormat.m4a:
        return 'M4A';
      case OutputFormat.alac:
        return 'ALAC';
      case OutputFormat.ogg:
        return 'OGG';
      case OutputFormat.opus:
        return 'OPUS';
      case OutputFormat.wav:
        return 'WAV 16';
    }
  }

  String get ext {
    switch (this) {
      case OutputFormat.opus:
        return 'opus';
      case OutputFormat.wav24:
      case OutputFormat.wav32:
      case OutputFormat.wav:
        return 'wav';
      case OutputFormat.alac:
        return 'm4a';
      case OutputFormat.mp3:
        return 'mp3';
      case OutputFormat.flac:
        return 'flac';
      case OutputFormat.m4a:
        return 'm4a';
      case OutputFormat.ogg:
        return 'ogg';
    }
  }

  bool get lossy =>
      this == OutputFormat.mp3 ||
      this == OutputFormat.ogg ||
      this == OutputFormat.m4a ||
      this == OutputFormat.opus;

  String get mime {
    switch (this) {
      case OutputFormat.mp3:
        return 'audio/mpeg';
      case OutputFormat.m4a:
      case OutputFormat.alac:
        return 'audio/mp4';
      case OutputFormat.ogg:
        return 'audio/ogg';
      case OutputFormat.opus:
        return 'audio/opus';
      case OutputFormat.flac:
        return 'audio/flac';
      case OutputFormat.wav:
      case OutputFormat.wav24:
      case OutputFormat.wav32:
        return 'audio/wav';
    }
  }

  /// Short technical descriptor for the format grid.
  String get spec {
    switch (this) {
      case OutputFormat.mp3:
        return 'UNIVERSAL';
      case OutputFormat.wav24:
        return 'STUDIO';
      case OutputFormat.wav32:
        return 'FLOAT';
      case OutputFormat.flac:
        return 'LOSSLESS';
      case OutputFormat.m4a:
        return 'APPLE';
      case OutputFormat.alac:
        return 'HI-RES';
      case OutputFormat.ogg:
        return 'OPEN';
      case OutputFormat.opus:
        return 'VOICE';
      case OutputFormat.wav:
        return 'MASTER';
    }
  }
}

class EditSettings {
  // ---- source -------------------------------------------------------------
  String? filePath;
  String? fileName;
  double durationSec = 0;
  int sampleRate = 44100;

  // ---- timeline -----------------------------------------------------------
  double trimStart = 0;
  double trimEnd = 0; // 0 => end of file
  double fadeIn = 0;
  double fadeOut = 0;

  // ---- time engine --------------------------------------------------------
  double speed = 1.0;
  SpeedMode speedMode = SpeedMode.retro;

  // ---- space --------------------------------------------------------------
  bool reverbEnabled = false;
  ReverbType reverbType = ReverbType.hall;
  double reverbLevel = 0.40;
  double reverbRoom = 0.50;
  double reverbDamp = 0.30;

  bool spatial8d = false;
  double spinRate = 0.125;
  double depth = 0.60;
  double width = 0.50;

  // ---- tone ---------------------------------------------------------------
  double bass = 0;
  double bassFreq = 0.50;
  double sub = 0;
  double clarity = 0;
  double presence = 0;
  double air = 0;
  double lowpass = 0;

  // ---- character ----------------------------------------------------------
  double warmth = 0;
  bool deEsser = false;
  bool monoBass = false;
  bool oversample = false;

  // ---- repair -------------------------------------------------------------
  bool denoise = false;
  double denoiseAmount = 0.50;
  bool voiceMode = false;

  // ---- master -------------------------------------------------------------
  double finalGain = 1.0;
  LoudnessTarget target = LoudnessTarget.streaming;
  bool normalizeInput = false;
  bool turbo = true;

  // ---- output -------------------------------------------------------------
  OutputFormat format = OutputFormat.mp3;
  int bitrate = 320;

  // ---- state --------------------------------------------------------------
  String? activePreset;

  // ------------------------------------------------------------------------
  // Timeline helpers
  // ------------------------------------------------------------------------

  /// Effective end in *source* seconds.
  double get effectiveEnd {
    if (durationSec <= 0) return 0;
    if (trimEnd <= 0.05 || trimEnd >= durationSec - 0.05) return durationSec;
    return trimEnd.clamp(0.0, durationSec).toDouble();
  }

  double get sourceWindow {
    final double end = effectiveEnd;
    if (end <= 0) return 0;
    return (end - trimStart).clamp(0.0, durationSec).toDouble();
  }

  /// Duration after the speed engine.
  double get processedDuration {
    if (speed <= 0.01) return 0;
    return sourceWindow / speed;
  }

  bool get hasSource => filePath != null;

  bool get isNeutral =>
      speed == 1.0 &&
      !reverbEnabled &&
      !spatial8d &&
      bass == 0 &&
      sub == 0 &&
      clarity == 0 &&
      presence == 0 &&
      air == 0 &&
      lowpass == 0 &&
      warmth == 0 &&
      !deEsser &&
      !monoBass &&
      !oversample &&
      !denoise &&
      !voiceMode &&
      finalGain == 1.0 &&
      fadeIn == 0 &&
      fadeOut == 0;

  // ------------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------------

  EditSettings clone() {
    return EditSettings()
      ..filePath = filePath
      ..fileName = fileName
      ..durationSec = durationSec
      ..sampleRate = sampleRate
      ..trimStart = trimStart
      ..trimEnd = trimEnd
      ..fadeIn = fadeIn
      ..fadeOut = fadeOut
      ..speed = speed
      ..speedMode = speedMode
      ..reverbEnabled = reverbEnabled
      ..reverbType = reverbType
      ..reverbLevel = reverbLevel
      ..reverbRoom = reverbRoom
      ..reverbDamp = reverbDamp
      ..spatial8d = spatial8d
      ..spinRate = spinRate
      ..depth = depth
      ..width = width
      ..bass = bass
      ..bassFreq = bassFreq
      ..sub = sub
      ..clarity = clarity
      ..presence = presence
      ..air = air
      ..lowpass = lowpass
      ..warmth = warmth
      ..deEsser = deEsser
      ..monoBass = monoBass
      ..oversample = oversample
      ..denoise = denoise
      ..denoiseAmount = denoiseAmount
      ..voiceMode = voiceMode
      ..finalGain = finalGain
      ..target = target
      ..normalizeInput = normalizeInput
      ..turbo = turbo
      ..format = format
      ..bitrate = bitrate
      ..activePreset = activePreset;
  }

  /// Neutral engineering baseline. Keeps the loaded source and output prefs.
  void resetNeutral({bool keepSource = true}) {
    if (!keepSource) {
      filePath = null;
      fileName = null;
      durationSec = 0;
      sampleRate = 44100;
      trimStart = 0;
      trimEnd = 0;
    }
    fadeIn = 0;
    fadeOut = 0;
    speed = 1.0;
    speedMode = SpeedMode.retro;
    reverbEnabled = false;
    reverbType = ReverbType.hall;
    reverbLevel = 0.40;
    reverbRoom = 0.50;
    reverbDamp = 0.30;
    spatial8d = false;
    spinRate = 0.125;
    depth = 0.60;
    width = 0.50;
    bass = 0;
    bassFreq = 0.50;
    sub = 0;
    clarity = 0;
    presence = 0;
    air = 0;
    lowpass = 0;
    warmth = 0;
    deEsser = false;
    monoBass = false;
    oversample = false;
    denoise = false;
    denoiseAmount = 0.50;
    voiceMode = false;
    finalGain = 1.0;
    target = LoudnessTarget.streaming;
    normalizeInput = false;
    activePreset = null;
  }
}

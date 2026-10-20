import 'dart:math' as math;

import '../models/edit_settings.dart';

/// Per-space reverb topology (number of taps, decay window, colour).
class ReverbSpec {
  const ReverbSpec({
    required this.taps,
    required this.decayMin,
    required this.decayMax,
    required this.preMin,
    required this.preMax,
    required this.lowpass,
    required this.highpass,
    required this.spread,
    required this.curve,
    required this.base,
  });

  final int taps;
  final double decayMin;
  final double decayMax;
  final double preMin;
  final double preMax;
  final double lowpass;
  final double highpass;
  final double spread;
  final double curve;
  final double base;
}

/// Builds the AEGIS-M filter graph.
///
/// Rules that must not regress (verified against real FFmpeg):
///  • No `loudnorm` dynamics, no ASC limiter, no glue compressor — they
///    crackle on hot material. Loudness is ONE static gain.
///  • `afir` is broken in FFmpeg 7/8; the hall uses decorrelated `aecho` taps.
///  • `asoftclip` has no `level` option, only `type`.
///  • Output is always 48 kHz stereo with triangular dither.
///  • Measurement runs without the limiter, so the static trim is honest.
class GraphBuilder {
  const GraphBuilder._();

  static const Map<ReverbType, ReverbSpec> _spaces =
      <ReverbType, ReverbSpec>{
    ReverbType.hall: ReverbSpec(
      taps: 16,
      decayMin: 1.4,
      decayMax: 4.2,
      preMin: 18,
      preMax: 90,
      lowpass: 5600,
      highpass: 180,
      spread: 1.13,
      curve: 1.55,
      base: 0.60,
    ),
    ReverbType.plate: ReverbSpec(
      taps: 12,
      decayMin: 0.7,
      decayMax: 2.6,
      preMin: 6,
      preMax: 34,
      lowpass: 9200,
      highpass: 260,
      spread: 1.07,
      curve: 1.25,
      base: 0.54,
    ),
    ReverbType.chamber: ReverbSpec(
      taps: 10,
      decayMin: 0.9,
      decayMax: 2.8,
      preMin: 12,
      preMax: 60,
      lowpass: 6600,
      highpass: 220,
      spread: 1.21,
      curve: 1.35,
      base: 0.57,
    ),
    ReverbType.cathedral: ReverbSpec(
      taps: 20,
      decayMin: 2.4,
      decayMax: 6.0,
      preMin: 40,
      preMax: 150,
      lowpass: 4200,
      highpass: 150,
      spread: 1.17,
      curve: 1.70,
      base: 0.64,
    ),
  };

  static ReverbSpec spec(ReverbType type) => _spaces[type] ?? _spaces[ReverbType.hall]!;

  static double _lerp(double a, double b, double t) => a + (b - a) * t;

  static double _clamp(double v, double lo, double hi) =>
      v < lo ? lo : (v > hi ? hi : v);

  /// Reverb decay in seconds for the current room size.
  static double decaySeconds(EditSettings s) {
    final ReverbSpec sp = spec(s.reverbType);
    return _lerp(sp.decayMin, sp.decayMax, _clamp(s.reverbRoom, 0, 1));
  }

  /// Natural tail added by the reverb delay line (echo flush).
  static double tailSeconds(EditSettings s) {
    if (!s.reverbEnabled) return 0;
    final ReverbSpec sp = spec(s.reverbType);
    final double decay = decaySeconds(s);
    final double last = 0.015 + decay * 0.92;
    final double pre = _lerp(sp.preMin, sp.preMax, _clamp(s.reverbRoom, 0, 1));
    final double tail = math.max(last * sp.spread + 0.008, last) + pre / 1000 + 0.05;
    return double.parse(tail.toStringAsFixed(3));
  }

  static bool needsAnalysis(EditSettings s) =>
      s.target != LoudnessTarget.off || s.normalizeInput;

  // ------------------------------------------------------------------------
  // Signal chain
  // ------------------------------------------------------------------------

  static List<String> dryChain(
    EditSettings s,
    double? peakDb,
    int sourceRate, {
    int? preRate,
    String? nnModel,
  }) {
    final List<String> f = <String>[];
    if (preRate != null) f.add('aresample=$preRate');
    f.add('highpass=f=24');

    if (s.voiceMode && nnModel != null) {
      f.add("arnndn=m='$nnModel'");
    } else if (s.denoise) {
      final int nr = (6 + 12 * _clamp(s.denoiseAmount, 0, 1)).round();
      f.add('afftdn=nr=$nr:nf=-42');
    }

    final int base = preRate ?? (s.oversample ? 96000 : sourceRate);
    if (preRate == null && s.oversample) {
      f.add('aresample=96000:resampler=soxr:precision=28');
    }

    final double src = s.durationSec;
    final bool useEnd = src > 0 && s.trimEnd > 0.05 && s.trimEnd < src - 0.05;
    if (s.trimStart > 0.05 || useEnd) {
      final double end = useEnd ? s.trimEnd : src;
      f.add(
        'atrim=start=${s.trimStart.toStringAsFixed(3)}'
        ':end=${end.toStringAsFixed(3)}',
      );
      f.add('asetpts=PTS-STARTPTS');
    }

    if (s.normalizeInput && peakDb != null && peakDb < -0.05) {
      final double gain = math.pow(10, (-0.5 - peakDb) / 20).toDouble();
      f.add('volume=${gain.toStringAsFixed(4)}');
    }

    if ((s.speed - 1.0).abs() > 0.001) {
      if (s.speedMode == SpeedMode.retro) {
        f.add('asetrate=${(base * s.speed).round()}');
        f.add('aresample=$base:resampler=soxr:precision=28');
      } else {
        f.add('atempo=${s.speed.toStringAsFixed(4)}');
      }
    }

    if (s.fadeIn > 0.05) {
      f.add('afade=t=in:st=0:d=${s.fadeIn.toStringAsFixed(2)}');
    }
    if (s.fadeOut > 0.05) {
      final double processed = s.processedDuration;
      if (processed > s.fadeIn + s.fadeOut * 0.35) {
        final double start = math.max(0.0, processed - s.fadeOut);
        f.add(
          'afade=t=out:st=${start.toStringAsFixed(2)}'
          ':d=${s.fadeOut.toStringAsFixed(2)}',
        );
      }
    }

    if (s.bass > 0.01) {
      final double freq = _lerp(80, 200, _clamp(s.bassFreq, 0, 1));
      final double gain = 2 + s.bass * 10;
      f.add('bass=g=${gain.toStringAsFixed(1)}:f=${freq.round()}');
    }
    if (s.sub > 0.01) {
      final double gain = 1.5 + s.sub * 7.5;
      f.add('bass=g=${gain.toStringAsFixed(1)}:f=55');
    }
    if (s.clarity > 0.01) {
      final double gain = -2.5 * s.clarity;
      f.add('equalizer=f=680:width_type=h:w=520:g=${gain.toStringAsFixed(1)}');
    }
    if (s.presence > 0.01) {
      final double gain = s.presence * 2.5;
      f.add('equalizer=f=2800:width_type=h:w=1300:g=${gain.toStringAsFixed(1)}');
    }
    if (s.air > 0.01) {
      final double gain = s.air * 4;
      f.add('treble=g=${gain.toStringAsFixed(1)}:f=8000');
    }
    if (s.lowpass > 0.01) {
      final double freq = _clamp((20000 * math.pow(100, -s.lowpass)).roundToDouble(), 120, 20000);
      f.add('lowpass=f=${freq.round()}');
    }

    bool stereo = false;
    if ((s.width - 0.5).abs() > 0.01) {
      f.add('aformat=channel_layouts=stereo');
      stereo = true;
      final double m = 0.2 + _clamp(s.width, 0, 1) * 1.6;
      f.add('extrastereo=m=${m.toStringAsFixed(2)}');
    }
    if (s.spatial8d) {
      if (!stereo) f.add('aformat=channel_layouts=stereo');
      final double hz = _clamp(s.spinRate, 0.02, 0.6);
      final double amount = _clamp(s.depth, 0.1, 1.0);
      final double makeup = math.pow(10, 4.2 * amount / 20).toDouble();
      f.add(
        'apulsator=mode=sine:timing=hz:hz=${hz.toStringAsFixed(3)}'
        ':amount=${amount.toStringAsFixed(2)}'
        ':level_out=${makeup.toStringAsFixed(3)}',
      );
    }

    if ((s.finalGain - 1.0).abs() > 0.001) {
      f.add('volume=${s.finalGain.toStringAsFixed(3)}');
    }
    return f;
  }

  static String reverbSend(EditSettings s, String src, String dst) {
    final ReverbSpec sp = spec(s.reverbType);
    final double room = _clamp(s.reverbRoom, 0, 1);
    final double level = _clamp(s.reverbLevel, 0, 1);
    final double damp = _clamp(s.reverbDamp, 0, 1);
    final double decay = _lerp(sp.decayMin, sp.decayMax, room);
    final int n = sp.taps;
    final double base =
        _clamp(sp.base * (0.55 + 0.75 * level), 0.18, 0.9);

    final List<int> tapsL = <int>[];
    final List<int> tapsR = <int>[];
    final List<String> decays = <String>[];
    for (int i = 0; i < n; i++) {
      final double t =
          0.015 + math.pow(i / (n - 1), sp.curve) * (decay * 0.92);
      tapsL.add((t * 1000).round());
      tapsR.add(((t * sp.spread + 0.008) * 1000).round());
      final double d = _clamp(
        base * math.pow(10, -2.1 * t / decay),
        0.02,
        0.9,
      );
      decays.add(d.toStringAsFixed(2));
    }

    final double wet = _clamp(0.35 + level * 0.9, 0.12, 1.0);
    final int pre = _lerp(sp.preMin, sp.preMax, room).round();
    final int lp = (sp.lowpass * (1 - 0.55 * damp)).round();
    final double dry = _lerp(0.86, 0.70, level);

    return '[$src]asplit=2[dry0][s];'
        '[s]asplit=2[sl][sr];'
        '[sl]adelay=$pre|$pre,'
        'aecho=1.0:0.6:${tapsL.join('|')}:${decays.join('|')},'
        'highpass=f=${sp.highpass},lowpass=f=$lp[vl];'
        '[sr]adelay=${pre + 7}|${pre + 7},'
        'aecho=1.0:0.6:${tapsR.join('|')}:${decays.join('|')},'
        'highpass=f=${sp.highpass},lowpass=f=$lp[vr];'
        '[vl][vr]amix=inputs=2:normalize=0,'
        'volume=${wet.toStringAsFixed(2)}[wet];'
        '[dry0]volume=${dry.toStringAsFixed(2)}[dry];'
        '[dry][wet]amix=inputs=2:normalize=0[$dst]';
  }

  /// Complete `-filter_complex` graph.
  ///
  /// [measure] omits the limiter and output resample so the analysis sees the
  /// true peak/loudness of the creative chain.
  static String build(
    EditSettings s,
    double? peakDb,
    int sourceRate,
    double? trim, {
    int? preRate,
    String? nnModel,
    bool measure = false,
  }) {
    final List<String> parts = <String>[];
    final String dry = dryChain(
      s,
      peakDb,
      sourceRate,
      preRate: preRate,
      nnModel: nnModel,
    ).join(',');
    parts.add('[0:a:0]$dry[a0]');
    String cur = 'a0';

    if (s.reverbEnabled) {
      parts.add(reverbSend(s, cur, 'a1'));
      cur = 'a1';
    } else {
      parts.add('[$cur]anull[a1]');
      cur = 'a1';
    }

    if (s.warmth > 0.02) {
      final String w = (s.warmth * 0.25).toStringAsFixed(2);
      parts.add(
        '[$cur]asplit=2[c1][c2];'
        '[c2]asoftclip=type=tanh,volume=$w[cw];'
        '[c1][cw]amix=inputs=2:normalize=0[a3]',
      );
      cur = 'a3';
    }

    if (s.monoBass) {
      parts.add(
        '[$cur]asplit=2[mlo][mhi];'
        '[mlo]lowpass=f=120,'
        'pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1[ml];'
        '[mhi]highpass=f=120[mh];'
        '[ml][mh]amix=inputs=2:normalize=0[a4]',
      );
      cur = 'a4';
    }

    if (s.deEsser) {
      parts.add(
        '[$cur]asplit=2[mm][sc];'
        '[sc]highpass=f=6000[sg];'
        '[mm][sg]sidechaincompress=threshold=-24dB:ratio=2:attack=6:'
        'release=180:detection=rms:mix=0.65[a5]',
      );
      cur = 'a5';
    }

    final List<String> fades = <String>[];
    if (trim != null && (trim - 1.0).abs() > 0.0005) {
      fades.add('volume=${trim.toStringAsFixed(4)}');
    }
    if (measure) {
      fades.add('aformat=channel_layouts=stereo[aout]');
    } else {
      fades.add('alimiter=limit=0.89:level=false:latency=true:'
          'attack=5:release=120');
      fades.add('aresample=48000:resampler=soxr:precision=28:'
          'dither_method=triangular');
      fades.add('aformat=channel_layouts=stereo[aout]');
    }
    parts.add('[$cur]${fades.join(',')}');
    return parts.join(';');
  }

  /// Static mastering gain: loudness target, true-peak ceiling, sane bounds.
  static double computeTrim({
    required double peakDb,
    double? lufs,
    required LoudnessTarget target,
    double? truePeakDb,
    double ceiling = -1.0,
  }) {
    final double pk =
        truePeakDb == null ? peakDb : math.max(peakDb, truePeakDb);
    final double gPeak = math.pow(10, (ceiling - pk) / 20).toDouble();

    final double? targetLufs = target.lufs;
    if (targetLufs == null) {
      if (pk > -0.5) {
        return _clamp(gPeak, 0.2, 1.0);
      }
      return 1.0;
    }
    if (lufs == null || lufs < -40) {
      return _clamp(gPeak, 0.2, 4.0);
    }
    final double gLufs = math.pow(10, (targetLufs - lufs) / 20).toDouble();
    return _clamp(math.min(gLufs, gPeak), 0.2, 4.0);
  }

  /// Cache key for a rendered setting set.
  static String signature(EditSettings s) {
    return <String>[
      s.speed.toStringAsFixed(3),
      s.speedMode.name,
      s.reverbEnabled ? s.reverbType.name : 'dry',
      s.reverbLevel.toStringAsFixed(2),
      s.reverbRoom.toStringAsFixed(2),
      s.reverbDamp.toStringAsFixed(2),
      s.spatial8d ? '${s.spinRate.toStringAsFixed(3)}/${s.depth.toStringAsFixed(2)}' : 'no8d',
      s.width.toStringAsFixed(2),
      s.bass.toStringAsFixed(2),
      s.bassFreq.toStringAsFixed(2),
      s.sub.toStringAsFixed(2),
      s.clarity.toStringAsFixed(2),
      s.presence.toStringAsFixed(2),
      s.air.toStringAsFixed(2),
      s.lowpass.toStringAsFixed(2),
      s.warmth.toStringAsFixed(2),
      '${s.deEsser ? 1 : 0}${s.monoBass ? 1 : 0}${s.oversample ? 1 : 0}',
      '${s.denoise ? 1 : 0}${s.voiceMode ? 1 : 0}${s.denoiseAmount.toStringAsFixed(2)}',
      s.finalGain.toStringAsFixed(2),
      s.target.name,
      s.fadeIn.toStringAsFixed(2),
      s.fadeOut.toStringAsFixed(2),
      s.trimStart.toStringAsFixed(2),
      s.trimEnd.toStringAsFixed(2),
    ].join(',');
  }
}

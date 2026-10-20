import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:crypto/crypto.dart';
import 'package:ffmpeg_kit_flutter_new_audio/ffmpeg_kit.dart';
import 'package:ffmpeg_kit_flutter_new_audio/ffprobe_kit.dart';
import 'package:ffmpeg_kit_flutter_new_audio/return_code.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../models/edit_settings.dart';
import 'graph_builder.dart';

class RunResult {
  const RunResult(this.code, this.logs);

  final ReturnCode? code;
  final String logs;

  bool get ok => code != null && ReturnCode.isSuccess(code!);
  bool get cancelled => code != null && ReturnCode.isCancel(code!);

  String tail(int chars) {
    if (logs.length <= chars) return logs;
    return logs.substring(logs.length - chars);
  }
}

class ProbeInfo {
  const ProbeInfo(this.sampleRate, this.duration);

  final int sampleRate;
  final double duration;
}

class RenderReport {
  const RenderReport({
    required this.path,
    required this.duration,
    required this.lufs,
    required this.truePeak,
    required this.trimDb,
    required this.hash,
  });

  final String path;
  final double duration;
  final double? lufs;
  final double? truePeak;
  final double trimDb;
  final String hash;
}

/// Offline render pipeline. Everything runs on-device through FFmpegKit.
class AudioEngine {
  const AudioEngine._();

  static int? _activeSessionId;
  static String? _neuralPath;

  static bool get isBusy => _activeSessionId != null;

  // ------------------------------------------------------------------------
  // Low level
  // ------------------------------------------------------------------------

  static String _q(String path) => '"${path.replaceAll('"', '\\"')}"';

  static Future<RunResult> _run(
    String command, {
    void Function(double progress)? onProgress,
    double? progressSeconds,
  }) {
    final StringBuffer buffer = StringBuffer();
    final Completer<RunResult> completer = Completer<RunResult>();

    FFmpegKit.executeAsync(
      command,
      (session) async {
        final rc = await session.getReturnCode();
        _activeSessionId = null;
        if (!completer.isCompleted) {
          completer.complete(RunResult(rc, buffer.toString()));
        }
      },
      (log) {
        buffer.writeln(log.getMessage());
      },
      (stats) {
        if (onProgress != null &&
            progressSeconds != null &&
            progressSeconds > 0) {
          final double ms = stats.getTime().toDouble();
          final double total = progressSeconds * 1000;
          onProgress((ms / total).clamp(0.0, 0.995).toDouble());
        }
      },
    ).then<void>(
      (session) {
        // A very short render can finish before the future resolves; don't
        // resurrect a dead session id in that case.
        if (!completer.isCompleted) {
          _activeSessionId = session.getSessionId();
        }
      },
      onError: (Object error, StackTrace stack) {
        if (!completer.isCompleted) {
          completer.complete(RunResult(null, error.toString()));
        }
      },
    );

    return completer.future;
  }

  static Future<void> cancel() async {
    final int? id = _activeSessionId;
    _activeSessionId = null;
    try {
      if (id != null) {
        FFmpegKit.cancel(id);
      } else {
        FFmpegKit.cancel();
      }
    } catch (_) {
      // Nothing running.
    }
  }

  // ------------------------------------------------------------------------
  // Probe & analysis
  // ------------------------------------------------------------------------

  static Future<ProbeInfo> probe(String path) async {
    int rate = 44100;
    double duration = 0;
    try {
      final session = await FFprobeKit.getMediaInformation(path);
      final info = session.getMediaInformation();
      if (info != null) {
        final double? d = double.tryParse('${info.getDuration()}');
        if (d != null && d > 0) duration = d;
        for (final stream in info.getStreams()) {
          final int? v = int.tryParse('${stream.getSampleRate()}');
          if (v != null && v > 0) {
            rate = v;
            break;
          }
        }
      }
    } catch (_) {
      // Fall back to safe defaults.
    }
    return ProbeInfo(rate, duration);
  }

  static Future<double?> inputPeakDb(String path) async {
    final RunResult result = await _run(
      '-hide_banner -nostdin -i ${_q(path)} -map 0:a:0 '
      '-af volumedetect -f null -',
    );
    if (!result.ok) return null;
    return _parsePeak(result.logs);
  }

  static double? _parsePeak(String logs) {
    final RegExpMatch? m =
        RegExp(r'max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB').firstMatch(logs);
    if (m == null) return null;
    return double.tryParse(m.group(1)!);
  }

  static double? _parseLufs(String logs) {
    final RegExpMatch? m =
        RegExp(r'I:\s+(-?\d+(?:\.\d+)?)\s+LUFS').firstMatch(logs);
    if (m == null) return null;
    return double.tryParse(m.group(1)!);
  }

  static double? _parseTruePeak(String logs) {
    final RegExpMatch? m =
        RegExp(r'Peak:\s+(-?\d+(?:\.\d+)?)\s*dBFS').firstMatch(logs);
    if (m == null) return null;
    return double.tryParse(m.group(1)!);
  }

  /// Bundled RNNoise model, extracted to cache on first use.
  static Future<String?> neuralModel() async {
    if (_neuralPath != null) return _neuralPath;
    try {
      final ByteData data = await rootBundle.load('assets/rnnoise/sh.rnnn');
      final Directory tmp = await getTemporaryDirectory();
      final File file = File('${tmp.path}/aegis_voice.rnnn');
      await file.writeAsBytes(data.buffer.asUint8List(), flush: true);
      _neuralPath = file.path;
    } catch (_) {
      _neuralPath = null;
    }
    return _neuralPath;
  }

  // ------------------------------------------------------------------------
  // Naming & provenance
  // ------------------------------------------------------------------------

  static String safeName(String? name) {
    final String base = (name ?? 'audio')
        .replaceAll(RegExp(r'\.[A-Za-z0-9]{1,5}$'), '')
        .replaceAll(RegExp(r'[^A-Za-z0-9_-]+'), '_');
    return base.isEmpty ? 'audio' : base;
  }

  static String provenance(EditSettings s) {
    final String payload = jsonEncode(<String, Object?>{
      'v': 7,
      'src': safeName(s.fileName),
      'sig': GraphBuilder.signature(s),
      'out': <String>[s.format.name, s.bitrate, s.turbo],
    });
    final String hash = sha256.convert(utf8.encode(payload)).toString();
    return hash.substring(0, 16);
  }

  static String outputName(EditSettings s) {
    final String preset = (s.activePreset ?? 'CUSTOM')
        .toUpperCase()
        .replaceAll(RegExp(r'[^A-Z0-9]+'), '_');
    final String speed = s.speed.toStringAsFixed(2).replaceAll('.', '');
    return 'ELTZY_${safeName(s.fileName)}_${preset}_${speed}'
        '.${s.format.ext}';
  }

  static String _codecArgs(EditSettings s) {
    switch (s.format) {
      case OutputFormat.mp3:
        return '-c:a libmp3lame -b:a ${s.bitrate}k';
      case OutputFormat.ogg:
        return '-c:a libvorbis -b:a ${s.bitrate}k';
      case OutputFormat.m4a:
        return '-c:a aac -b:a ${s.bitrate}k -movflags +faststart';
      case OutputFormat.opus:
        return '-c:a libopus -b:a ${s.bitrate}k';
      case OutputFormat.flac:
        return '-c:a flac -compression_level 8';
      case OutputFormat.alac:
        return '-c:a alac';
      case OutputFormat.wav:
        return '-c:a pcm_s16le';
      case OutputFormat.wav24:
        return '-c:a pcm_s24le';
      case OutputFormat.wav32:
        return '-c:a pcm_f32le';
    }
  }

  // ------------------------------------------------------------------------
  // Master render
  // ------------------------------------------------------------------------

  static Future<RenderReport> export(
    EditSettings s, {
    required String dir,
    void Function(double progress)? onProgress,
  }) async {
    final String? input = s.filePath;
    if (input == null) {
      throw StateError('No audio source loaded.');
    }

    onProgress?.call(0.02);
    final ProbeInfo info = await probe(input);
    if (info.duration > 0) {
      s.durationSec = info.duration;
    }
    if (s.sampleRate != info.sampleRate && info.sampleRate > 0) {
      s.sampleRate = info.sampleRate;
    }

    double? inPeak;
    if (s.normalizeInput) {
      inPeak = await inputPeakDb(input);
    }

    final String? nn = s.voiceMode ? await neuralModel() : null;
    final double outputDuration =
        s.processedDuration + GraphBuilder.tailSeconds(s);

    double trim = 1.0;
    double? measuredLufs;
    double? measuredPeak;

    if (GraphBuilder.needsAnalysis(s)) {
      onProgress?.call(0.08);
      final String analysis = GraphBuilder.build(
        s,
        inPeak,
        info.sampleRate,
        null,
        preRate: s.turbo ? 12000 : null,
        nnModel: nn,
        measure: true,
      );
      final RunResult result = await _run(
        '-hide_banner -nostdin -i ${_q(input)} '
        '-filter_complex "${analysis};[aout]volumedetect,'
        'ebur128=peak=true:framelog=quiet[vd]" '
        '-map "[vd]" -f null -',
      );
      if (result.cancelled) {
        throw const RenderCancelled();
      }
      if (result.ok) {
        measuredPeak = _parsePeak(result.logs);
        measuredLufs = _parseLufs(result.logs);
        final double? truePeak = _parseTruePeak(result.logs);
        if (measuredPeak != null) {
          trim = GraphBuilder.computeTrim(
            peakDb: measuredPeak,
            lufs: measuredLufs,
            target: s.target,
            truePeakDb: truePeak,
          );
        }
      }
    }

    onProgress?.call(0.14);
    final String graph = GraphBuilder.build(
      s,
      inPeak,
      info.sampleRate,
      trim,
      nnModel: nn,
    );
    final Directory tmp = await getTemporaryDirectory();
    final String out = '${tmp.path}/${outputName(s)}';
    final String hash = provenance(s);
    final String presetTag = (s.activePreset ?? 'Custom')
        .replaceAll(RegExp(r'[^A-Za-z0-9 ]'), '');
    final double trimDb = 20 * (math.log(trim) / math.ln10);

    final RunResult result = await _run(
      '-y -hide_banner -nostdin -i ${_q(input)} '
      '-filter_complex "$graph" -map "[aout]" '
      '${_codecArgs(s)} '
      '-metadata artist="EL TZY" '
      '-metadata album="AEGIS-M" '
      '-metadata title="ELTZY ${safeName(s.fileName)}" '
      '-metadata comment="AEGIS-M v7|preset=$presetTag|'
      'target=${s.target.label}|trim=${trimDb.toStringAsFixed(2)}dB|'
      'sha256=$hash" '
      '${_q(out)}',
      onProgress: onProgress == null
          ? null
          : (double p) => onProgress(0.18 + p * 0.81),
      progressSeconds: outputDuration,
    );

    if (result.cancelled) {
      await _deleteQuiet(out);
      throw const RenderCancelled();
    }
    if (!result.ok) {
      await _deleteQuiet(out);
      throw RenderFailure(result.tail(900));
    }
    onProgress?.call(1.0);

    return RenderReport(
      path: out,
      duration: outputDuration,
      lufs: measuredLufs == null
          ? null
          : measuredLufs + trimDb,
      truePeak: measuredPeak == null
          ? null
          : measuredPeak + trimDb,
      trimDb: trimDb,
      hash: hash,
    );
  }

  // ------------------------------------------------------------------------
  // Preview
  // ------------------------------------------------------------------------

  /// Renders a 20 s window through the exact export chain, MP3 192 k.
  static Future<String> preview(
    EditSettings s, {
    required String dir,
    double startAt = 0,
    double seconds = 20,
  }) async {
    final String? input = s.filePath;
    if (input == null) {
      throw StateError('No audio source loaded.');
    }
    final ProbeInfo info = await probe(input);
    if (info.duration > 0) s.durationSec = info.duration;

    final EditSettings c = s.clone();
    final double window = s.speed * seconds;
    final double start = startAt
        .clamp(
          0.0,
          math.max(
            0.0,
            (info.duration > 0 ? info.duration : s.durationSec) - 0.6,
          ),
        )
        .toDouble();
    c.trimStart = start;
    c.trimEnd = (start + window)
        .clamp(0.0, info.duration > 0 ? info.duration : start + window)
        .toDouble();

    final String? nn = c.voiceMode ? await neuralModel() : null;
    final double processed = c.processedDuration;

    // Quick measurement of the window so the preview matches the export trim.
    double trim = 1.0;
    if (GraphBuilder.needsAnalysis(c)) {
      final String measureGraph = GraphBuilder.build(
        c,
        null,
        info.sampleRate,
        null,
        preRate: 12000,
        nnModel: nn,
        measure: true,
      );
      final RunResult m = await _run(
        '-hide_banner -nostdin -i ${_q(input)} '
        '-filter_complex "${measureGraph};[aout]volumedetect,'
        'ebur128=peak=true:framelog=quiet[vd]" '
        '-map "[vd]" -f null -',
      );
      if (m.ok) {
        final double? peak = _parsePeak(m.logs);
        final double? lufs = _parseLufs(m.logs);
        final double? tp = _parseTruePeak(m.logs);
        if (peak != null) {
          trim = GraphBuilder.computeTrim(
            peakDb: peak,
            lufs: lufs,
            target: c.target,
            truePeakDb: tp,
          );
        }
      }
    }

    final String graph =
        GraphBuilder.build(c, null, info.sampleRate, trim, nnModel: nn);
    final String out = '$dir/eltzy_preview.mp3';
    final RunResult result = await _run(
      '-y -hide_banner -nostdin -i ${_q(input)} '
      '-filter_complex "$graph" -map "[aout]" '
      '-c:a libmp3lame -b:a 192k ${_q(out)}',
      onProgress: null,
      progressSeconds: processed + 0.5,
    );
    if (result.cancelled) throw const RenderCancelled();
    if (!result.ok) {
      await _deleteQuiet(out);
      throw RenderFailure(result.tail(700));
    }
    return out;
  }

  /// Decodes a mono PCM bed used to draw the source waveform.
  static Future<bool> decodePcm(
    String input,
    String outPath, {
    int rate = 8000,
  }) async {
    final RunResult r = await _run(
      '-y -hide_banner -nostdin -i ${_q(input)} -map 0:a:0 '
      '-ac 1 -ar $rate -f s16le ${_q(outPath)}',
    );
    return r.ok;
  }

  static Future<void> _deleteQuiet(String path) async {
    try {
      final File f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {
      // ignore
    }
  }

  /// Human readable chain for the diagnostics console.
  static String inspect(EditSettings s) {
    final String graph = GraphBuilder.build(
      s,
      0,
      s.sampleRate,
      1.0,
      measure: false,
    );
    final StringBuffer pretty = StringBuffer();
    int index = 0;
    for (final String part in graph.split(';')) {
      index += 1;
      pretty.writeln('${index.toString().padLeft(2, '0')}  $part');
    }
    return pretty.toString();
  }
}

class RenderFailure implements Exception {
  const RenderFailure(this.detail);

  final String detail;

  @override
  String toString() => 'Render failed: $detail';
}

class RenderCancelled implements Exception {
  const RenderCancelled();

  @override
  String toString() => 'Render cancelled.';
}

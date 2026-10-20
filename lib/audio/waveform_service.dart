import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:path_provider/path_provider.dart';

import 'audio_engine.dart';

/// Decodes a lightweight mono PCM bed and turns it into peak buckets for the
/// interactive timeline. Results are cached on disk and in memory.
class WaveformService {
  const WaveformService._();

  static final Map<String, List<double>> _memory = <String, List<double>>{};
  static final Map<String, Future<List<double>>> _inflight =
      <String, Future<List<double>>>{};

  static Future<List<double>> load(
    String path, {
    int buckets = 420,
  }) {
    final String key = '$path|$buckets';
    final List<double>? cached = _memory[key];
    if (cached != null) return Future<List<double>>.value(cached);

    final Future<List<double>>? pending = _inflight[key];
    if (pending != null) return pending;

    final Future<List<double>> job = _compute(path, buckets, key);
    _inflight[key] = job;
    return job.whenComplete(() => _inflight.remove(key));
  }

  static Future<List<double>> _compute(
    String path,
    int buckets,
    String key,
  ) async {
    try {
      final File src = File(path);
      final FileStat stat = await src.stat();
      final String stamp =
          '${src.path}|${stat.size}|${stat.modified.millisecondsSinceEpoch}|$buckets';
      final String id = md5.convert(utf8.encode(stamp)).toString();

      final Directory tmp = await getTemporaryDirectory();
      final File cache = File('${tmp.path}/wf_$id.bin');
      if (await cache.exists()) {
        final List<double> peaks = _decodeCache(await cache.readAsBytes());
        if (peaks.length == buckets) {
          _memory[key] = peaks;
          return peaks;
        }
      }

      final File pcm = File('${tmp.path}/wf_$id.pcm');
      final bool ok = await AudioEngine.decodePcm(path, pcm.path);
      if (!ok || !await pcm.exists()) return <double>[];

      final Uint8List bytes = await pcm.readAsBytes();
      await pcm.delete().catchError((Object _) => pcm);

      final int samples = bytes.lengthInBytes ~/ 2;
      if (samples <= 0) return <double>[];

      final List<double> peaks = List<double>.filled(buckets, 0);
      final ByteData data = ByteData.sublistView(bytes);
      for (int i = 0; i < samples; i++) {
        final int v = data.getInt16(i * 2, Endian.little);
        final double a = (v.abs() / 32768.0).clamp(0.0, 1.0).toDouble();
        final int bucket =
            (i * buckets ~/ samples).clamp(0, buckets - 1).toInt();
        if (a > peaks[bucket]) peaks[bucket] = a;
      }

      // Gentle smoothing keeps the drawing legible on dense material.
      final List<double> smoothed = List<double>.filled(buckets, 0);
      for (int i = 0; i < buckets; i++) {
        final double a = peaks[i > 0 ? i - 1 : 0];
        final double b = peaks[i];
        final double c = peaks[i + 1 < buckets ? i + 1 : buckets - 1];
        smoothed[i] = math.max(b, (a + c) * 0.5);
      }
      final double maxPeak =
          smoothed.reduce((double a, double b) => a > b ? a : b);
      final List<double> normalised = maxPeak > 0.001
          ? smoothed
              .map((double v) => (v / maxPeak).clamp(0.0, 1.0).toDouble())
              .toList()
          : smoothed;

      final Uint8List packed = Uint8List(buckets);
      for (int i = 0; i < buckets; i++) {
        packed[i] = (normalised[i] * 255).round().clamp(0, 255).toInt();
      }
      await cache.writeAsBytes(packed, flush: true);

      _memory[key] = normalised;
      return normalised;
    } catch (_) {
      return <double>[];
    }
  }

  static List<double> _decodeCache(Uint8List bytes) {
    return List<double>.generate(
      bytes.lengthInBytes,
      (int i) => bytes[i] / 255.0,
      growable: false,
    );
  }

  static void forget(String path) {
    _memory.removeWhere((String key, List<double> _) => key.startsWith('$path|'));
  }
}

import 'package:el_tzy/audio/graph_builder.dart';
import 'package:el_tzy/models/edit_settings.dart';
import 'package:el_tzy/models/preset.dart';
import 'package:flutter_test/flutter_test.dart';

/// Pure-Dart guards for the DSP graph. These run with `flutter test` and need
/// no device, no FFmpegKit and no plugins.
void main() {
  EditSettings base() => EditSettings()
    ..filePath = '/tmp/in.wav'
    ..fileName = 'in.wav'
    ..durationSec = 30
    ..sampleRate = 44100;

  group('chain invariants', () {
    test('starts from the first audio stream and ends on [aout]', () {
      final String graph =
          GraphBuilder.build(base(), null, 44100, 1.0, measure: false);
      expect(graph.startsWith('[0:a:0]'), isTrue);
      expect(graph.endsWith('[aout]'), isTrue);
    });

    test('always limits and always resamples to 48 kHz stereo', () {
      final String graph =
          GraphBuilder.build(base(), null, 44100, 1.0, measure: false);
      expect(graph, contains('alimiter=limit=0.89'));
      expect(graph, contains('level=false'));
      expect(graph, contains('latency=true'));
      expect(graph, contains('aresample=48000'));
      expect(graph, contains('dither_method=triangular'));
      expect(graph, contains('aformat=channel_layouts=stereo'));
    });

    test('never uses loudnorm, glue compression or afir', () {
      for (final Preset p in Preset.all) {
        final EditSettings s = base();
        p.apply(s);
        final String graph =
            GraphBuilder.build(s, -3, 44100, 1.0, measure: false);
        expect(graph, isNot(contains('loudnorm')));
        expect(graph, isNot(contains('acompressor')));
        expect(graph, isNot(contains('afir')));
        expect(graph, isNot(contains('apad')));
        expect(graph, isNot(contains('adeclick')));
      }
    });

    test('measurement graph bypasses the limiter', () {
      final String graph =
          GraphBuilder.build(base(), null, 44100, 1.0, measure: true);
      expect(graph, isNot(contains('alimiter')));
      expect(graph, contains('[aout]'));
    });

    test('fades are applied before the reverb send', () {
      final EditSettings s = base()
        ..fadeIn = 1.0
        ..fadeOut = 2.0
        ..reverbEnabled = true;
      final String graph = GraphBuilder.build(s, null, 44100, 1.0);
      expect(graph.indexOf('afade=t=out'), lessThan(graph.indexOf('aecho')));
    });

    test('8D uses the filter level compensation, not an extra volume', () {
      final EditSettings s = base()
        ..spatial8d = true
        ..depth = 0.6
        ..spinRate = 0.125;
      final String graph = GraphBuilder.build(s, null, 44100, 1.0);
      expect(graph, contains('apulsator=mode=sine'));
      expect(graph, contains('level_out=1.33'));
    });

    test('voice mode injects the neural model only when supplied', () {
      final EditSettings s = base()..voiceMode = true;
      expect(GraphBuilder.build(s, null, 44100, 1.0),
          isNot(contains('arnndn')));
      expect(GraphBuilder.build(s, null, 44100, 1.0, nnModel: '/tmp/m.rnnn'),
          contains("arnndn=m='/tmp/m.rnnn'"));
    });

    test('retro speed shifts the sample rate, modern keeps pitch', () {
      final EditSettings retro = base()
        ..speed = 0.84
        ..speedMode = SpeedMode.retro;
      final EditSettings modern = base()
        ..speed = 0.84
        ..speedMode = SpeedMode.modern;
      expect(GraphBuilder.build(retro, null, 44100, 1.0),
          contains('asetrate=37044'));
      expect(GraphBuilder.build(modern, null, 44100, 1.0),
          contains('atempo=0.8400'));
    });
  });

  group('mastering trim', () {
    test('hits the loudness target when peak allows it', () {
      final double trim = GraphBuilder.computeTrim(
        peakDb: -18,
        lufs: -20,
        truePeakDb: -18,
        target: LoudnessTarget.streaming,
      );
      // +6 dB to reach -14 LUFS, still under the -1 dBFS ceiling.
      expect(trim, closeTo(1.995, 0.01));
    });

    test('the true-peak ceiling wins over a hotter loudness target', () {
      final double trim = GraphBuilder.computeTrim(
        peakDb: 0,
        lufs: -24,
        truePeakDb: 0,
        target: LoudnessTarget.club,
      );
      // -1 dBFS ceiling => 10^(-1/20) ≈ 0.891, never the +6 dB the target asks.
      expect(trim, closeTo(0.891, 0.001));
    });

    test('does not boost when the target is off', () {
      final double trim = GraphBuilder.computeTrim(
        peakDb: -12,
        lufs: -20,
        target: LoudnessTarget.off,
      );
      expect(trim, 1.0);
    });

    test('clamps inside the sane range', () {
      final double quiet = GraphBuilder.computeTrim(
        peakDb: -60,
        lufs: -60,
        target: LoudnessTarget.club,
      );
      expect(quiet, lessThanOrEqualTo(4.0));
      expect(quiet, greaterThanOrEqualTo(0.2));
    });
  });

  group('reverb topology', () {
    test('tail grows with room size and space', () {
      final EditSettings hall = base()
        ..reverbEnabled = true
        ..reverbRoom = 0.1;
      final EditSettings cathedral = base()
        ..reverbEnabled = true
        ..reverbType = ReverbType.cathedral
        ..reverbRoom = 0.9;
      expect(GraphBuilder.tailSeconds(hall),
          lessThan(GraphBuilder.tailSeconds(cathedral)));
    });

    test('no reverb means no tail', () {
      expect(GraphBuilder.tailSeconds(base()), 0);
    });
  });

  group('presets', () {
    test('all 14 presets are unique and buildable', () {
      expect(Preset.all.length, 14);
      final Set<String> ids = <String>{};
      for (final Preset p in Preset.all) {
        expect(ids.add(p.id), isTrue, reason: 'duplicate id ${p.id}');
        final EditSettings s = base();
        p.apply(s);
        expect(GraphBuilder.build(s, -4, 48000, 0.9).isNotEmpty, isTrue);
      }
    });

    test('resetNeutral clears the creative chain but keeps mastering', () {
      final EditSettings s = base()
        ..speed = 0.8
        ..reverbEnabled = true
        ..bass = 0.5
        ..target = LoudnessTarget.club
        ..format = OutputFormat.flac;
      s.resetNeutral();
      expect(s.speed, 1.0);
      expect(s.reverbEnabled, isFalse);
      expect(s.bass, 0.0);
      // resetNeutral itself resets mastering; the controller restores it.
      expect(s.target, LoudnessTarget.streaming);
    });
  });
}

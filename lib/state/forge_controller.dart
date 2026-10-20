import 'dart:async';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../app/app_state.dart';
import '../audio/audio_engine.dart';
import '../audio/waveform_service.dart';
import '../models/edit_settings.dart';
import '../models/preset.dart';
import '../services/history_service.dart';
import '../services/storage_service.dart';
import '../widgets/export_console.dart';

/// Orchestrates source loading, audition playback and the export pipeline.
class ForgeController extends ChangeNotifier {
  ForgeController(this.app);

  final AppState app;
  final AudioPlayer _player = AudioPlayer();
  final ValueNotifier<ExportState> exportState =
      ValueNotifier<ExportState>(const ExportState());

  List<double> peaks = <double>[];
  bool loadingSource = false;
  bool waveformReady = false;
  String? sourceError;

  bool previewBusy = false;
  bool previewDirty = true;
  bool playing = false;
  double playhead = 0;
  String? previewError;
  double _previewDur = 0;

  StreamSubscription<Duration>? _posSub;
  StreamSubscription<void>? _doneSub;
  StreamSubscription<PlayerState>? _stateSub;
  bool _disposed = false;

  EditSettings get edit => app.edit;

  Future<void> attach() async {
    await _player.setReleaseMode(ReleaseMode.stop);
    await _player.setPlayerMode(PlayerMode.mediaPlayer);
    _posSub = _player.onPositionChanged.listen((Duration d) {
      if (_disposed) return;
      final double t = d.inMilliseconds / 1000.0;
      _previewDur = _previewDur == 0 ? t : _previewDur;
      playhead = edit.trimStart + t * edit.speed;
      if (playhead > edit.effectiveEnd) playhead = edit.effectiveEnd;
      notifyListeners();
    });
    _doneSub = _player.onPlayerComplete.listen((_) {
      if (_disposed) return;
      playing = false;
      playhead = edit.trimStart;
      notifyListeners();
    });
    _stateSub = _player.onPlayerStateChanged.listen((PlayerState s) {
      if (_disposed) return;
      final bool nowPlaying = s == PlayerState.playing;
      if (nowPlaying != playing) {
        playing = nowPlaying;
        notifyListeners();
      }
    });
  }

  // ------------------------------------------------------------------------
  // Source
  // ------------------------------------------------------------------------

  Future<void> pickSource() async {
    if (loadingSource) return;
    loadingSource = true;
    sourceError = null;
    notifyListeners();

    try {
      final FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.audio,
        allowMultiple: false,
        withData: false,
      );
      final PlatformFile? file =
          (result == null || result.files.isEmpty) ? null : result.files.first;
      final String? path = file?.path;
      if (file == null || path == null) {
        loadingSource = false;
        notifyListeners();
        return;
      }

      await stopPreview();
      app.setSource(
        path: path,
        name: file.name,
        duration: 0,
        sampleRate: 44100,
      );

      final ProbeInfo info = await AudioEngine.probe(path);
      final String name = file.name;
      app.setSource(
        path: path,
        name: name,
        duration: info.duration,
        sampleRate: info.sampleRate,
      );
      previewDirty = true;
      playhead = 0;
      peaks = <double>[];
      waveformReady = false;
      loadingSource = false;
      notifyListeners();

      final List<double> loaded = await WaveformService.load(path);
      if (!_disposed) {
        peaks = loaded;
        waveformReady = true;
        notifyListeners();
      }
    } catch (error) {
      loadingSource = false;
      sourceError = error.toString();
      notifyListeners();
    }
  }

  void eject() {
    stopPreview();
    app.ejectSource();
    peaks = <double>[];
    waveformReady = false;
    previewDirty = true;
    playhead = 0;
    notifyListeners();
  }

  void seek(double seconds) {
    playhead = seconds.clamp(0.0, edit.durationSec).toDouble();
    if (playing) {
      final double offset = (playhead - edit.trimStart) / edit.speed;
      _player.seek(Duration(milliseconds: (offset * 1000).round()));
    }
    notifyListeners();
  }

  void trimChanged(double start, double end) {
    app.updateEdit((EditSettings s) {
      s.trimStart = start;
      s.trimEnd = end;
      if (s.trimStart >= s.trimEnd - 0.2) {
        s.trimEnd = (s.trimStart + 0.2).clamp(0.0, s.durationSec).toDouble();
      }
    });
    markDirty();
    notifyListeners();
  }

  // ------------------------------------------------------------------------
  // Presets + edits
  // ------------------------------------------------------------------------

  void applyPreset(Preset preset) {
    app.applyPreset(preset);
    playhead = edit.trimStart;
    markDirty();
  }

  void store(String slot) {
    app.storeSlot(slot);
  }

  void recall(String slot) {
    app.recallSlot(slot);
    playhead = edit.trimStart;
    markDirty();
  }

  void markDirty() {
    previewDirty = true;
    if (playing) {
      _player.pause();
      playing = false;
    }
    notifyListeners();
  }

  // ------------------------------------------------------------------------
  // Audition
  // ------------------------------------------------------------------------

  Future<void> togglePlay() async {
    if (!edit.hasSource) return;
    if (playing) {
      await _player.pause();
      playing = false;
      notifyListeners();
      return;
    }

    if (previewDirty) {
      final bool ok = await _renderPreview();
      if (!ok) return;
    }

    try {
      final double offset =
          ((playhead - edit.trimStart).clamp(0.0, edit.sourceWindow).toDouble() /
                  edit.speed);
      if (offset > 0.2) {
        await _player.seek(Duration(milliseconds: (offset * 1000).round()));
      }
      await _player.resume();
      playing = true;
      notifyListeners();
    } catch (error) {
      previewError = error.toString();
      notifyListeners();
    }
  }

  Future<bool> _renderPreview() async {
    if (previewBusy || !edit.hasSource) return false;
    previewBusy = true;
    previewError = null;
    notifyListeners();
    try {
      final Directory tmp = await getTemporaryDirectory();
      final Directory dir = Directory('${tmp.path}/audition');
      if (!await dir.exists()) await dir.create(recursive: true);

      final String path = await AudioEngine.preview(
        edit,
        dir: dir.path,
        startAt: edit.trimStart,
        seconds: 20,
      );
      await _player.stop();
      await _player.setSource(DeviceFileSource(path));
      await _player.seek(Duration.zero);
      previewDirty = false;
      previewBusy = false;
      notifyListeners();
      return true;
    } catch (error) {
      previewBusy = false;
      previewError = error.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> stopPreview() async {
    try {
      await _player.stop();
    } catch (_) {
      // ignore
    }
    playing = false;
    previewDirty = true;
    playhead = edit.trimStart;
    if (_disposed) return;
    notifyListeners();
  }

  // ------------------------------------------------------------------------
  // Export
  // ------------------------------------------------------------------------

  Future<ExportState> forge() async {
    final EditSettings snapshot = edit.clone();

    final ExportState start = const ExportState();
    exportState.value = start;

    if (!snapshot.hasSource) {
      final ExportState failed = const ExportState(error: 'No source loaded.');
      exportState.value = failed;
      return failed;
    }

    await stopPreview();

    String stage = 'ANALYSE';
    final ValueNotifier<ExportState> live = exportState;
    void push(double p, String next) {
      stage = next;
      live.value = ExportState(progress: p, stage: stage);
    }

    push(0.02, 'ANALYSE');

    try {
      final Directory tmp = await getTemporaryDirectory();
      final Directory dir = Directory('${tmp.path}/render');
      if (!await dir.exists()) await dir.create(recursive: true);

      final RenderReport report = await AudioEngine.export(
        snapshot,
        dir: dir.path,
        onProgress: (double p) {
          if (p < 0.10) {
            push(p.clamp(0.02, 0.09).toDouble(), 'ANALYSE');
          } else if (p < 0.90) {
            push(p, 'RENDER');
          } else if (p < 0.97) {
            push(p, 'MASTER');
          } else {
            push(p, 'WRITE');
          }
        },
      );

      push(0.96, 'WRITE');
      final int bytes = await StorageService.sizeOf(report.path);
      final String displayName = report.path.split('/').last;
      final SavedFile saved = await StorageService.save(
        tempPath: report.path,
        displayName: displayName,
        settings: app.settings,
      );

      app.updateEdit((EditSettings s) {
        if (s.durationSec <= 0) s.durationSec = report.duration;
      });

      final String historyPath = saved.path ?? 'saf://${saved.display}';
      await app.addHistory(
        ExportRecord(
          name: displayName,
          path: historyPath,
          format: snapshot.format.label,
          preset: snapshot.activePreset ?? 'CUSTOM',
          duration: report.duration,
          bytes: bytes,
          createdAt: DateTime.now(),
          lufs: report.lufs,
          hash: report.hash,
        ),
      );

      final ExportState done = ExportState(
        progress: 1,
        stage: 'WRITE',
        report: report,
        savedLabel: saved.display,
        sharePath: saved.path,
        mime: snapshot.format.mime,
        bytes: bytes,
      );
      exportState.value = done;
      return done;
    } on RenderCancelled {
      final ExportState cancelled =
          ExportState(stage: stage, cancelled: true, progress: 0);
      exportState.value = cancelled;
      return cancelled;
    } catch (error) {
      final ExportState failed =
          ExportState(stage: stage, error: error.toString());
      exportState.value = failed;
      return failed;
    }
  }

  Future<void> cancelForge() async {
    await AudioEngine.cancel();
  }

  Future<bool> share(String path, String? mime) {
    return StorageService.share(path, mime ?? 'audio/*');
  }

  @override
  void dispose() {
    _disposed = true;
    _posSub?.cancel();
    _doneSub?.cancel();
    _stateSub?.cancel();
    _player.dispose();
    exportState.dispose();
    super.dispose();
  }
}

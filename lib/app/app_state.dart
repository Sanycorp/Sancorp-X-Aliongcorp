import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import '../core/haptics.dart';
import '../models/app_settings.dart';
import '../models/edit_settings.dart';
import '../models/preset.dart';
import '../services/history_service.dart';
import '../services/prefs.dart';

/// Single source of truth for the cockpit.
class AppState extends ChangeNotifier {
  AppSettings settings = AppSettings();
  EditSettings edit = EditSettings();
  List<ExportRecord> history = <ExportRecord>[];
  EditSettings? slotA;
  EditSettings? slotB;
  bool ready = false;

  /// Separate notifier so the MaterialApp only rebuilds on finish changes.
  final ValueNotifier<bool> dark = ValueNotifier<bool>(false);

  Future<void> init() async {
    settings = await Prefs.load();
    dark.value = settings.darkFinish;
    Haptics.enabled = settings.haptics;
    edit
      ..turbo = settings.turbo
      ..format = settings.format
      ..bitrate = settings.bitrate
      ..target = settings.target;
    history = await HistoryService.load();
    ready = true;
    notifyListeners();
  }

  // ------------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------------

  void updateSettings(void Function(AppSettings s) mutate) {
    mutate(settings);
    Haptics.enabled = settings.haptics;
    if (dark.value != settings.darkFinish) {
      dark.value = settings.darkFinish;
    }
    notifyListeners();
    Prefs.save(settings);
  }

  void toggleFinish() {
    updateSettings((AppSettings s) => s.darkFinish = !s.darkFinish);
  }

  // ------------------------------------------------------------------------
  // Edit
  // ------------------------------------------------------------------------

  void updateEdit(void Function(EditSettings s) mutate) {
    mutate(edit);
    notifyListeners();
  }

  void applyPreset(Preset preset) {
    _resetChain();
    preset.apply(edit);
    edit.activePreset = preset.name;
    notifyListeners();
  }

  void resetNeutral() {
    _resetChain();
    notifyListeners();
  }

  /// Clears the creative chain but keeps the engineer's output decisions.
  void _resetChain() {
    final LoudnessTarget target = edit.target;
    final OutputFormat format = edit.format;
    final int bitrate = edit.bitrate;
    final bool turbo = edit.turbo;
    final bool normalizeInput = edit.normalizeInput;
    edit.resetNeutral(keepSource: true);
    edit
      ..target = target
      ..format = format
      ..bitrate = bitrate
      ..turbo = turbo
      ..normalizeInput = normalizeInput;
  }

  void setSource({
    required String path,
    required String name,
    required double duration,
    required int sampleRate,
  }) {
    edit
      ..filePath = path
      ..fileName = name
      ..durationSec = duration
      ..sampleRate = sampleRate
      ..trimStart = 0
      ..trimEnd = 0
      ..activePreset = null;
    notifyListeners();
  }

  void ejectSource() {
    edit
      ..filePath = null
      ..fileName = null
      ..durationSec = 0
      ..trimStart = 0
      ..trimEnd = 0;
    notifyListeners();
  }

  // ------------------------------------------------------------------------
  // A/B memory
  // ------------------------------------------------------------------------

  void storeSlot(String slot) {
    final EditSettings copy = edit.clone();
    if (slot == 'A') {
      slotA = copy;
    } else {
      slotB = copy;
    }
    notifyListeners();
  }

  void recallSlot(String slot) {
    final EditSettings? stored = slot == 'A' ? slotA : slotB;
    if (stored == null) return;
    final String? path = edit.filePath;
    final String? name = edit.fileName;
    final double duration = edit.durationSec;
    final int rate = edit.sampleRate;
    edit = stored.clone();
    if (path != null) {
      edit
        ..filePath = path
        ..fileName = name
        ..durationSec = duration
        ..sampleRate = rate;
    }
    notifyListeners();
  }

  // ------------------------------------------------------------------------
  // History
  // ------------------------------------------------------------------------

  Future<void> refreshHistory() async {
    history = await HistoryService.load(force: true);
    notifyListeners();
  }

  Future<void> addHistory(ExportRecord record) async {
    history = await HistoryService.add(record);
    notifyListeners();
  }

  Future<void> removeHistory(String path) async {
    history = await HistoryService.remove(path);
    notifyListeners();
  }

  Future<void> clearHistory() async {
    await HistoryService.clear();
    history = <ExportRecord>[];
    notifyListeners();
  }
}

class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child})
      : super(notifier: state);

  static AppState of(BuildContext context) {
    final AppScope? scope =
        context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope is missing above this widget.');
    return scope!.notifier!;
  }
}

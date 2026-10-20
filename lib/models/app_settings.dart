import 'edit_settings.dart';

enum SaveDest { internal, external, custom }

extension SaveDestX on SaveDest {
  String get label {
    switch (this) {
      case SaveDest.internal:
        return 'APP VAULT';
      case SaveDest.external:
        return 'DEVICE';
      case SaveDest.custom:
        return 'PICKED FOLDER';
    }
  }
}

class AppSettings {
  bool darkFinish = false;
  bool reduceMotion = false;
  bool haptics = true;
  bool turbo = true;
  OutputFormat format = OutputFormat.mp3;
  int bitrate = 320;
  LoudnessTarget target = LoudnessTarget.streaming;
  SaveDest saveDest = SaveDest.internal;
  String? treeUri;
  String? treeLabel;
  bool bootSeen = false;

  AppSettings clone() => AppSettings()
    ..darkFinish = darkFinish
    ..reduceMotion = reduceMotion
    ..haptics = haptics
    ..turbo = turbo
    ..format = format
    ..bitrate = bitrate
    ..target = target
    ..saveDest = saveDest
    ..treeUri = treeUri
    ..treeLabel = treeLabel
    ..bootSeen = bootSeen;
}

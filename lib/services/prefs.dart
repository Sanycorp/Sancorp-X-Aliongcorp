import 'package:shared_preferences/shared_preferences.dart';

import '../models/app_settings.dart';
import '../models/edit_settings.dart';

/// Persisted cockpit preferences.
class Prefs {
  const Prefs._();

  static const String _kDark = 'aegis.dark';
  static const String _kMotion = 'aegis.reduceMotion';
  static const String _kHaptics = 'aegis.haptics';
  static const String _kTurbo = 'aegis.turbo';
  static const String _kFormat = 'aegis.format';
  static const String _kBitrate = 'aegis.bitrate';
  static const String _kTarget = 'aegis.target';
  static const String _kDest = 'aegis.saveDest';
  static const String _kTree = 'aegis.tree';
  static const String _kTreeLabel = 'aegis.treeLabel';
  static const String _kBoot = 'aegis.bootSeen';

  static Future<AppSettings> load() async {
    final AppSettings s = AppSettings();
    try {
      final SharedPreferences p = await SharedPreferences.getInstance();
      s.darkFinish = p.getBool(_kDark) ?? false;
      s.reduceMotion = p.getBool(_kMotion) ?? false;
      s.haptics = p.getBool(_kHaptics) ?? true;
      s.turbo = p.getBool(_kTurbo) ?? true;
      s.bitrate = p.getInt(_kBitrate) ?? 320;
      s.treeUri = p.getString(_kTree);
      s.treeLabel = p.getString(_kTreeLabel);
      s.bootSeen = p.getBool(_kBoot) ?? false;

      final String? format = p.getString(_kFormat);
      if (format != null) {
        for (final OutputFormat f in OutputFormat.values) {
          if (f.name == format) s.format = f;
        }
      }
      final String? target = p.getString(_kTarget);
      if (target != null) {
        for (final LoudnessTarget t in LoudnessTarget.values) {
          if (t.name == target) s.target = t;
        }
      }
      final String? dest = p.getString(_kDest);
      if (dest != null) {
        for (final SaveDest d in SaveDest.values) {
          if (d.name == dest) s.saveDest = d;
        }
      }
    } catch (_) {
      // Defaults are fine.
    }
    return s;
  }

  static Future<void> save(AppSettings s) async {
    try {
      final SharedPreferences p = await SharedPreferences.getInstance();
      await p.setBool(_kDark, s.darkFinish);
      await p.setBool(_kMotion, s.reduceMotion);
      await p.setBool(_kHaptics, s.haptics);
      await p.setBool(_kTurbo, s.turbo);
      await p.setString(_kFormat, s.format.name);
      await p.setInt(_kBitrate, s.bitrate);
      await p.setString(_kTarget, s.target.name);
      await p.setString(_kDest, s.saveDest.name);
      await p.setBool(_kBoot, s.bootSeen);
      if (s.treeUri == null) {
        await p.remove(_kTree);
        await p.remove(_kTreeLabel);
      } else {
        await p.setString(_kTree, s.treeUri!);
        await p.setString(_kTreeLabel, s.treeLabel ?? '');
      }
    } catch (_) {
      // Non-fatal.
    }
  }
}

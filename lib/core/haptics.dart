import 'package:flutter/services.dart';

/// Haptics that honour the cockpit setting without threading state everywhere.
class Haptics {
  const Haptics._();

  static bool enabled = true;

  static void tap() {
    if (enabled) HapticFeedback.selectionClick();
  }

  static void medium() {
    if (enabled) HapticFeedback.mediumImpact();
  }

  static void heavy() {
    if (enabled) HapticFeedback.heavyImpact();
  }
}

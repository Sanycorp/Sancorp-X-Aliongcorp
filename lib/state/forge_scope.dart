import 'package:flutter/widgets.dart';

import 'forge_controller.dart';

/// Shares one forge engine (and one audio player) across the whole cockpit.
class ForgeScope extends InheritedNotifier<ForgeController> {
  const ForgeScope({
    super.key,
    required ForgeController controller,
    required super.child,
  }) : super(notifier: controller);

  static ForgeController of(BuildContext context) {
    final ForgeScope? scope =
        context.dependOnInheritedWidgetOfExactType<ForgeScope>();
    assert(scope != null, 'ForgeScope is missing above this widget.');
    return scope!.notifier!;
  }
}

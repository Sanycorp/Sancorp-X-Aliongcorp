import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'palette.dart';
import 'typography.dart';

/// Builds the Material shell around the mecha finish.
class MechaTheme {
  const MechaTheme._();

  static ThemeData build(MechaColors c) {
    final Brightness brightness = c.isDark ? Brightness.dark : Brightness.light;
    final ColorScheme scheme = ColorScheme.fromSeed(
      seedColor: c.cobalt,
      brightness: brightness,
    ).copyWith(
      primary: c.cobalt,
      onPrimary: c.isDark ? const Color(0xFF06101F) : Colors.white,
      secondary: c.crimson,
      onSecondary: Colors.white,
      surface: c.panel,
      onSurface: c.ink,
      error: c.crimson,
      onError: Colors.white,
      outline: c.line,
      surfaceTint: Colors.transparent,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: c.canvas,
      canvasColor: c.canvas,
      colorScheme: scheme,
      fontFamily: T.display,
      splashFactory: InkRipple.splashFactory,
      dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
      appBarTheme: AppBarTheme(
        backgroundColor: c.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: c.ink),
        titleTextStyle: T.title(18, c.ink),
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness:
              c.isDark ? Brightness.light : Brightness.dark,
          statusBarBrightness:
              c.isDark ? Brightness.dark : Brightness.light,
          systemNavigationBarColor: c.canvas,
          systemNavigationBarIconBrightness:
              c.isDark ? Brightness.light : Brightness.dark,
        ),
      ),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: c.cobalt,
        selectionColor: c.cobalt.withAlpha(60),
        selectionHandleColor: c.cobalt,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.ink,
        contentTextStyle: T.body(c.isDark ? c.canvas : Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(2)),
        ),
        insetPadding: const EdgeInsets.all(14),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.panel,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(4)),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: c.ink,
          borderRadius: BorderRadius.circular(2),
        ),
        textStyle: T.body(c.isDark ? c.canvas : Colors.white, size: 11.5),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: c.cobalt),
    );
  }
}

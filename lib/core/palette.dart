import 'package:flutter/material.dart';

/// EL TZY • AEGIS-M design tokens.
///
/// Two finishes:
///  • ARMOR   — bone-white plating, cobalt core, crimson signal, black ink.
///  • COCKPIT — night hangar view for low-light sessions.
enum MechaMode { armor, cockpit }

@immutable
class MechaColors {
  const MechaColors({
    required this.mode,
    required this.canvas,
    required this.panel,
    required this.panelAlt,
    required this.inset,
    required this.ink,
    required this.inkSoft,
    required this.inkFaint,
    required this.line,
    required this.lineStrong,
    required this.cobalt,
    required this.cobaltDeep,
    required this.crimson,
    required this.amber,
    required this.signal,
    required this.steel,
    required this.plate,
  });

  final MechaMode mode;

  /// Page background.
  final Color canvas;

  /// Card / module background.
  final Color panel;

  /// Secondary module background.
  final Color panelAlt;

  /// Recessed wells (sliders, readouts).
  final Color inset;

  final Color ink;
  final Color inkSoft;
  final Color inkFaint;
  final Color line;
  final Color lineStrong;

  /// Primary action / energy.
  final Color cobalt;
  final Color cobaltDeep;

  /// Alert / record / destructive.
  final Color crimson;

  /// Warm signal / caution.
  final Color amber;

  /// Telemetry / data.
  final Color signal;

  /// Muted metal.
  final Color steel;

  /// Pure plate (white in armor, near-white in cockpit).
  final Color plate;

  bool get isDark => mode == MechaMode.cockpit;
}

const MechaColors kArmor = MechaColors(
  mode: MechaMode.armor,
  canvas: Color(0xFFE8ECF3),
  panel: Color(0xFFFFFFFF),
  panelAlt: Color(0xFFF4F7FB),
  inset: Color(0xFFEDF1F7),
  ink: Color(0xFF0A0D12),
  inkSoft: Color(0xFF5B6779),
  inkFaint: Color(0xFF8C98AA),
  line: Color(0xFFC9D2DF),
  lineStrong: Color(0xFFA6B3C6),
  cobalt: Color(0xFF0B4FD6),
  cobaltDeep: Color(0xFF062F86),
  crimson: Color(0xFFD91E2B),
  amber: Color(0xFFF2A100),
  signal: Color(0xFF00A2C7),
  steel: Color(0xFF97A4B6),
  plate: Color(0xFFFFFFFF),
);

const MechaColors kCockpit = MechaColors(
  mode: MechaMode.cockpit,
  canvas: Color(0xFF070A0F),
  panel: Color(0xFF0E131B),
  panelAlt: Color(0xFF141B26),
  inset: Color(0xFF0A0F16),
  ink: Color(0xFFE9EFF8),
  inkSoft: Color(0xFF93A1B6),
  inkFaint: Color(0xFF66758B),
  line: Color(0xFF223042),
  lineStrong: Color(0xFF33445A),
  cobalt: Color(0xFF3D7BFF),
  cobaltDeep: Color(0xFF1B4FD0),
  crimson: Color(0xFFFF3B47),
  amber: Color(0xFFFFC24B),
  signal: Color(0xFF35D7F0),
  steel: Color(0xFF6D7D93),
  plate: Color(0xFFF4F7FB),
);

/// Inherited access to the active finish.
class MechaScope extends InheritedWidget {
  const MechaScope({super.key, required this.colors, required super.child});

  final MechaColors colors;

  static MechaColors of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<MechaScope>();
    return scope?.colors ?? kArmor;
  }

  @override
  bool updateShouldNotify(MechaScope oldWidget) =>
      oldWidget.colors != colors;
}

/// Corner cut mask bits for [chamferPath].
class Corners {
  const Corners._();

  static const int none = 0;
  static const int topLeft = 1;
  static const int topRight = 2;
  static const int bottomRight = 4;
  static const int bottomLeft = 8;
  static const int all = 15;
  static const int top = 3;
  static const int bottom = 12;
}

/// Shared hard-cut corner geometry — the shape language of the whole app.
Path chamferPath(Size size, double cut, int corners) {
  final double c = cut.clamp(0.0, size.shortestSide / 2).toDouble();
  final bool tl = (corners & Corners.topLeft) != 0;
  final bool tr = (corners & Corners.topRight) != 0;
  final bool br = (corners & Corners.bottomRight) != 0;
  final bool bl = (corners & Corners.bottomLeft) != 0;
  final Path p = Path();
  p.moveTo(tl ? c : 0, 0);
  p.lineTo(tr ? size.width - c : size.width, 0);
  if (tr) p.lineTo(size.width, c);
  p.lineTo(size.width, br ? size.height - c : size.height);
  if (br) p.lineTo(size.width - c, size.height);
  p.lineTo(bl ? c : 0, size.height);
  if (bl) p.lineTo(0, size.height - c);
  p.lineTo(0, tl ? c : 0);
  if (tl) p.lineTo(c, 0);
  p.close();
  return p;
}

class ChamferClipper extends CustomClipper<Path> {
  const ChamferClipper({this.cut = 10, this.corners = Corners.all});

  final double cut;
  final int corners;

  @override
  Path getClip(Size size) => chamferPath(size, cut, corners);

  @override
  bool shouldReclip(ChamferClipper oldClipper) =>
      oldClipper.cut != cut || oldClipper.corners != corners;
}

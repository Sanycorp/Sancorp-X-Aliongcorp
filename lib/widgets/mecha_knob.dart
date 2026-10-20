import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/palette.dart';
import '../core/typography.dart';
import '../core/haptics.dart';

/// Rotary macro control. Vertical drag to dial, double tap to reset.
class MechaKnob extends StatefulWidget {
  const MechaKnob({
    super.key,
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.code,
    this.formatter,
    this.defaultValue,
    this.accent,
    this.size = 78,
  });

  final String label;
  final double value;
  final double min;
  final double max;
  final ValueChanged<double> onChanged;
  final String? code;
  final String Function(double value)? formatter;
  final double? defaultValue;
  final Color? accent;
  final double size;

  @override
  State<MechaKnob> createState() => _MechaKnobState();
}

class _MechaKnobState extends State<MechaKnob> {
  double _startValue = 0;
  int _bucket = -1;

  double get _t {
    final double span = widget.max - widget.min;
    if (span <= 0) return 0;
    return ((widget.value - widget.min) / span).clamp(0.0, 1.0).toDouble();
  }

  String get _text =>
      widget.formatter?.call(widget.value) ?? widget.value.toStringAsFixed(2);

  void _begin(DragStartDetails _) {
    _startValue = widget.value;
    Haptics.tap();
  }

  void _update(DragUpdateDetails details) {
    final double span = widget.max - widget.min;
    final double delta = -details.delta.dy / 170 * span;
    final double next =
        (widget.value + delta).clamp(widget.min, widget.max).toDouble();
    final int bucket = (((next - widget.min) / span) * 12).round();
    if (bucket != _bucket) {
      _bucket = bucket;
      Haptics.tap();
    }
    widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color tint = widget.accent ?? c.cobalt;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onVerticalDragStart: _begin,
          onVerticalDragUpdate: _update,
          onDoubleTap: widget.defaultValue == null
              ? null
              : () {
                  Haptics.medium();
                  widget.onChanged(widget.defaultValue!);
                },
          child: SizedBox(
            width: widget.size,
            height: widget.size,
            child: CustomPaint(
              painter: _KnobPainter(
                t: _t,
                accent: tint,
                line: c.line,
                plate: c.panelAlt,
                ink: c.ink,
                isDark: c.isDark,
              ),
            ),
          ),
        ),
        const SizedBox(height: 7),
        Text(
          widget.label.toUpperCase(),
          style: T.label(c.inkSoft, size: 8, tracking: 1.3),
        ),
        const SizedBox(height: 3),
        Text(_text, style: T.metric(tint, size: 12)),
        if (widget.code != null)
          Text(widget.code!, style: T.metric(c.inkFaint, size: 7.5)),
      ],
    );
  }
}

class _KnobPainter extends CustomPainter {
  _KnobPainter({
    required this.t,
    required this.accent,
    required this.line,
    required this.plate,
    required this.ink,
    required this.isDark,
  });

  final double t;
  final Color accent;
  final Color line;
  final Color plate;
  final Color ink;
  final bool isDark;

  static const double _start = 2.356194;
  static const double _sweep = 4.712389;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset center = size.center(Offset.zero);
    final double r = size.width / 2;
    final double ringR = r * 0.92;

    // Tick ring.
    for (int i = 0; i <= 30; i++) {
      final double a = _start + _sweep * (i / 30);
      final bool major = i % 5 == 0;
      final Offset p1 = center +
          Offset(math.cos(a), math.sin(a)) * (ringR - (major ? 8 : 4.5));
      final Offset p2 = center + Offset(math.cos(a), math.sin(a)) * ringR;
      canvas.drawLine(
        p1,
        p2,
        Paint()
          ..color = i / 30 <= t ? accent : line
          ..strokeWidth = major ? 1.8 : 1,
      );
    }

    // Value arc.
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: ringR * 0.86),
      _start,
      _sweep,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = line.withAlpha(150),
    );
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: ringR * 0.86),
      _start,
      _sweep * t,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.6
        ..strokeCap = StrokeCap.square
        ..color = accent,
    );

    // Body plate.
    final double bodyR = r * 0.62;
    final Path body = chamferPath(Size.square(bodyR * 2), bodyR * 0.45, Corners.all);
    final Rect bodyRect = Rect.fromCircle(center: center, radius: bodyR);
    canvas.drawPath(
      body.shift(bodyRect.topLeft),
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[
            isDark ? ink : plate,
            isDark ? const Color(0xFF0B1119) : const Color(0xFFE4EAF3),
          ],
        ).createShader(bodyRect),
    );
    canvas.drawPath(
      body.shift(bodyRect.topLeft),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.3
        ..color = line,
    );

    // Pointer.
    final double a = _start + _sweep * t;
    final Offset tip = center + Offset(math.cos(a), math.sin(a)) * (bodyR * 0.82);
    final Offset base = center + Offset(math.cos(a), math.sin(a)) * (bodyR * 0.24);
    canvas.drawLine(
      base,
      tip,
      Paint()
        ..color = accent
        ..strokeWidth = 2.4
        ..strokeCap = StrokeCap.square,
    );
    canvas.drawCircle(center, 2.6, Paint()..color = accent);
  }

  @override
  bool shouldRepaint(_KnobPainter old) =>
      old.t != t || old.accent != accent || old.isDark != isDark;
}

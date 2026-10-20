import 'package:flutter/material.dart';

import '../core/palette.dart';
import '../core/typography.dart';

/// Segmented LED bargraph (audio level, progress, scarcity).
class SegmentedMeter extends StatelessWidget {
  const SegmentedMeter({
    super.key,
    required this.level,
    this.segments = 22,
    this.height = 10,
    this.color,
    this.peak,
    this.vertical = false,
    this.gap = 2,
  });

  final double level;
  final int segments;
  final double height;
  final Color? color;
  final double? peak;
  final bool vertical;
  final double gap;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return SizedBox(
      height: vertical ? null : height,
      width: vertical ? height : null,
      child: CustomPaint(
        painter: _MeterPainter(
          level: level.clamp(0.0, 1.0).toDouble(),
          peak: (peak ?? level).clamp(0.0, 1.0).toDouble(),
          segments: segments,
          colors: c,
          accent: color ?? c.cobalt,
          vertical: vertical,
          gap: gap,
        ),
      ),
    );
  }
}

class _MeterPainter extends CustomPainter {
  _MeterPainter({
    required this.level,
    required this.peak,
    required this.segments,
    required this.colors,
    required this.accent,
    required this.vertical,
    required this.gap,
  });

  final double level;
  final double peak;
  final int segments;
  final MechaColors colors;
  final Color accent;
  final bool vertical;
  final double gap;

  @override
  void paint(Canvas canvas, Size size) {
    final bool v = vertical;
    final double extent = v ? size.height : size.width;
    final double thickness = v ? size.width : size.height;
    final double step = extent / segments;
    final double segLen = step - gap;
    final int lit = (level * segments).ceil();
    final int peakIndex = (peak * segments).ceil() - 1;

    for (int i = 0; i < segments; i++) {
      final bool on = i < lit;
      final bool isPeak = i == peakIndex && peak > 0.04;
      final double position = i * step;
      final Rect rect = v
          ? Rect.fromLTWH(0, size.height - position - segLen, thickness, segLen)
          : Rect.fromLTWH(position, 0, segLen, thickness);

      Color tint;
      final double zone = i / segments;
      if (zone > 0.9) {
        tint = colors.crimson;
      } else if (zone > 0.72) {
        tint = colors.amber;
      } else {
        tint = accent;
      }

      canvas.drawRect(
        rect,
        Paint()
          ..color = on
              ? tint
              : (isPeak ? tint.withAlpha(150) : colors.line.withAlpha(90)),
      );
    }
  }

  @override
  bool shouldRepaint(_MeterPainter old) =>
      old.level != level ||
      old.peak != peak ||
      old.accent != accent ||
      old.colors != colors ||
      old.segments != segments;
}

/// Horizontal labelled data bar (used for engine load / spectrum preview).
class DataBar extends StatelessWidget {
  const DataBar({
    super.key,
    required this.label,
    required this.value,
    required this.readout,
    this.color,
  });

  final String label;
  final double value;
  final String readout;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  label.toUpperCase(),
                  style: T.label(c.inkFaint, size: 8.5, tracking: 1.3),
                ),
              ),
              Text(readout, style: T.metric(color ?? c.inkSoft, size: 10)),
            ],
          ),
          const SizedBox(height: 4),
          SizedBox(
            height: 6,
            child: SegmentedMeter(
              level: value,
              segments: 28,
              height: 6,
              gap: 1.6,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

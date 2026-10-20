import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/palette.dart';
import '../core/typography.dart';
import '../core/haptics.dart';

enum _DragMode { none, start, end, seek }

/// Interactive source timeline: waveform, trim brackets and playhead.
class WaveformTimeline extends StatefulWidget {
  const WaveformTimeline({
    super.key,
    required this.peaks,
    required this.duration,
    required this.trimStart,
    required this.trimEnd,
    required this.playhead,
    required this.onSeek,
    required this.onTrimChanged,
    this.loading = false,
    this.enabled = true,
    this.height = 104,
  });

  final List<double> peaks;
  final double duration;
  final double trimStart;
  final double trimEnd;
  final double playhead;
  final ValueChanged<double> onSeek;
  final void Function(double start, double end) onTrimChanged;
  final bool loading;
  final bool enabled;
  final double height;

  @override
  State<WaveformTimeline> createState() => _WaveformTimelineState();
}

class _WaveformTimelineState extends State<WaveformTimeline> {
  _DragMode _mode = _DragMode.none;

  double get _end =>
      widget.trimEnd <= 0.05 ? widget.duration : widget.trimEnd;

  double get _minGap => math.max(0.35, widget.duration * 0.01);

  double _secondsFor(double dx, double width) {
    if (width <= 0 || widget.duration <= 0) return 0;
    return ((dx / width).clamp(0.0, 1.0) * widget.duration).toDouble();
  }

  void _down(Offset p, double w) {
    if (!widget.enabled || widget.duration <= 0) return;
    final double xs = _end == 0 ? 0 : widget.trimStart / widget.duration * w;
    final double xe = _end / widget.duration * w;
    if ((p.dx - xs).abs() <= 24) {
      _mode = _DragMode.start;
      Haptics.tap();
    } else if ((p.dx - xe).abs() <= 24) {
      _mode = _DragMode.end;
      Haptics.tap();
    } else {
      _mode = _DragMode.seek;
      widget.onSeek(_secondsFor(p.dx, w));
    }
  }

  void _move(Offset p, double w) {
    if (!widget.enabled || widget.duration <= 0) return;
    final double t = _secondsFor(p.dx, w);
    switch (_mode) {
      case _DragMode.seek:
        widget.onSeek(t);
        break;
      case _DragMode.start:
        final double next =
            math.min(t, _end - _minGap).clamp(0.0, widget.duration).toDouble();
        widget.onTrimChanged(next, widget.trimEnd);
        break;
      case _DragMode.end:
        final double next =
            math.max(t, widget.trimStart + _minGap)
                .clamp(0.0, widget.duration)
                .toDouble();
        widget.onTrimChanged(widget.trimStart, next);
        break;
      case _DragMode.none:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    if (widget.loading) {
      return Container(
        height: widget.height,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: c.inset,
          border: Border.all(color: c.line),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            SizedBox(
              width: 120,
              child: LinearProgressIndicator(
                minHeight: 2,
                backgroundColor: c.line,
                valueColor: AlwaysStoppedAnimation<Color>(c.cobalt),
              ),
            ),
            const SizedBox(height: 10),
            Text('DECODING SOURCE…', style: T.label(c.inkFaint, size: 9)),
          ],
        ),
      );
    }

    return LayoutBuilder(
      builder: (BuildContext ctx, BoxConstraints box) {
        final double w = box.maxWidth;
        return Column(
          children: <Widget>[
            SizedBox(
              height: widget.height,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (TapDownDetails d) {
                  if (!widget.enabled || widget.duration <= 0) return;
                  widget.onSeek(_secondsFor(d.localPosition.dx, w));
                },
                onHorizontalDragStart: (DragStartDetails d) =>
                    _down(d.localPosition, w),
                onHorizontalDragUpdate: (DragUpdateDetails d) =>
                    _move(d.localPosition, w),
                onHorizontalDragEnd: (_) => _mode = _DragMode.none,
                onHorizontalDragCancel: () => _mode = _DragMode.none,
                child: CustomPaint(
                  painter: _WavePainter(
                    peaks: widget.peaks,
                    duration: widget.duration,
                    start: widget.trimStart,
                    end: _end,
                    playhead: widget.playhead,
                    colors: c,
                    enabled: widget.enabled,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 5),
            Row(
              children: <Widget>[
                Text(fmtTime(widget.trimStart, tenths: true),
                    style: T.metric(c.cobalt, size: 10)),
                const Spacer(),
                Text(
                  'TRIM ${fmtTime(_end - widget.trimStart, tenths: true)}',
                  style: T.label(c.inkFaint, size: 8.5, tracking: 1.4),
                ),
                const Spacer(),
                Text(fmtTime(widget.duration, tenths: true),
                    style: T.metric(c.inkSoft, size: 10)),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _WavePainter extends CustomPainter {
  _WavePainter({
    required this.peaks,
    required this.duration,
    required this.start,
    required this.end,
    required this.playhead,
    required this.colors,
    required this.enabled,
  });

  final List<double> peaks;
  final double duration;
  final double start;
  final double end;
  final double playhead;
  final MechaColors colors;
  final bool enabled;

  @override
  void paint(Canvas canvas, Size size) {
    final Rect full = Offset.zero & size;
    final Path plate = chamferPath(size, 8, Corners.all);
    canvas.save();
    canvas.clipPath(plate);
    canvas.drawRect(full, Paint()..color = colors.inset);

    // Grid.
    final Paint grid = Paint()
      ..color = colors.line.withAlpha(120)
      ..strokeWidth = 0.7;
    for (double x = 0; x < size.width; x += size.width / 8) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    canvas.drawLine(
      Offset(0, size.height / 2),
      Offset(size.width, size.height / 2),
      Paint()..color = colors.line.withAlpha(160),
    );

    final double xStart =
        duration <= 0
            ? 0.0
            : ((start / duration).clamp(0.0, 1.0) * size.width).toDouble();
    final double xEnd =
        duration <= 0
            ? size.width
            : ((end / duration).clamp(0.0, 1.0) * size.width).toDouble();

    // Waveform.
    final int bars = peaks.isEmpty ? 0 : math.min(peaks.length, 520);
    if (bars > 0) {
      final double step = size.width / bars;
      final double mid = size.height / 2;
      final double maxH = size.height * 0.78;
      final Paint inside = Paint()..color = colors.cobalt;
      final Paint outside = Paint()..color = colors.steel.withAlpha(120);
      for (int i = 0; i < bars; i++) {
        final double v = peaks[i].clamp(0.0, 1.0).toDouble();
        final double h = math.max(1.5, v * maxH);
        final double x = i * step + step * 0.5;
        final bool inRange = i * step >= xStart && i * step <= xEnd;
        canvas.drawRect(
          Rect.fromLTWH(x - math.max(0.8, step * 0.32), mid - h / 2,
              math.max(1.4, step * 0.64), h),
          inRange ? inside : outside,
        );
      }
    } else {
      canvas.drawLine(
        Offset(0, size.height / 2),
        Offset(size.width, size.height / 2),
        Paint()
          ..color = colors.lineStrong
          ..strokeWidth = 1.2,
      );
    }

    // Dim outside selection.
    final Paint dim = Paint()..color = colors.canvas.withAlpha(120);
    canvas.drawRect(Rect.fromLTWH(0, 0, xStart, size.height), dim);
    canvas.drawRect(
      Rect.fromLTWH(xEnd, 0, size.width - xEnd, size.height),
      dim,
    );

    // Brackets.
    _handle(canvas, xStart, size, colors.crimson);
    _handle(canvas, xEnd, size, colors.cobalt);

    // Playhead.
    if (duration > 0) {
      final double px =
          ((playhead / duration).clamp(0.0, 1.0) * size.width).toDouble();
      canvas.drawLine(
        Offset(px, 0),
        Offset(px, size.height),
        Paint()
          ..color = colors.amber
          ..strokeWidth = 1.4,
      );
      final Path tri = Path()
        ..moveTo(px - 4, 0)
        ..lineTo(px + 4, 0)
        ..lineTo(px, 6)
        ..close();
      canvas.drawPath(tri, Paint()..color = colors.amber);
    }

    canvas.restore();

    canvas.drawPath(
      plate,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = colors.lineStrong,
    );
  }

  void _handle(Canvas canvas, double x, Size size, Color tone) {
    canvas.drawRect(
      Rect.fromLTWH(x - 1.2, 0, 2.4, size.height),
      Paint()..color = tone,
    );
    final Path cap = chamferPath(const Size(10, 16), 3, Corners.all);
    canvas.drawPath(cap.shift(Offset(x - 5, 4)), Paint()..color = tone);
    canvas.drawPath(
      cap.shift(Offset(x - 5, size.height - 20)),
      Paint()..color = tone,
    );
    final Paint grip = Paint()
      ..color = Colors.white.withAlpha(190)
      ..strokeWidth = 1;
    for (int i = 0; i < 3; i++) {
      final double gx = x - 2.4 + i * 2.4;
      canvas.drawLine(Offset(gx, 8), Offset(gx, 15), grip);
      canvas.drawLine(
        Offset(gx, size.height - 16),
        Offset(gx, size.height - 9),
        grip,
      );
    }
  }

  @override
  bool shouldRepaint(_WavePainter old) =>
      old.peaks != peaks ||
      old.start != start ||
      old.end != end ||
      old.playhead != playhead ||
      old.colors != colors ||
      old.enabled != enabled;
}

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/palette.dart';

/// Blueprint grid, corner brackets, haze sweep and vignette.
class HudBackground extends StatefulWidget {
  const HudBackground({
    super.key,
    this.animate = true,
    this.gridStep = 28,
    this.intensity = 1,
  });

  final bool animate;
  final double gridStep;
  final double intensity;

  @override
  State<HudBackground> createState() => _HudBackgroundState();
}

class _HudBackgroundState extends State<HudBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 11),
  );

  @override
  void initState() {
    super.initState();
    if (widget.animate) _c.repeat();
  }

  @override
  void didUpdateWidget(HudBackground oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.animate && !_c.isAnimating) {
      _c.repeat();
    } else if (!widget.animate && _c.isAnimating) {
      _c.stop();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _c,
        builder: (BuildContext context, Widget? child) {
          return CustomPaint(
            size: Size.infinite,
            painter: _HudPainter(
              progress: _c.value,
              colors: c,
              step: widget.gridStep,
              intensity: widget.intensity,
            ),
          );
        },
      ),
    );
  }
}

class _HudPainter extends CustomPainter {
  _HudPainter({
    required this.progress,
    required this.colors,
    required this.step,
    required this.intensity,
  });

  final double progress;
  final MechaColors colors;
  final double step;
  final double intensity;

  @override
  void paint(Canvas canvas, Size size) {
    final Color line = colors.line;
    final Paint thin = Paint()
      ..color = line.withAlpha((colors.isDark ? 26 : 34) * intensity.toInt())
      ..strokeWidth = 0.7;

    for (double x = 0; x <= size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), thin);
    }
    for (double y = 0; y <= size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), thin);
    }

    final Paint major = Paint()
      ..color = line.withAlpha((colors.isDark ? 42 : 60) * intensity.toInt())
      ..strokeWidth = 1;
    for (double x = 0; x <= size.width; x += step * 4) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), major);
    }
    for (double y = 0; y <= size.height; y += step * 4) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), major);
    }

    // Sweeping haze.
    final double bandY = progress * (size.height + 220) - 110;
    final Rect band = Rect.fromLTWH(0, bandY, size.width, 110);
    canvas.drawRect(
      band,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[
            colors.cobalt.withAlpha(0),
            colors.cobalt.withAlpha(12),
            colors.cobalt.withAlpha(0),
          ],
        ).createShader(band),
    );

    // Corner brackets.
    final Paint bracket = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = colors.cobalt.withAlpha(120);
    const double b = 26;
    canvas.drawLine(const Offset(12, 12), const Offset(12 + b, 12), bracket);
    canvas.drawLine(const Offset(12, 12), const Offset(12, 12 + b), bracket);
    canvas.drawLine(
      Offset(size.width - 12, size.height - 12),
      Offset(size.width - 12 - b, size.height - 12),
      bracket,
    );
    canvas.drawLine(
      Offset(size.width - 12, size.height - 12),
      Offset(size.width - 12, size.height - 12 - b),
      bracket,
    );

    // Hazard stripes, top right.
    final Rect hazard = Rect.fromLTWH(size.width - 92, 14, 78, 9);
    canvas.save();
    canvas.clipRect(hazard);
    canvas.drawRect(hazard, Paint()..color = colors.ink.withAlpha(10));
    final Paint stripe = Paint()
      ..color = colors.amber.withAlpha(120)
      ..strokeWidth = 3.4;
    for (double x = hazard.left - 20; x < hazard.right + 20; x += 11) {
      canvas.drawLine(
        Offset(x, hazard.bottom),
        Offset(x + 10, hazard.top),
        stripe,
      );
    }
    canvas.restore();

    // Vignette.
    final Rect full = Offset.zero & size;
    canvas.drawRect(
      full,
      Paint()
        ..shader = RadialGradient(
          radius: 0.95,
          colors: <Color>[
            colors.canvas.withAlpha(0),
            colors.canvas.withAlpha(colors.isDark ? 150 : 90),
          ],
          stops: const <double>[0.55, 1],
        ).createShader(full),
    );
  }

  @override
  bool shouldRepaint(_HudPainter old) =>
      old.progress != progress ||
      old.colors != colors ||
      old.step != step ||
      old.intensity != intensity;
}

/// Blinking status lamp with label.
class StatusLamp extends StatefulWidget {
  const StatusLamp({
    super.key,
    required this.label,
    this.color,
    this.blink = true,
    this.dense = false,
  });

  final String label;
  final Color? color;
  final bool blink;
  final bool dense;

  @override
  State<StatusLamp> createState() => _StatusLampState();
}

class _StatusLampState extends State<StatusLamp>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );

  @override
  void initState() {
    super.initState();
    if (widget.blink) _c.repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color tint = widget.color ?? c.cobalt;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        AnimatedBuilder(
          animation: _c,
          builder: (BuildContext context, Widget? child) {
            final double v = widget.blink ? 0.45 + 0.55 * _c.value : 1;
            return Container(
              width: widget.dense ? 6 : 7,
              height: widget.dense ? 6 : 7,
              decoration: BoxDecoration(
                color: tint.withAlpha((255 * v).round()),
                boxShadow: <BoxShadow>[
                  BoxShadow(
                    color: tint.withAlpha((120 * v).round()),
                    blurRadius: 7,
                    spreadRadius: 1,
                  ),
                ],
              ),
            );
          },
        ),
        const SizedBox(width: 6),
        Text(
          widget.label.toUpperCase(),
          style: _hudLabel(c.inkSoft, widget.dense ? 8.5 : 9),
        ),
      ],
    );
  }
}

/// Tiny text helper kept local so the background file stays dependency-light.
TextStyle _hudLabel(Color color, double size) => TextStyle(
      fontFamily: 'ChakraPetch',
      fontSize: size,
      letterSpacing: 1.6,
      fontWeight: FontWeight.w600,
      color: color,
    );

/// Decorative rotating target used on hero cards.
class RadarSweep extends StatefulWidget {
  const RadarSweep({super.key, this.size = 120, this.color});

  final double size;
  final Color? color;

  @override
  State<RadarSweep> createState() => _RadarSweepState();
}

class _RadarSweepState extends State<RadarSweep>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 6),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color tint = widget.color ?? c.cobalt;
    return AnimatedBuilder(
      animation: _c,
      builder: (BuildContext context, Widget? child) {
        return Transform.rotate(
          angle: _c.value * math.pi * 2,
          child: CustomPaint(
            size: Size.square(widget.size),
            painter: _RadarPainter(tint: tint, line: c.line),
          ),
        );
      },
    );
  }
}

class _RadarPainter extends CustomPainter {
  _RadarPainter({required this.tint, required this.line});

  final Color tint;
  final Color line;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset center = size.center(Offset.zero);
    final double r = size.width / 2;
    canvas.drawCircle(
      center,
      r * 0.96,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = line,
    );
    canvas.drawCircle(
      center,
      r * 0.64,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8
        ..color = line.withAlpha(150),
    );
    canvas.drawCircle(
      center,
      r * 0.3,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8
        ..color = line.withAlpha(150),
    );
    for (int i = 0; i < 12; i++) {
      final double a = i / 12 * math.pi * 2;
      final Offset p1 =
          center + Offset(math.cos(a) * r * 0.86, math.sin(a) * r * 0.86);
      final Offset p2 =
          center + Offset(math.cos(a) * r * 0.96, math.sin(a) * r * 0.96);
      canvas.drawLine(
        p1,
        p2,
        Paint()
          ..color = tint.withAlpha(150)
          ..strokeWidth = 1.2,
      );
    }
    final Path wedge = Path()
      ..moveTo(center.dx, center.dy)
      ..arcTo(
        Rect.fromCircle(center: center, radius: r * 0.9),
        -0.5,
        0.6,
        false,
      )
      ..close();
    canvas.drawPath(
      wedge,
      Paint()
        ..shader = SweepGradient(
          startAngle: -0.5,
          endAngle: 0.1,
          colors: <Color>[tint.withAlpha(0), tint.withAlpha(90)],
        ).createShader(Rect.fromCircle(center: center, radius: r)),
    );
    canvas.drawCircle(center, 2.4, Paint()..color = tint);
  }

  @override
  bool shouldRepaint(_RadarPainter old) =>
      old.tint != tint || old.line != line;
}

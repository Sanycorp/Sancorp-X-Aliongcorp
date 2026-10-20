import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/palette.dart';
import '../core/typography.dart';

/// Cold-start sequence: the app boots like a machine, then hands over.
class BootSequence extends StatefulWidget {
  const BootSequence({
    super.key,
    required this.onDone,
    this.duration = const Duration(milliseconds: 1900),
    this.skipOnTap = true,
  });

  final VoidCallback onDone;
  final Duration duration;
  final bool skipOnTap;

  @override
  State<BootSequence> createState() => _BootSequenceState();
}

class _BootSequenceState extends State<BootSequence>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: widget.duration,
  )..forward();

  static const List<String> _lines = <String>[
    'CORE ARRAY ............ ONLINE',
    'DSP RACK ............. ARMED',
    'LOUDNESS SHIELD ...... READY',
    'STORAGE BUS .......... LINKED',
  ];

  @override
  void initState() {
    super.initState();
    _c.addStatusListener((AnimationStatus status) {
      if (status == AnimationStatus.completed) widget.onDone();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _skip() {
    if (widget.skipOnTap && !_c.isCompleted) {
      _c.forward(from: 0.999);
    }
  }

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return GestureDetector(
      onTap: _skip,
      child: ColoredBox(
        color: c.canvas,
        child: AnimatedBuilder(
          animation: _c,
          builder: (BuildContext context, Widget? child) {
            final double p = _c.value;
            final int visible =
                (p * (_lines.length + 1)).floor().clamp(0, _lines.length).toInt();
            return Stack(
              fit: StackFit.expand,
              children: <Widget>[
                CustomPaint(painter: _BootGridPainter(c, p)),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 28,
                      vertical: 24,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Row(
                          children: <Widget>[
                            Container(width: 3, height: 12, color: c.cobalt),
                            const SizedBox(width: 8),
                            Text('AEGIS-M // BOOT',
                                style: T.label(c.inkFaint, size: 9)),
                            const Spacer(),
                            Text('V7.0.0', style: T.metric(c.inkFaint, size: 9)),
                          ],
                        ),
                        const Spacer(),
                        Center(
                          child: SizedBox(
                            width: 230,
                            height: 230,
                            child: CustomPaint(
                              painter: _EmblemPainter(c, p),
                            ),
                          ),
                        ),
                        const SizedBox(height: 26),
                        Center(
                          child: Column(
                            children: <Widget>[
                              Text(
                                'EL TZY',
                                style: T.hero(44, c.ink).copyWith(
                                  letterSpacing: 8,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'MECHA AUDIO FORGE',
                                style: T.label(c.cobalt, size: 10, tracking: 5),
                              ),
                            ],
                          ),
                        ),
                        const Spacer(),
                        ...List<Widget>.generate(_lines.length, (int i) {
                          final bool on = i < visible;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: AnimatedOpacity(
                              duration: const Duration(milliseconds: 220),
                              opacity: on ? 1 : 0.12,
                              child: Row(
                                children: <Widget>[
                                  Container(
                                    width: 5,
                                    height: 5,
                                    color: on ? c.cobalt : c.line,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    _lines[i],
                                    style: T.metric(
                                      on ? c.inkSoft : c.inkFaint,
                                      size: 9.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }),
                        const SizedBox(height: 14),
                        _BootBar(progress: p, colors: c),
                        const SizedBox(height: 10),
                        Row(
                          children: <Widget>[
                            Text(
                              p >= 1 ? 'SYSTEM READY' : 'INITIALISING…',
                              style: T.label(
                                p >= 1 ? c.cobalt : c.inkFaint,
                                size: 9,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              '${(p * 100).round().toString().padLeft(3, '0')}%',
                              style: T.metric(c.inkSoft, size: 10),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _BootBar extends StatelessWidget {
  const _BootBar({required this.progress, required this.colors});

  final double progress;
  final MechaColors colors;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints box) {
        const int segments = 34;
        final double step = box.maxWidth / segments;
        final int lit = (progress * segments).ceil();
        return SizedBox(
          height: 8,
          child: Row(
            children: List<Widget>.generate(segments, (int i) {
              return Container(
                width: step - 2,
                height: 8,
                margin: const EdgeInsets.only(right: 2),
                color: i < lit ? colors.cobalt : colors.line,
              );
            }),
          ),
        );
      },
    );
  }
}

class _EmblemPainter extends CustomPainter {
  _EmblemPainter(this.colors, this.progress);

  final MechaColors colors;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset center = size.center(Offset.zero);
    final double r = size.width * 0.42;
    final double rot = progress * math.pi * 1.2;

    // Outer segmented ring.
    for (int i = 0; i < 48; i++) {
      final double a = i / 48 * math.pi * 2;
      final bool long = i % 4 == 0;
      final double r1 = r * 0.92;
      final double r2 = r * (long ? 1.02 : 0.97);
      canvas.drawLine(
        center + Offset(math.cos(a) * r1, math.sin(a) * r1),
        center + Offset(math.cos(a) * r2, math.sin(a) * r2),
        Paint()
          ..color = colors.lineStrong.withAlpha(long ? 220 : 110)
          ..strokeWidth = long ? 1.8 : 1,
      );
    }

    // Rotating arcs.
    final Rect arcRect = Rect.fromCircle(center: center, radius: r * 0.78);
    final Paint arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.square
      ..color = colors.cobalt;
    canvas.drawArc(arcRect, rot, 1.1, false, arc);
    canvas.drawArc(arcRect, rot + math.pi, 0.6, false, arc);

    final Paint accent = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..color = colors.crimson;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: r * 0.62),
      -rot * 1.6,
      0.9,
      false,
      accent,
    );

    // Plate + E glyph.
    final Path plate = Path()
      ..moveTo(center.dx - r * 0.46, center.dy - r * 0.5)
      ..lineTo(center.dx + r * 0.46, center.dy - r * 0.5)
      ..lineTo(center.dx + r * 0.46, center.dy + r * 0.2)
      ..lineTo(center.dx + r * 0.2, center.dy + r * 0.5)
      ..lineTo(center.dx - r * 0.46, center.dy + r * 0.5)
      ..close();
    canvas.drawPath(plate, Paint()..color = colors.ink);
    final Paint glyph = Paint()..color = colors.plate;
    final double gx = center.dx - r * 0.26;
    final double gy = center.dy - r * 0.28;
    canvas.drawRect(Rect.fromLTWH(gx, gy, r * 0.44, r * 0.08), glyph);
    canvas.drawRect(Rect.fromLTWH(gx, gy + r * 0.16, r * 0.32, r * 0.08), glyph);
    canvas.drawRect(Rect.fromLTWH(gx, gy + r * 0.32, r * 0.44, r * 0.08), glyph);
    canvas.drawRect(Rect.fromLTWH(gx, gy, r * 0.08, r * 0.4), glyph);

    // Crimson slash.
    canvas.drawRect(
      Rect.fromLTWH(center.dx + r * 0.3, center.dy - r * 0.44, r * 0.07, r * 0.9),
      Paint()..color = colors.crimson,
    );
  }

  @override
  bool shouldRepaint(_EmblemPainter old) =>
      old.progress != progress || old.colors != colors;
}

class _BootGridPainter extends CustomPainter {
  _BootGridPainter(this.colors, this.progress);

  final MechaColors colors;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint p = Paint()
      ..color = colors.line.withAlpha(60)
      ..strokeWidth = 0.7;
    for (double x = 0; x < size.width; x += 26) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), p);
    }
    for (double y = 0; y < size.height; y += 26) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), p);
    }
    final Rect band = Rect.fromLTWH(0, size.height * progress - 60, size.width, 120);
    canvas.drawRect(
      band,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[
            colors.cobalt.withAlpha(0),
            colors.cobalt.withAlpha(16),
            colors.cobalt.withAlpha(0),
          ],
        ).createShader(band),
    );
  }

  @override
  bool shouldRepaint(_BootGridPainter old) => old.progress != progress;
}

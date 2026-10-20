import 'package:flutter/material.dart';

import '../core/palette.dart';
import '../core/typography.dart';
import '../core/haptics.dart';

enum MechaTone { primary, danger, ink, ghost, amber }

/// Chunky chamfered action block with press physics and a light sweep.
class MechaButton extends StatefulWidget {
  const MechaButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.tone = MechaTone.primary,
    this.busy = false,
    this.expand = false,
    this.small = false,
    this.code,
    this.sweep = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final MechaTone tone;
  final bool busy;
  final bool expand;
  final bool small;
  final String? code;
  final bool sweep;

  @override
  State<MechaButton> createState() => _MechaButtonState();
}

class _MechaButtonState extends State<MechaButton>
    with SingleTickerProviderStateMixin {
  bool _pressed = false;
  late final AnimationController _sweep = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3200),
  );

  @override
  void initState() {
    super.initState();
    if (widget.sweep) _sweep.repeat();
  }

  @override
  void dispose() {
    _sweep.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final bool enabled = widget.onPressed != null && !widget.busy;

    late final Color fill;
    late final Color border;
    late final Color fg;
    switch (widget.tone) {
      case MechaTone.primary:
        fill = c.cobalt;
        border = c.cobaltDeep;
        fg = c.isDark ? const Color(0xFF02101F) : Colors.white;
        break;
      case MechaTone.danger:
        fill = c.crimson;
        border = c.crimson;
        fg = Colors.white;
        break;
      case MechaTone.amber:
        fill = c.amber;
        border = c.amber;
        fg = const Color(0xFF1A1200);
        break;
      case MechaTone.ink:
        fill = c.ink;
        border = c.ink;
        fg = c.canvas;
        break;
      case MechaTone.ghost:
        fill = c.panelAlt;
        border = c.lineStrong;
        fg = c.ink;
        break;
    }

    final double height = widget.small ? 38 : 52;
    final Widget label = Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        if (widget.icon != null) ...<Widget>[
          Icon(widget.icon, size: widget.small ? 15 : 18, color: fg),
          const SizedBox(width: 8),
        ],
        Text(
          widget.label.toUpperCase(),
          style: T.label(fg, size: widget.small ? 10 : 11.5, tracking: 1.9),
        ),
        if (widget.code != null) ...<Widget>[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
            color: fg.withAlpha(30),
            child: Text(
              widget.code!,
              style: T.metric(fg.withAlpha(210), size: 8.5, tracking: 1),
            ),
          ),
        ],
      ],
    );

    return Opacity(
      opacity: enabled ? 1 : 0.45,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
        onTapCancel: () => setState(() => _pressed = false),
        onTapUp: enabled
            ? (_) {
                setState(() => _pressed = false);
                Haptics.medium();
                widget.onPressed!();
              }
            : null,
        child: AnimatedScale(
          scale: _pressed ? 0.972 : 1,
          duration: const Duration(milliseconds: 90),
          curve: Curves.easeOut,
          child: SizedBox(
            width: widget.expand ? double.infinity : null,
            height: height,
            child: ClipPath(
              clipper: const ChamferClipper(cut: 9),
              child: Stack(
                fit: StackFit.expand,
                children: <Widget>[
                  ColoredBox(color: fill),
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 0,
                    height: 1.2,
                    child: ColoredBox(color: Colors.white.withAlpha(
                      widget.tone == MechaTone.ghost ? 90 : 40,
                    )),
                  ),
                  if (widget.sweep && enabled)
                    AnimatedBuilder(
                      animation: _sweep,
                      builder: (BuildContext ctx, Widget? _) {
                        return LayoutBuilder(
                          builder: (BuildContext ctx, BoxConstraints box) {
                            final double w = box.maxWidth;
                            final double x = -0.4 * w + _sweep.value * 1.8 * w;
                            return Transform.translate(
                              offset: Offset(x, 0),
                              child: Transform.rotate(
                                angle: -0.35,
                                child: Container(
                                  width: w * 0.18,
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      begin: Alignment.topCenter,
                                      end: Alignment.bottomCenter,
                                      colors: <Color>[
                                        Colors.white.withAlpha(0),
                                        Colors.white.withAlpha(46),
                                        Colors.white.withAlpha(0),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        );
                      },
                    ),
                  Center(child: label),
                  CustomPaint(
                    painter: _FramePainter(
                      color: border,
                      accent: Colors.white.withAlpha(60),
                    ),
                  ),
                  if (widget.busy)
                    ColoredBox(
                      color: fill.withAlpha(225),
                      child: Center(
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.2,
                            valueColor: AlwaysStoppedAnimation<Color>(fg),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FramePainter extends CustomPainter {
  _FramePainter({required this.color, required this.accent});

  final Color color;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final Rect inner =
        Rect.fromLTWH(0.7, 0.7, size.width - 1.4, size.height - 1.4);
    canvas.drawPath(
      chamferPath(inner.size, 9, Corners.all).shift(inner.topLeft),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = color,
    );
    canvas.drawLine(
      Offset(size.width * 0.5 - 10, size.height - 3),
      Offset(size.width * 0.5 + 10, size.height - 3),
      Paint()
        ..color = accent
        ..strokeWidth = 1.4,
    );
  }

  @override
  bool shouldRepaint(_FramePainter old) =>
      old.color != color || old.accent != accent;
}

/// Compact square icon button with the same plate language.
class MechaIconButton extends StatelessWidget {
  const MechaIconButton({
    super.key,
    required this.icon,
    this.onPressed,
    this.tone,
    this.size = 40,
    this.tooltip,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final Color? tone;
  final double size;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color tint = tone ?? c.ink;
    final Widget button = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onPressed == null
          ? null
          : () {
              Haptics.tap();
              onPressed!();
            },
      child: SizedBox(
        width: size,
        height: size,
        child: ClipPath(
          clipper: const ChamferClipper(cut: 7),
          child: Container(
            decoration: BoxDecoration(
              color: c.panelAlt,
              border: Border.all(color: c.lineStrong, width: 1.1),
            ),
            child: Icon(icon, size: size * 0.46, color: tint),
          ),
        ),
      ),
    );
    if (tooltip == null) return button;
    return Tooltip(message: tooltip!, child: button);
  }
}

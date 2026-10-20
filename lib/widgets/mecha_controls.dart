import 'package:flutter/material.dart';

import '../core/palette.dart';
import '../core/typography.dart';
import '../core/haptics.dart';

/// Mechanical toggle lever.
class MechaSwitch extends StatelessWidget {
  const MechaSwitch({
    super.key,
    required this.value,
    required this.onChanged,
    this.accent,
  });

  final bool value;
  final ValueChanged<bool>? onChanged;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color tint = accent ?? c.cobalt;
    final bool enabled = onChanged != null;
    return Opacity(
      opacity: enabled ? 1 : 0.45,
      child: GestureDetector(
        onTap: enabled
            ? () {
                Haptics.tap();
                onChanged!(!value);
              }
            : null,
        child: ClipPath(
          clipper: const ChamferClipper(cut: 7),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 170),
            curve: Curves.easeOutCubic,
            width: 60,
            height: 30,
            decoration: BoxDecoration(
              color: value ? tint : c.inset,
              border: Border.all(
                color: value ? tint : c.lineStrong,
                width: 1.1,
              ),
            ),
            child: Stack(
              children: <Widget>[
                AnimatedAlign(
                  alignment: value ? Alignment.centerRight : Alignment.centerLeft,
                  duration: const Duration(milliseconds: 170),
                  curve: Curves.easeOutCubic,
                  child: Container(
                    width: 28,
                    height: 30,
                    color: value ? Colors.white.withAlpha(232) : c.panel,
                    child: Center(
                      child: Text(
                        value ? 'I' : 'O',
                        style: T.metric(
                          value ? tint : c.inkFaint,
                          size: 12,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Slider with a segmented LED track, chamfered thumb and mono readout.
class MechaSlider extends StatefulWidget {
  const MechaSlider({
    super.key,
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.code,
    this.hint,
    this.formatter,
    this.defaultValue,
    this.accent,
  });

  final String label;
  final double value;
  final double min;
  final double max;
  final ValueChanged<double> onChanged;
  final String? code;
  final String? hint;
  final String Function(double value)? formatter;
  final double? defaultValue;
  final Color? accent;

  @override
  State<MechaSlider> createState() => _MechaSliderState();
}

class _MechaSliderState extends State<MechaSlider> {
  int _bucket = -1;

  double get _t {
    final double span = widget.max - widget.min;
    if (span <= 0) return 0;
    return ((widget.value - widget.min) / span).clamp(0.0, 1.0).toDouble();
  }

  String get _text {
    if (widget.formatter != null) return widget.formatter!(widget.value);
    return widget.value.toStringAsFixed(2);
  }

  void _emit(double dx, double width) {
    const double inset = 7;
    final double usable = width - inset * 2;
    if (usable <= 0) return;
    final double t = ((dx - inset) / usable).clamp(0.0, 1.0).toDouble();
    final double next = widget.min + (widget.max - widget.min) * t;
    final int bucket = (t * 10).round();
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              if (widget.code != null) ...<Widget>[
                Text(widget.code!, style: T.metric(c.inkFaint, size: 9)),
                const SizedBox(width: 6),
              ],
              Expanded(
                child: Text(
                  widget.label.toUpperCase(),
                  style: T.label(c.inkSoft, size: 10, tracking: 1.5),
                ),
              ),
              Text(_text, style: T.metric(tint, size: 14)),
            ],
          ),
          if (widget.hint != null) ...<Widget>[
            const SizedBox(height: 3),
            Text(widget.hint!, style: T.body(c.inkFaint, size: 10.5)),
          ],
          const SizedBox(height: 7),
          LayoutBuilder(
            builder: (BuildContext ctx, BoxConstraints box) {
              final double w = box.maxWidth;
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (TapDownDetails d) => _emit(d.localPosition.dx, w),
                onHorizontalDragStart: (DragStartDetails d) =>
                    _emit(d.localPosition.dx, w),
                onHorizontalDragUpdate: (DragUpdateDetails d) =>
                    _emit(d.localPosition.dx, w),
                onDoubleTap: widget.defaultValue == null
                    ? null
                    : () {
                        Haptics.medium();
                        widget.onChanged(widget.defaultValue!);
                      },
                child: SizedBox(
                  height: 28,
                  width: w,
                  child: CustomPaint(
                    painter: _TrackPainter(
                      t: _t,
                      accent: tint,
                      line: c.line,
                      inset: c.inset,
                      plate: c.panel,
                      dark: c.isDark,
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _TrackPainter extends CustomPainter {
  _TrackPainter({
    required this.t,
    required this.accent,
    required this.line,
    required this.inset,
    required this.plate,
    required this.dark,
  });

  final double t;
  final Color accent;
  final Color line;
  final Color inset;
  final Color plate;
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    const double insetX = 7;
    final double usable = size.width - insetX * 2;
    final double mid = size.height / 2;
    final int segments = (usable / 9).floor().clamp(12, 40).toInt();
    final double segW = usable / segments;

    final Paint off = Paint()..color = dark ? line.withAlpha(150) : line;
    final Paint on = Paint()..color = accent;
    final Paint dim = Paint()..color = line.withAlpha(90);

    for (int i = 0; i < segments; i++) {
      final double left = insetX + i * segW;
      final double onEdge = (t * segments);
      final bool active = i < onEdge;
      final bool partial = i < onEdge + 1 && i >= onEdge;

      final double h = active || partial ? 12 : 7;
      final Rect r = Rect.fromLTWH(left + 1, mid - h / 2, segW - 2, h);
      canvas.drawRect(r, active ? on : (partial ? on : off));
      if (!active && !partial) {
        canvas.drawRect(
          Rect.fromLTWH(left + 1, mid - 1, segW - 2, 2),
          dim,
        );
      }
    }

    // Thumb.
    final double x = insetX + usable * t;
    final Rect thumb = Rect.fromCenter(
      center: Offset(x, mid),
      width: 8,
      height: 22,
    );
    final Path thumbPath = chamferPath(thumb.size, 2.5, Corners.all)
        .shift(Offset(thumb.left, thumb.top));
    canvas.drawPath(thumbPath, Paint()..color = plate);
    canvas.drawPath(
      thumbPath,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..color = accent,
    );
    canvas.drawRect(
      Rect.fromLTWH(x - 1, mid - 6, 2, 12),
      Paint()..color = accent,
    );
  }

  @override
  bool shouldRepaint(_TrackPainter old) =>
      old.t != t || old.accent != accent || old.dark != dark;
}

class SegOption<T> {
  const SegOption(this.value, this.label);

  final T value;
  final String label;
}

/// Segmented command selector.
class MechaSegmented<T> extends StatelessWidget {
  const MechaSegmented({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
    this.accent,
    this.compact = false,
  });

  final List<SegOption<T>> options;
  final T value;
  final ValueChanged<T> onChanged;
  final Color? accent;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color tint = accent ?? c.cobalt;
    final Color onTint = c.isDark ? const Color(0xFF04101F) : Colors.white;
    return ClipPath(
      clipper: const ChamferClipper(cut: 8),
      child: Container(
        height: compact ? 34 : 40,
        decoration: BoxDecoration(
          color: c.inset,
          border: Border.all(color: c.line, width: 1.1),
        ),
        child: Row(
          children: options.map((SegOption<T> option) {
            final bool selected = option.value == value;
            return Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  if (selected) return;
                  Haptics.tap();
                  onChanged(option.value);
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  curve: Curves.easeOutCubic,
                  margin: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    color: selected ? tint : Colors.transparent,
                  ),
                  child: Center(
                    child: Text(
                      option.label.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: T.label(
                        selected ? onTint : c.inkSoft,
                        size: compact ? 9 : 10,
                        tracking: 1.3,
                      ),
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

/// Row: label + description + switch.
class MechaToggleRow extends StatelessWidget {
  const MechaToggleRow({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.hint,
    this.code,
    this.accent,
  });

  final String label;
  final bool value;
  final ValueChanged<bool>? onChanged;
  final String? hint;
  final String? code;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    if (code != null) ...<Widget>[
                      Text(code!, style: T.metric(c.inkFaint, size: 9)),
                      const SizedBox(width: 6),
                    ],
                    Flexible(
                      child: Text(
                        label.toUpperCase(),
                        style: T.label(c.ink, size: 10, tracking: 1.4),
                      ),
                    ),
                  ],
                ),
                if (hint != null) ...<Widget>[
                  const SizedBox(height: 3),
                  Text(hint!, style: T.body(c.inkFaint, size: 10.5)),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          MechaSwitch(value: value, onChanged: onChanged, accent: accent),
        ],
      ),
    );
  }
}

/// Tag chip.
class MechaChip extends StatelessWidget {
  const MechaChip({
    super.key,
    required this.label,
    this.color,
    this.filled = false,
    this.icon,
  });

  final String label;
  final Color? color;
  final bool filled;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color tint = color ?? c.inkSoft;
    return ClipPath(
      clipper: const ChamferClipper(cut: 5),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3.5),
        decoration: BoxDecoration(
          color: filled ? tint : c.panelAlt,
          border: Border.all(color: filled ? tint : c.line),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (icon != null) ...<Widget>[
              Icon(icon, size: 9, color: filled ? c.panel : tint),
              const SizedBox(width: 4),
            ],
            Text(
              label.toUpperCase(),
              style: T.label(
                filled ? c.panel : tint,
                size: 8.5,
                tracking: 1.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Recessed readout well.
class MechaReadout extends StatelessWidget {
  const MechaReadout({
    super.key,
    required this.label,
    required this.value,
    this.tone,
    this.align = CrossAxisAlignment.start,
  });

  final String label;
  final String value;
  final Color? tone;
  final CrossAxisAlignment align;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return ClipPath(
      clipper: const ChamferClipper(cut: 6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
        decoration: BoxDecoration(
          color: c.inset,
          border: Border.all(color: c.line),
        ),
        child: Column(
          crossAxisAlignment: align,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(
              label.toUpperCase(),
              style: T.label(c.inkFaint, size: 8, tracking: 1.3),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: T.metric(tone ?? c.ink, size: 12.5),
            ),
          ],
        ),
      ),
    );
  }
}

/// Hairline divider with a centre diamond.
class MechaDivider extends StatelessWidget {
  const MechaDivider({super.key, this.color, this.gap = 12});

  final Color? color;
  final double gap;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color line = color ?? c.line;
    return Padding(
      padding: EdgeInsets.symmetric(vertical: gap),
      child: Row(
        children: <Widget>[
          Expanded(child: Container(height: 1, color: line)),
          const SizedBox(width: 8),
          Transform.rotate(
            angle: 0.785398,
            child: Container(width: 5, height: 5, color: line),
          ),
          const SizedBox(width: 8),
          Expanded(child: Container(height: 1, color: line)),
        ],
      ),
    );
  }
}

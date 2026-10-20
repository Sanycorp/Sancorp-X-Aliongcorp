import 'package:flutter/material.dart';

import '../core/palette.dart';
import '../core/typography.dart';
import '../core/haptics.dart';

/// A hard-edged armor plate: chamfered corners, hairlines, corner brackets.
class MechaPanel extends StatelessWidget {
  const MechaPanel({
    super.key,
    required this.child,
    this.title,
    this.code,
    this.trailing,
    this.accent,
    this.padding = const EdgeInsets.fromLTRB(14, 12, 14, 14),
    this.cut = 12,
    this.showHeader = true,
    this.flat = false,
    this.margin = const EdgeInsets.only(bottom: 12),
    this.onHeaderTap,
  });

  final Widget child;
  final String? title;
  final String? code;
  final Widget? trailing;
  final Color? accent;
  final EdgeInsets padding;
  final double cut;
  final bool showHeader;
  final bool flat;
  final EdgeInsets margin;
  final VoidCallback? onHeaderTap;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color tint = accent ?? c.cobalt;
    final bool header = showHeader && title != null;

    return Container(
      margin: margin,
      decoration: BoxDecoration(
        boxShadow: flat
            ? null
            : <BoxShadow>[
                BoxShadow(
                  color: c.ink.withAlpha(c.isDark ? 110 : 24),
                  blurRadius: 20,
                  offset: const Offset(0, 9),
                ),
              ],
      ),
      child: ClipPath(
        clipper: ChamferClipper(cut: cut),
        child: CustomPaint(
          foregroundPainter: _PlatePainter(
            colors: c,
            cut: cut,
            accent: tint,
            header: header,
          ),
          child: Container(
            color: c.panel,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                if (header) _buildHeader(c, tint),
                Padding(padding: padding, child: child),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(MechaColors c, Color tint) {
    final Widget header = Container(
      padding: const EdgeInsets.fromLTRB(13, 10, 12, 10),
      decoration: BoxDecoration(
        color: c.panelAlt,
        border: Border(bottom: BorderSide(color: c.line)),
      ),
      child: Row(
        children: <Widget>[
          Container(width: 3, height: 13, color: tint),
          const SizedBox(width: 8),
          if (code != null) ...<Widget>[
            Text(code!, style: T.metric(c.inkFaint, size: 9.5)),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              (title ?? '').toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: T.label(c.ink, size: 11, tracking: 1.7),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
    if (onHeaderTap == null) return header;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onHeaderTap,
      child: header,
    );
  }
}

class _PlatePainter extends CustomPainter {
  _PlatePainter({
    required this.colors,
    required this.cut,
    required this.accent,
    required this.header,
  });

  final MechaColors colors;
  final double cut;
  final Color accent;
  final bool header;

  @override
  void paint(Canvas canvas, Size size) {
    final Rect inner = Rect.fromLTWH(0.75, 0.75, size.width - 1.5, size.height - 1.5);
    final Path plate = chamferPath(inner.size, cut, Corners.all).shift(inner.topLeft);

    canvas.drawPath(
      plate,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.3
        ..color = colors.lineStrong,
    );

    // Corner brackets (top-left + bottom-right only — mecha language).
    final Paint bracket = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.square
      ..color = accent.withAlpha(190);

    const double b = 13;
    canvas.drawLine(const Offset(0.75, 0.75), const Offset(b, 0.75), bracket);
    canvas.drawLine(const Offset(0.75, 0.75), const Offset(0.75, b), bracket);
    canvas.drawLine(
      Offset(size.width - 0.75, size.height - 0.75),
      Offset(size.width - b, size.height - 0.75),
      bracket,
    );
    canvas.drawLine(
      Offset(size.width - 0.75, size.height - 0.75),
      Offset(size.width - 0.75, size.height - b),
      bracket,
    );

    // Header accent rail.
    if (header) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, size.width * 0.42, 2.4),
          const Radius.circular(0),
        ),
        Paint()..color = accent,
      );
    }

    // Rivets.
    final Paint rivet = Paint()..color = colors.lineStrong.withAlpha(150);
    canvas.drawRect(Rect.fromLTWH(9, 8, 2, 2), rivet);
    canvas.drawRect(Rect.fromLTWH(size.width - 11, 8, 2, 2), rivet);
  }

  @override
  bool shouldRepaint(_PlatePainter old) =>
      old.colors != colors ||
      old.cut != cut ||
      old.accent != accent ||
      old.header != header;
}

/// Small status strip used inside plates.
class PanelStrip extends StatelessWidget {
  const PanelStrip({
    super.key,
    required this.label,
    required this.value,
    this.tone,
    this.icon,
  });

  final String label;
  final String value;
  final Color? tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color tint = tone ?? c.ink;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        if (icon != null) ...<Widget>[
          Icon(icon, size: 12, color: tint),
          const SizedBox(width: 5),
        ],
        Text(label.toUpperCase(), style: T.label(c.inkFaint, size: 9, tracking: 1.4)),
        const SizedBox(width: 6),
        Text(value, style: T.metric(tint, size: 11)),
      ],
    );
  }
}


/// Collapsible rack module with a live status readout in the header.
class MechaRack extends StatefulWidget {
  const MechaRack({
    super.key,
    required this.title,
    required this.code,
    required this.child,
    this.initiallyOpen = false,
    this.accent,
    this.status,
  });

  final String title;
  final String code;
  final Widget child;
  final bool initiallyOpen;
  final Color? accent;
  final String? status;

  @override
  State<MechaRack> createState() => _MechaRackState();
}

class _MechaRackState extends State<MechaRack> {
  late bool _open = widget.initiallyOpen;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color tint = widget.accent ?? c.cobalt;
    return MechaPanel(
      title: widget.title,
      code: widget.code,
      accent: tint,
      onHeaderTap: () {
        Haptics.tap();
        setState(() => _open = !_open);
      },
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (widget.status != null)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Text(
                widget.status!,
                style: T.metric(_open ? tint : c.inkFaint, size: 8.5),
              ),
            ),
          AnimatedRotation(
            turns: _open ? 0.5 : 0,
            duration: const Duration(milliseconds: 220),
            child: Icon(
              Icons.expand_more,
              size: 18,
              color: _open ? tint : c.inkFaint,
            ),
          ),
        ],
      ),
      padding: EdgeInsets.fromLTRB(14, _open ? 12 : 0, 14, _open ? 12 : 0),
      child: AnimatedSize(
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeInOutCubic,
        alignment: Alignment.topCenter,
        child: _open
            ? widget.child
            : const SizedBox(width: double.infinity, height: 0),
      ),
    );
  }
}

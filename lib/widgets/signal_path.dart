import 'package:flutter/material.dart';

import '../core/palette.dart';
import '../core/typography.dart';

class SignalNode {
  const SignalNode({
    required this.code,
    required this.label,
    required this.active,
    this.detail,
    this.tone,
  });

  final String code;
  final String label;
  final bool active;
  final String? detail;
  final Color? tone;
}

/// The live signal chain, drawn as a vertical telemetry rail with a packet
/// travelling through the active nodes.
class SignalPath extends StatefulWidget {
  const SignalPath({super.key, required this.nodes, this.animate = true});

  final List<SignalNode> nodes;
  final bool animate;

  @override
  State<SignalPath> createState() => _SignalPathState();
}

class _SignalPathState extends State<SignalPath>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  );

  @override
  void initState() {
    super.initState();
    if (widget.animate) _c.repeat();
  }

  @override
  void didUpdateWidget(SignalPath oldWidget) {
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
    const double rowHeight = 34;
    final double total = widget.nodes.length * rowHeight;

    return LayoutBuilder(
      builder: (BuildContext ctx, BoxConstraints box) {
        return SizedBox(
          height: total,
          child: Stack(
            children: <Widget>[
              Positioned(
                left: 12,
                top: 8,
                bottom: 8,
                width: 1.4,
                child: Container(color: c.line),
              ),
              if (widget.animate)
                AnimatedBuilder(
                  animation: _c,
                  builder: (BuildContext context, Widget? child) {
                    final double y = 8 + (total - 16) * _c.value;
                    return Positioned(
                      left: 8,
                      top: y,
                      child: Container(
                        width: 9,
                        height: 9,
                        decoration: BoxDecoration(
                          color: c.amber,
                          boxShadow: <BoxShadow>[
                            BoxShadow(
                              color: c.amber.withAlpha(150),
                              blurRadius: 8,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              Column(
                children: widget.nodes.map((SignalNode node) {
                  final Color tint = node.tone ?? c.cobalt;
                  return SizedBox(
                    height: rowHeight,
                    child: Row(
                      children: <Widget>[
                        SizedBox(
                          width: 25,
                          child: Center(
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 220),
                              width: 11,
                              height: 11,
                              decoration: BoxDecoration(
                                color: node.active ? tint : c.panel,
                                border: Border.all(
                                  color: node.active ? tint : c.lineStrong,
                                  width: 1.4,
                                ),
                                boxShadow: node.active
                                    ? <BoxShadow>[
                                        BoxShadow(
                                          color: tint.withAlpha(90),
                                          blurRadius: 7,
                                        ),
                                      ]
                                    : null,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          node.code,
                          style: T.metric(
                            node.active ? c.inkFaint : c.inkFaint.withAlpha(120),
                            size: 9,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            node.label.toUpperCase(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: T.label(
                              node.active ? c.ink : c.inkFaint,
                              size: 9.5,
                              tracking: 1.3,
                            ),
                          ),
                        ),
                        if (node.detail != null)
                          Text(
                            node.detail!,
                            style: T.metric(
                              node.active ? tint : c.inkFaint,
                              size: 9.5,
                            ),
                          ),
                        const SizedBox(width: 4),
                        Text(
                          node.active ? 'ON' : 'OFF',
                          style: T.label(
                            node.active ? tint : c.inkFaint,
                            size: 8,
                            tracking: 1,
                          ),
                        ),
                        const SizedBox(width: 2),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
        );
      },
    );
  }
}

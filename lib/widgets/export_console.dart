import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../audio/audio_engine.dart';
import '../core/format.dart';
import '../core/palette.dart';
import '../core/typography.dart';
import 'mecha_button.dart';
import 'mecha_controls.dart';
import 'mecha_meter.dart';
import 'mecha_panel.dart';
import '../core/haptics.dart';

class ExportState {
  const ExportState({
    this.progress = 0,
    this.stage = 'ANALYSE',
    this.report,
    this.error,
    this.cancelled = false,
    this.savedLabel,
    this.sharePath,
    this.mime,
    this.bytes = 0,
  });

  final double progress;
  final String stage;
  final RenderReport? report;
  final String? error;
  final bool cancelled;
  final String? savedLabel;
  final String? sharePath;
  final String? mime;
  final int bytes;

  bool get success => report != null && error == null && !cancelled;
  bool get done => report != null || error != null || cancelled;
}

/// Live render console: staged progress, telemetry and the final manifest.
class ExportConsole extends StatelessWidget {
  const ExportConsole({
    super.key,
    required this.state,
    required this.onCancel,
    required this.onClose,
    required this.onShare,
  });

  final ValueListenable<ExportState> state;
  final VoidCallback onCancel;
  final VoidCallback onClose;
  final VoidCallback onShare;

  static const List<String> _stages = <String>[
    'ANALYSE',
    'RENDER',
    'MASTER',
    'WRITE',
  ];

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 26),
      child: ValueListenableBuilder<ExportState>(
        valueListenable: state,
        builder: (BuildContext context, ExportState st, Widget? _) {
          final MechaColors c = MechaScope.of(context);
          final Color tint = st.error != null
              ? c.crimson
              : (st.cancelled ? c.amber : c.cobalt);
          return MechaPanel(
            title: st.done
                ? (st.success ? 'EXPORT COMPLETE' : 'EXPORT ABORTED')
                : 'EXPORT CONSOLE',
            code: 'FORGE',
            accent: tint,
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Text(
                      st.done ? (st.success ? 'MANIFEST' : 'STATUS') : 'ENGINE',
                      style: T.label(c.inkFaint, size: 8.5),
                    ),
                    const Spacer(),
                    Text(
                      '${(st.progress * 100).round().toString().padLeft(3, '0')}%',
                      style: T.metric(tint, size: 20),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SegmentedMeter(
                  level: st.progress,
                  segments: 30,
                  height: 12,
                  color: tint,
                ),
                const SizedBox(height: 12),
                Row(
                  children: _stages.map((String s) {
                    final bool active = st.stage == s;
                    final bool passed =
                        _stages.indexOf(s) < _stages.indexOf(st.stage);
                    return Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Container(
                            height: 2,
                            color: active
                                ? tint
                                : (passed ? tint.withAlpha(110) : c.line),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            s,
                            style: T.label(
                              active ? tint : c.inkFaint,
                              size: 7.5,
                              tracking: 1.1,
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
                if (!st.done) ...<Widget>[
                  const SizedBox(height: 18),
                  Text(
                    'Working offline on this device. Keep the app open.',
                    style: T.body(c.inkSoft, size: 11.5),
                  ),
                  const SizedBox(height: 14),
                  MechaButton(
                    label: 'Cancel render',
                    icon: Icons.close,
                    tone: MechaTone.ghost,
                    small: true,
                    expand: true,
                    onPressed: onCancel,
                  ),
                ],
                if (st.success) ...<Widget>[
                  const SizedBox(height: 18),
                  _Manifest(st: st, onShare: onShare),
                ],
                if (st.error != null) ...<Widget>[
                  const SizedBox(height: 16),
                  Container(
                    constraints: const BoxConstraints(maxHeight: 170),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: c.inset,
                      border: Border.all(color: c.line),
                    ),
                    child: SingleChildScrollView(
                      child: Text(
                        st.error!,
                        style: T.metric(c.crimson, size: 9.5),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: MechaButton(
                          label: 'Copy log',
                          icon: Icons.copy_all,
                          tone: MechaTone.ghost,
                          small: true,
                          onPressed: () {
                            Clipboard.setData(
                              ClipboardData(text: st.error ?? ''),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: MechaButton(
                          label: 'Close',
                          tone: MechaTone.ink,
                          small: true,
                          onPressed: onClose,
                        ),
                      ),
                    ],
                  ),
                ],
                if (st.cancelled) ...<Widget>[
                  const SizedBox(height: 16),
                  Text(
                    'Render cancelled — no file was written.',
                    style: T.body(c.amber, size: 12),
                  ),
                  const SizedBox(height: 12),
                  MechaButton(
                    label: 'Close',
                    tone: MechaTone.ghost,
                    small: true,
                    expand: true,
                    onPressed: onClose,
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Manifest extends StatelessWidget {
  const _Manifest({required this.st, required this.onShare});

  final ExportState st;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final RenderReport report = st.report!;
    final String name = st.savedLabel ?? report.path.split('/').last;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text('OUTPUT', style: T.label(c.inkFaint, size: 8.5)),
        const SizedBox(height: 4),
        SelectableText(
          name,
          style: T.metric(c.ink, size: 12),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: <Widget>[
            MechaReadout(
              label: 'Duration',
              value: fmtTime(report.duration, tenths: true),
            ),
            MechaReadout(
              label: 'Size',
              value: fmtBytes(st.bytes),
            ),
            MechaReadout(
              label: 'Loudness',
              value: report.lufs == null ? '—' : fmtLufs(report.lufs!),
              tone: c.cobalt,
            ),
            MechaReadout(
              label: 'Peak',
              value: report.truePeak == null
                  ? '—'
                  : '${report.truePeak!.toStringAsFixed(1)} dB',
            ),
            MechaReadout(
              label: 'Trim',
              value: fmtDb(report.trimDb),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: <Widget>[
            MechaChip(
              label: 'sha ${report.hash}',
              icon: Icons.fingerprint,
              color: c.signal,
            ),
            const SizedBox(width: 8),
            const MechaChip(label: '48k stereo', color: null),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: <Widget>[
            if (st.sharePath != null) ...<Widget>[
              Expanded(
                child: MechaButton(
                  label: 'Share',
                  icon: Icons.ios_share,
                  small: true,
                  sweep: true,
                  onPressed: () {
                    Haptics.medium();
                    onShare();
                  },
                ),
              ),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: MechaButton(
                label: 'Done',
                tone: MechaTone.ink,
                small: true,
                onPressed: () {
                  Navigator.of(context).pop();
                },
              ),
            ),
          ],
        ),
      ],
    );
  }
}

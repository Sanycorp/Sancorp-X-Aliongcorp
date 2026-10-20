import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app/app_state.dart';
import '../core/format.dart';
import '../core/palette.dart';
import '../core/typography.dart';
import '../models/edit_settings.dart';
import '../models/preset.dart';
import '../state/forge_controller.dart';
import '../state/forge_scope.dart';
import '../widgets/export_console.dart';
import '../widgets/mecha_button.dart';
import '../widgets/mecha_controls.dart';
import '../widgets/mecha_knob.dart';
import '../widgets/mecha_panel.dart';
import '../widgets/reveal.dart';
import '../widgets/waveform.dart';
import '../core/haptics.dart';

class DeckScreen extends StatefulWidget {
  const DeckScreen({super.key});

  @override
  State<DeckScreen> createState() => _DeckScreenState();
}

class _DeckScreenState extends State<DeckScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final AppState app = AppScope.of(context);
    final ForgeController forge = ForgeScope.of(context);
    return AnimatedBuilder(
      animation: Listenable.merge(<Listenable>[app, forge]),
      builder: (BuildContext context, Widget? _) {
        final MechaColors c = MechaScope.of(context);
        final EditSettings e = app.edit;
        return CustomScrollView(
          physics: const BouncingScrollPhysics(),
          slivers: <Widget>[
            SliverToBoxAdapter(child: _DeckHeader(app: app)),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
              sliver: SliverList(
                delegate: SliverChildListDelegate(<Widget>[
                  Reveal(
                    enabled: !app.settings.reduceMotion,
                    delay: Duration(milliseconds: 40),
                    child: _SourceBay(app: app, forge: forge, edit: e),
                  ),
                  const SizedBox(height: 14),
                  Reveal(
                    enabled: !app.settings.reduceMotion,
                    delay: Duration(milliseconds: 130),
                    child: _PresetRail(app: app, forge: forge),
                  ),
                  const SizedBox(height: 14),
                  Reveal(
                    enabled: !app.settings.reduceMotion,
                    delay: Duration(milliseconds: 210),
                    child: _MasterBay(app: app, forge: forge, edit: e),
                  ),
                  const SizedBox(height: 14),
                  Reveal(
                    enabled: !app.settings.reduceMotion,
                    delay: Duration(milliseconds: 280),
                    child: _ChainStrip(edit: e),
                  ),
                  if (e.hasSource) ...<Widget>[
                    const SizedBox(height: 14),
                    Reveal(
                      enabled: !app.settings.reduceMotion,
                      delay: Duration(milliseconds: 330),
                      child: _ForgeBar(app: app, forge: forge, edit: e),
                    ),
                  ],
                ]),
              ),
            ),
          ],
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

class _DeckHeader extends StatelessWidget {
  const _DeckHeader({required this.app});

  final AppState app;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      child: Column(
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: <Widget>[
              _Emblem(c: c),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'EL TZY',
                      style: T.hero(28, c.ink).copyWith(letterSpacing: 1.5),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: <Widget>[
                        Text(
                          'AEGIS-M',
                          style: T.label(c.cobalt, size: 9, tracking: 2.4),
                        ),
                        const SizedBox(width: 6),
                        Container(width: 14, height: 1, color: c.line),
                        const SizedBox(width: 6),
                        Text(
                          'AUDIO FORGE',
                          style: T.label(c.inkFaint, size: 9, tracking: 2.4),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              _IconPad(
                icon: app.settings.darkFinish
                    ? Icons.light_mode_outlined
                    : Icons.dark_mode_outlined,
                onTap: () {
                  Haptics.tap();
                  app.toggleFinish();
                },
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(height: 1, color: c.line),
          const SizedBox(height: 10),
          Row(
            children: <Widget>[
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(color: c.signal, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
              Text(
                'ENGINE READY',
                style: T.metric(c.signal, size: 8.5),
              ),
              const SizedBox(width: 12),
              Text('OFFLINE', style: T.metric(c.inkFaint, size: 8.5)),
              const SizedBox(width: 12),
              Text('48 kHz / 24-bit', style: T.metric(c.inkFaint, size: 8.5)),
              const Spacer(),
              Text('v7.0.0', style: T.metric(c.inkFaint, size: 8.5)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Emblem extends StatelessWidget {
  const _Emblem({required this.c});

  final MechaColors c;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 46,
      height: 46,
      child: Stack(
        alignment: Alignment.center,
        children: <Widget>[
          CustomPaint(
            size: const Size(46, 46),
            painter: _EmblemPainter(c),
          ),
          Text(
            'ET',
            style: T.hero(17, c.ink).copyWith(letterSpacing: 1),
          ),
        ],
      ),
    );
  }
}

class _EmblemPainter extends CustomPainter {
  _EmblemPainter(this.c);

  final MechaColors c;

  @override
  void paint(Canvas canvas, Size size) {
    final Rect r = Offset.zero & size;
    final Path p = chamferPath(r.size, 11, Corners.all);
    canvas.drawPath(p, Paint()..color = c.panelAlt);
    canvas.drawPath(
      p,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..color = c.ink,
    );
    canvas.drawRect(
      Rect.fromLTWH(size.width - 13, 4, 8, 8),
      Paint()..color = c.crimson,
    );
    canvas.drawRect(
      Rect.fromLTWH(4, size.height - 11, 12, 3),
      Paint()..color = c.cobalt,
    );
  }

  @override
  bool shouldRepaint(_EmblemPainter old) => old.c != c;
}

class _IconPad extends StatelessWidget {
  const _IconPad({required this.icon, required this.onTap, this.tint});

  final IconData icon;
  final VoidCallback onTap;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final Color color = tint ?? c.inkSoft;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 38,
        height: 38,
        margin: const EdgeInsets.only(left: 8),
        decoration: BoxDecoration(
          color: c.inset,
          border: Border.all(color: c.line),
        ),
        child: Icon(icon, size: 18, color: color),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Source bay
// ---------------------------------------------------------------------------

class _SourceBay extends StatelessWidget {
  const _SourceBay({
    required this.app,
    required this.forge,
    required this.edit,
  });

  final AppState app;
  final ForgeController forge;
  final EditSettings edit;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return MechaPanel(
      title: 'SOURCE BAY',
      code: 'IN/01',
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
      trailing: edit.hasSource
          ? MechaChip(
              label: fmtRate(edit.sampleRate),
              icon: Icons.graphic_eq,
              color: c.cobalt,
            )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (!edit.hasSource)
            _DropZone(loading: forge.loadingSource, onTap: forge.pickSource)
          else
            _LoadedSource(app: app, forge: forge, edit: edit),
          if (forge.sourceError != null) ...<Widget>[
            const SizedBox(height: 10),
            Text(
              forge.sourceError!,
              style: T.body(c.crimson, size: 11),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

class _DropZone extends StatelessWidget {
  const _DropZone({required this.loading, required this.onTap});

  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return GestureDetector(
      onTap: loading ? null : onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 18),
        decoration: BoxDecoration(
          color: c.inset,
          border: Border.all(color: c.line),
        ),
        child: Column(
          children: <Widget>[
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                border: Border.all(color: c.cobalt.withAlpha(120)),
                color: c.cobalt.withAlpha(c.isDark ? 26 : 12),
              ),
              child: loading
                  ? Padding(
                      padding: const EdgeInsets.all(15),
                      child: CircularProgressIndicator(
                        strokeWidth: 1.8,
                        valueColor: AlwaysStoppedAnimation<Color>(c.cobalt),
                      ),
                    )
                  : Icon(Icons.add, size: 24, color: c.cobalt),
            ),
            const SizedBox(height: 12),
            Text(
              loading ? 'READING SOURCE…' : 'LOAD A TRACK',
              style: T.title(15, c.ink),
            ),
            const SizedBox(height: 4),
            Text(
              'MP3 · WAV · FLAC · M4A · OGG · OPUS',
              style: T.metric(c.inkFaint, size: 9),
            ),
            const SizedBox(height: 12),
            Text(
              'Pilih lagu dari penyimpanan. Semua proses 100% offline di HP.',
              textAlign: TextAlign.center,
              style: T.body(c.inkSoft, size: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadedSource extends StatelessWidget {
  const _LoadedSource({
    required this.app,
    required this.forge,
    required this.edit,
  });

  final AppState app;
  final ForgeController forge;
  final EditSettings edit;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final bool playing = forge.playing;
    final bool busy = forge.previewBusy;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              width: 32,
              height: 32,
              margin: const EdgeInsets.only(right: 10, top: 2),
              decoration: BoxDecoration(
                color: c.cobalt,
                shape: BoxShape.circle,
              ),
              child: Icon(
                playing ? Icons.pause : Icons.play_arrow,
                size: 19,
                color: c.isDark ? const Color(0xFF02101F) : Colors.white,
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    edit.fileName ?? 'SOURCE',
                    style: T.title(14, c.ink),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '${fmtTime(edit.durationSec)} · ${fmtRate(edit.sampleRate)}',
                    style: T.metric(c.inkFaint, size: 9),
                  ),
                ],
              ),
            ),
            GestureDetector(
              onTap: () {
                Haptics.medium();
                forge.eject();
              },
              child: Padding(
                padding: const EdgeInsets.all(6),
                child: Icon(Icons.close, size: 17, color: c.inkFaint),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        WaveformTimeline(
          peaks: forge.peaks,
          duration: edit.durationSec,
          trimStart: edit.trimStart,
          trimEnd: edit.trimEnd,
          playhead: forge.playhead,
          loading: !forge.waveformReady,
          enabled: edit.durationSec > 0,
          onSeek: forge.seek,
          onTrimChanged: forge.trimChanged,
        ),
        const SizedBox(height: 10),
        Row(
          children: <Widget>[
            _TinyStat(
              label: 'IN',
              value: fmtTime(edit.trimStart, tenths: true),
            ),
            _TinyStat(
              label: 'OUT',
              value: fmtTime(edit.effectiveEnd, tenths: true),
            ),
            _TinyStat(
              label: 'LENGTH',
              value: fmtTime(edit.sourceWindow),
            ),
            const Spacer(),
            Text(
              busy
                  ? 'RENDERING AUDITION…'
                  : (forge.previewDirty
                      ? 'AUDITION STALE'
                      : 'AUDITION ARMED'),
              style: T.metric(
                busy ? c.amber : (forge.previewDirty ? c.amber : c.signal),
                size: 8,
              ),
            ),
          ],
        ),
        if (forge.previewError != null) ...<Widget>[
          const SizedBox(height: 8),
          Text(
            forge.previewError!,
            style: T.metric(c.crimson, size: 9),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ],
    );
  }
}

class _TinyStat extends StatelessWidget {
  const _TinyStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return Padding(
      padding: const EdgeInsets.only(right: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label, style: T.label(c.inkFaint, size: 7.5, tracking: 1.6)),
          const SizedBox(height: 3),
          Text(value, style: T.metric(c.ink, size: 11)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

class _PresetRail extends StatefulWidget {
  const _PresetRail({required this.app, required this.forge});

  final AppState app;
  final ForgeController forge;

  @override
  State<_PresetRail> createState() => _PresetRailState();
}

class _PresetRailState extends State<_PresetRail> {
  final ScrollController _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Color _accent(MechaColors c, PresetAccent a) {
    switch (a) {
      case PresetAccent.cobalt:
        return c.cobalt;
      case PresetAccent.crimson:
        return c.crimson;
      case PresetAccent.amber:
        return c.amber;
      case PresetAccent.signal:
        return c.signal;
      case PresetAccent.ink:
        return c.ink;
    }
  }

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final String? active = widget.app.edit.activePreset;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: 8, right: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              Text('SIGNATURE PRESETS', style: T.label(c.ink, size: 9.5)),
              const SizedBox(width: 8),
              Text(
                '${Preset.all.length.toString().padLeft(2, '0')} RACKED',
                style: T.metric(c.inkFaint, size: 8),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  Haptics.tap();
                  widget.app.updateEdit((EditSettings s) {
                    s.resetNeutral(keepSource: true);
                  });
                  widget.forge.markDirty();
                },
                child: Text(
                  'RESET',
                  style: T.label(c.crimson, size: 8.5, tracking: 1.4),
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 108,
          child: ListView.separated(
            controller: _scroll,
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(vertical: 2),
            itemCount: Preset.all.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (BuildContext context, int i) {
              final Preset p = Preset.all[i];
              final bool on = active == p.name;
              return _PresetCard(
                preset: p,
                accent: _accent(c, p.accent),
                index: i + 1,
                selected: on,
                onTap: () {
                  Haptics.medium();
                  widget.forge.applyPreset(p);
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _PresetCard extends StatelessWidget {
  const _PresetCard({
    required this.preset,
    required this.accent,
    required this.index,
    required this.selected,
    required this.onTap,
  });

  final Preset preset;
  final Color accent;
  final int index;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        width: 148,
        padding: const EdgeInsets.fromLTRB(11, 9, 11, 10),
        decoration: BoxDecoration(
          color: selected
              ? accent.withAlpha(c.isDark ? 34 : 14)
              : c.panelAlt,
          border: Border.all(
            color: selected ? accent : c.line,
            width: selected ? 1.4 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Text(
                  index.toString().padLeft(2, '0'),
                  style: T.metric(selected ? accent : c.inkFaint, size: 8),
                ),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                  color: accent.withAlpha(selected ? 40 : 24),
                  child: Text(
                    preset.tag.label,
                    style: T.metric(accent, size: 6.5),
                  ),
                ),
              ],
            ),
            const Spacer(),
            Text(
              preset.name,
              style: T.title(12.5, c.ink).copyWith(height: 1.15),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              preset.tagline,
              style: T.body(c.inkSoft, size: 9.5, height: 1.2),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 6),
            Container(width: 22, height: 2, color: accent),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Master bay
// ---------------------------------------------------------------------------

class _MasterBay extends StatelessWidget {
  const _MasterBay({
    required this.app,
    required this.forge,
    required this.edit,
  });

  final AppState app;
  final ForgeController forge;
  final EditSettings edit;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return MechaPanel(
      title: 'MASTER BAY',
      code: 'OUT/02',
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
      trailing: Text(
        edit.format.label,
        style: T.metric(c.cobalt, size: 9),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              MechaKnob(
                label: 'Speed',
                value: edit.speed,
                min: 0.5,
                max: 1.5,
                defaultValue: 1.0,
                formatter: (double v) => fmtSpeed(v),
                code: '@TIME',
                onChanged: (double v) {
                  app.updateEdit((EditSettings s) => s.speed = v);
                  forge.markDirty();
                },
              ),
              MechaKnob(
                label: 'Gain',
                value: edit.finalGain,
                min: 0.5,
                max: 1.8,
                defaultValue: 1.0,
                formatter: (double v) => fmtDb(20 * math.log(v) / math.ln10),
                code: '@TRIM',
                accent: c.amber,
                onChanged: (double v) {
                  app.updateEdit((EditSettings s) => s.finalGain = v);
                  forge.markDirty();
                },
              ),
              MechaKnob(
                label: 'Space',
                value: edit.reverbEnabled ? edit.reverbLevel : 0,
                min: 0,
                max: 1,
                defaultValue: 0,
                formatter: (double v) => '${(v * 100).round()}%',
                code: edit.reverbType.label,
                accent: c.crimson,
                onChanged: (double v) {
                  app.updateEdit((EditSettings s) {
                    s.reverbEnabled = v > 0.01;
                    s.reverbLevel = v < 0.01 ? 0.4 : v;
                  });
                  forge.markDirty();
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'SPEED mengubah tempo & pitch. SPACE membuka ruang reverb. '
            'GAIN adalah trim akhir sebelum limiter.',
            style: T.body(c.inkSoft, size: 10.5),
          ),
          const SizedBox(height: 14),
          Row(
            children: <Widget>[
              Expanded(
                child: _MiniReadout(
                  label: 'DURATION',
                  value: fmtTime(
                    edit.hasSource ? edit.processedDuration : 0,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MiniReadout(
                  label: 'TARGET',
                  value: edit.target.label,
                  tone: c.cobalt,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MiniReadout(
                  label: 'RATE',
                  value: edit.format.spec,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniReadout extends StatelessWidget {
  const _MiniReadout({required this.label, required this.value, this.tone});

  final String label;
  final String value;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
      decoration: BoxDecoration(
        color: c.inset,
        border: Border.all(color: c.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label, style: T.label(c.inkFaint, size: 7)),
          const SizedBox(height: 4),
          Text(
            value,
            style: T.metric(tone ?? c.ink, size: 10.5),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Chain strip
// ---------------------------------------------------------------------------

class _ChainStrip extends StatelessWidget {
  const _ChainStrip({required this.edit});

  final EditSettings edit;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final List<_ChainNode> nodes = <_ChainNode>[
      _ChainNode('SRC', edit.hasSource),
      _ChainNode('TIME', edit.speed != 1.0 || edit.fadeIn > 0 || edit.fadeOut > 0),
      _ChainNode('SPACE', edit.reverbEnabled || edit.spatial8d),
      _ChainNode(
        'TONE',
        edit.bass != 0 ||
            edit.sub != 0 ||
            edit.clarity != 0 ||
            edit.presence != 0 ||
            edit.air != 0 ||
            edit.lowpass != 0,
      ),
      _ChainNode('REPAIR', edit.denoise || edit.deEsser || edit.voiceMode),
      _ChainNode('MASTER', true),
    ];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: c.panel,
        border: Border.all(color: c.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('SIGNAL CHAIN', style: T.label(c.inkFaint, size: 7.5)),
          const SizedBox(height: 9),
          Row(
            children: <Widget>[
              for (int i = 0; i < nodes.length; i++) ...<Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          Container(
                            width: 5,
                            height: 5,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: nodes[i].active ? c.signal : c.lineStrong,
                            ),
                          ),
                          const SizedBox(width: 5),
                          Flexible(
                            child: Text(
                              nodes[i].code,
                              style: T.metric(
                                nodes[i].active ? c.ink : c.inkFaint,
                                size: 8,
                              ),
                              overflow: TextOverflow.clip,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Container(
                        height: 2,
                        color: nodes[i].active ? c.cobalt : c.line,
                      ),
                    ],
                  ),
                ),
                if (i < nodes.length - 1) const SizedBox(width: 6),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _ChainNode {
  const _ChainNode(this.code, this.active);

  final String code;
  final bool active;
}

// ---------------------------------------------------------------------------
// Forge action bar
// ---------------------------------------------------------------------------

class _ForgeBar extends StatelessWidget {
  const _ForgeBar({
    required this.app,
    required this.forge,
    required this.edit,
  });

  final AppState app;
  final ForgeController forge;
  final EditSettings edit;

  Future<void> _run(BuildContext context) async {
    Haptics.heavy();
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext ctx) => ExportConsole(
        state: forge.exportState,
        onCancel: forge.cancelForge,
        onClose: () => Navigator.of(ctx).pop(),
        onShare: () {
          final ExportState st = forge.exportState.value;
          if (st.sharePath != null) {
            forge.share(st.sharePath!, st.mime);
          }
        },
      ),
    );
    final ExportState result = await forge.forge();
    if (result.success && context.mounted) {
      Haptics.medium();
    }
  }

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final bool ready = edit.hasSource;
    return Column(
      children: <Widget>[
        Row(
          children: <Widget>[
            Expanded(
              flex: 2,
              child: MechaButton(
                label: 'PREVIEW',
                icon: forge.previewBusy ? null : Icons.play_arrow,
                tone: MechaTone.ghost,
                busy: forge.previewBusy,
                small: true,
                onPressed: forge.previewBusy || !ready
                    ? null
                    : () {
                        Haptics.tap();
                        forge.togglePlay();
                      },
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 3,
              child: MechaButton(
                label: 'FORGE EXPORT',
                code: edit.format.label,
                icon: Icons.bolt,
                sweep: true,
                onPressed: ready ? () => _run(context) : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: <Widget>[
            _SlotChip(
              label: 'A',
              filled: app.slotA != null,
              onTap: () {
                Haptics.tap();
                if (app.slotA != null) {
                  forge.recall('A');
                } else {
                  forge.store('A');
                }
              },
              onLong: () => forge.store('A'),
            ),
            const SizedBox(width: 8),
            _SlotChip(
              label: 'B',
              filled: app.slotB != null,
              onTap: () {
                Haptics.tap();
                if (app.slotB != null) {
                  forge.recall('B');
                } else {
                  forge.store('B');
                }
              },
              onLong: () => forge.store('B'),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Tap A/B untuk recall · tahan untuk simpan snapshot.',
                style: T.body(c.inkFaint, size: 9.5),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _SlotChip extends StatelessWidget {
  const _SlotChip({
    required this.label,
    required this.filled,
    required this.onTap,
    required this.onLong,
  });

  final String label;
  final bool filled;
  final VoidCallback onTap;
  final VoidCallback onLong;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return GestureDetector(
      onTap: onTap,
      onLongPress: onLong,
      child: Container(
        width: 40,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: filled ? c.cobalt.withAlpha(c.isDark ? 40 : 14) : c.inset,
          border: Border.all(color: filled ? c.cobalt : c.line),
        ),
        child: Text(
          label,
          style: T.title(13, filled ? c.cobalt : c.inkFaint),
        ),
      ),
    );
  }
}

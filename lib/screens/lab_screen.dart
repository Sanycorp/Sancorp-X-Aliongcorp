import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app/app_state.dart';
import '../core/format.dart';
import '../core/palette.dart';
import '../core/typography.dart';
import '../models/edit_settings.dart';
import '../state/forge_scope.dart';
import '../widgets/mecha_controls.dart';
import '../widgets/mecha_panel.dart';
import '../widgets/signal_path.dart';
import '../core/haptics.dart';

class LabScreen extends StatelessWidget {
  const LabScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppState app = AppScope.of(context);
    final MechaColors c = MechaScope.of(context);
    final EditSettings e = app.edit;
    final int active = _activeModules(e);

    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: <Widget>[
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: <Widget>[
                    Text('LABORATORY', style: T.hero(24, c.ink)),
                    const SizedBox(width: 10),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Text(
                        'SIGNAL BAY',
                        style: T.label(c.cobalt, size: 8.5, tracking: 2),
                      ),
                    ),
                    const Spacer(),
                    MechaChip(
                      label: '$active ACTIVE',
                      color: active > 0 ? c.cobalt : c.inkFaint,
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Semua modul berjalan offline. Perubahan langsung menandai '
                  'audition agar di-render ulang sebelum ekspor.',
                  style: T.body(c.inkSoft, size: 11),
                ),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 28),
          sliver: SliverList(
            delegate: SliverChildListDelegate(<Widget>[
              _TimeRack(app: app, e: e),
              _SpaceRack(app: app, e: e),
              _ToneRack(app: app, e: e),
              _CharacterRack(app: app, e: e),
              _RepairRack(app: app, e: e),
              _OutputRack(app: app, e: e),
              const SizedBox(height: 6),
              MechaPanel(
                title: 'SIGNAL TELEMETRY',
                code: 'CHAIN',
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: SignalPath(
                  animate: !app.settings.reduceMotion,
                  nodes: <SignalNode>[
                    SignalNode(
                      code: 'SRC',
                      label: e.fileName ?? 'NO SOURCE',
                      active: e.hasSource,
                      detail: e.hasSource
                          ? '${fmtRate(e.sampleRate)} · ${fmtTime(e.durationSec)}'
                          : '—',
                    ),
                    SignalNode(
                      code: 'TIME',
                      label: 'Speed ${fmtSpeed(e.speed)}',
                      active: e.speed != 1.0,
                      detail: '${e.speedMode.label} · fade ${e.fadeIn.toStringAsFixed(1)}s',
                    ),
                    SignalNode(
                      code: 'SPACE',
                      label: e.reverbEnabled
                          ? e.reverbType.label
                          : (e.spatial8d ? '8D ORBIT' : 'DRY'),
                      active: e.reverbEnabled || e.spatial8d,
                      detail: e.spatial8d
                          ? '${e.spinRate.toStringAsFixed(2)} Hz · depth ${fmtPercent(e.depth)}'
                          : 'reverb ${fmtPercent(e.reverbLevel)}',
                    ),
                    SignalNode(
                      code: 'TONE',
                      label: 'Spectral shaping',
                      active: e.bass != 0 ||
                          e.sub != 0 ||
                          e.clarity != 0 ||
                          e.presence != 0 ||
                          e.air != 0 ||
                          e.lowpass != 0,
                      detail: 'bass ${fmtPercent(e.bass)} · air ${fmtPercent(e.air)}',
                    ),
                    SignalNode(
                      code: 'REPAIR',
                      label: e.voiceMode
                          ? 'VOICE ISOLATION'
                          : (e.denoise ? 'DENOISE' : 'CLEAN'),
                      active: e.denoise || e.voiceMode || e.deEsser,
                      detail: e.voiceMode ? 'neural · vocals only' : 'spectral',
                      tone: e.voiceMode ? c.amber : null,
                    ),
                    SignalNode(
                      code: 'MASTER',
                      label: e.target.label,
                      active: true,
                      detail:
                          '${e.format.label} · ${e.format.spec} · limiter −1 dB',
                    ),
                  ],
                ),
              ),
            ]),
          ),
        ),
      ],
    );
  }

  static int _activeModules(EditSettings e) {
    int n = 0;
    if (e.speed != 1.0) n++;
    if (e.fadeIn > 0 || e.fadeOut > 0) n++;
    if (e.reverbEnabled) n++;
    if (e.spatial8d) n++;
    if (e.bass != 0 || e.sub != 0) n++;
    if (e.clarity != 0 || e.presence != 0 || e.air != 0) n++;
    if (e.lowpass != 0) n++;
    if (e.warmth != 0) n++;
    if (e.deEsser) n++;
    if (e.monoBass) n++;
    if (e.oversample) n++;
    if (e.denoise) n++;
    if (e.voiceMode) n++;
    if (e.normalizeInput) n++;
    return n;
  }
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

class _Hint extends StatelessWidget {
  const _Hint(this.text, {this.tone});

  final String text;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 2,
            height: 26,
            margin: const EdgeInsets.only(right: 8, top: 1),
            color: (tone ?? c.cobalt).withAlpha(140),
          ),
          Expanded(
            child: Text(
              text,
              style: T.body(tone ?? c.inkSoft, size: 10.5, height: 1.3),
            ),
          ),
        ],
      ),
    );
  }
}

class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.text, {this.tone});

  final String text;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 10),
      child: Row(
        children: <Widget>[
          Text(
            text,
            style: T.label(tone ?? c.inkFaint, size: 8, tracking: 1.8),
          ),
          const SizedBox(width: 8),
          Expanded(child: Container(height: 1, color: c.line)),
        ],
      ),
    );
  }
}

/// Wraps every edit so the audition is invalidated consistently.
EditSettings _mutate(AppState app, void Function(EditSettings s) change) {
  app.updateEdit(change);
  return app.edit;
}

void _touch(BuildContext context) {
  ForgeScope.of(context).markDirty();
}

// ---------------------------------------------------------------------------
// TIME
// ---------------------------------------------------------------------------

class _TimeRack extends StatelessWidget {
  const _TimeRack({required this.app, required this.e});

  final AppState app;
  final EditSettings e;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final double dur = e.durationSec > 0 ? e.durationSec : 1;
    final double end = e.trimEnd <= 0.05 ? dur : e.trimEnd;
    final bool source = e.hasSource;
    return MechaRack(
      title: 'TIME',
      code: 'M1',
      status: '${fmtSpeed(e.speed)} · ${fmtTime(end - e.trimStart)}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Hint(
            'Potong bagian yang dipakai, atur fade, lalu pilih karakter speed. '
            'RETRO menurunkan pitch seperti tape; MODERN menjaga nada vokal.',
            tone: source ? null : c.amber,
          ),
          if (!source)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Muat sumber dulu di DECK untuk mengaktifkan trim.',
                style: T.metric(c.amber, size: 9),
              ),
            ),
          MechaSlider(
            label: 'START',
            value: e.trimStart,
            min: 0,
            max: dur,
            code: 'IN',
            formatter: (double v) => fmtTime(v, tenths: true),
            defaultValue: 0,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) {
                s.trimStart = v.clamp(0.0, math.max(0.0, end - 0.2)).toDouble();
                if (s.trimEnd > 0 && s.trimStart >= s.trimEnd) {
                  s.trimEnd = math.min(dur, s.trimStart + 0.2);
                }
              });
              _touch(context);
            },
          ),
          MechaSlider(
            label: 'END',
            value: end,
            min: 0,
            max: dur,
            code: 'OUT',
            formatter: (double v) => fmtTime(v, tenths: true),
            defaultValue: dur,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) {
                final double clamped =
                    v.clamp(math.min(dur, s.trimStart + 0.2), dur).toDouble();
                s.trimEnd = clamped >= dur - 0.05 ? 0 : clamped;
              });
              _touch(context);
            },
          ),
          const _GroupLabel('FADES'),
          MechaSlider(
            label: 'FADE IN',
            value: e.fadeIn,
            min: 0,
            max: 8,
            code: 'AF',
            formatter: (double v) => '${v.toStringAsFixed(1)} s',
            defaultValue: 0,
            accent: c.amber,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) => s.fadeIn = v);
              _touch(context);
            },
          ),
          MechaSlider(
            label: 'FADE OUT',
            value: e.fadeOut,
            min: 0,
            max: 8,
            code: 'BF',
            formatter: (double v) => '${v.toStringAsFixed(1)} s',
            defaultValue: 0,
            accent: c.amber,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) => s.fadeOut = v);
              _touch(context);
            },
          ),
          const _GroupLabel('SPEED'),
          MechaSlider(
            label: 'RATE',
            value: e.speed,
            min: 0.5,
            max: 1.5,
            code: 'VAR',
            formatter: fmtSpeed,
            defaultValue: 1.0,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) => s.speed = v);
              _touch(context);
            },
          ),
          Text(
            'MODE',
            style: T.label(c.inkFaint, size: 8, tracking: 1.6),
          ),
          const SizedBox(height: 8),
          MechaSegmented<SpeedMode>(
            value: e.speedMode,
            options: const <SegOption<SpeedMode>>[
              SegOption<SpeedMode>(SpeedMode.retro, 'RETRO'),
              SegOption<SpeedMode>(SpeedMode.modern, 'MODERN'),
            ],
            onChanged: (SpeedMode v) {
              Haptics.tap();
              _mutate(app, (EditSettings s) => s.speedMode = v);
              _touch(context);
            },
          ),
          const SizedBox(height: 8),
          Text(
            e.speedMode.hint,
            style: T.body(c.inkSoft, size: 10.5, height: 1.3),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// SPACE
// ---------------------------------------------------------------------------

class _SpaceRack extends StatelessWidget {
  const _SpaceRack({required this.app, required this.e});

  final AppState app;
  final EditSettings e;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return MechaRack(
      title: 'SPACE',
      code: 'M2',
      accent: c.crimson,
      status: e.reverbEnabled
          ? '${e.reverbType.label} ${fmtPercent(e.reverbLevel)}'
          : (e.spatial8d ? '8D ${e.spinRate.toStringAsFixed(2)}Hz' : 'DRY'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Hint(
            'Reverb dibuat dari delay berlapis (bukan IR) supaya ringan di HP. '
            '8D memutar posisi stereo secara perlahan.',
            tone: c.crimson,
          ),
          MechaToggleRow(
            label: 'REVERB ENGINE',
            value: e.reverbEnabled,
            code: 'RVB',
            accent: c.crimson,
            hint: 'Hall untuk lagu lambat, plate untuk vokal, cathedral untuk ambient.',
            onChanged: (bool v) {
              _mutate(app, (EditSettings s) => s.reverbEnabled = v);
              _touch(context);
            },
          ),
          if (e.reverbEnabled) ...<Widget>[
            MechaSegmented<ReverbType>(
              value: e.reverbType,
              accent: c.crimson,
              compact: true,
              options: const <SegOption<ReverbType>>[
                SegOption<ReverbType>(ReverbType.hall, 'HALL'),
                SegOption<ReverbType>(ReverbType.plate, 'PLATE'),
                SegOption<ReverbType>(ReverbType.chamber, 'CHAMBER'),
                SegOption<ReverbType>(ReverbType.cathedral, 'CATHEDRAL'),
              ],
              onChanged: (ReverbType v) {
                Haptics.tap();
                _mutate(app, (EditSettings s) => s.reverbType = v);
                _touch(context);
              },
            ),
            const SizedBox(height: 14),
            MechaSlider(
              label: 'LEVEL',
              value: e.reverbLevel,
              min: 0,
              max: 1,
              code: 'WET',
              formatter: fmtPercent,
              defaultValue: 0.4,
              accent: c.crimson,
              onChanged: (double v) {
                _mutate(app, (EditSettings s) => s.reverbLevel = v);
                _touch(context);
              },
            ),
            MechaSlider(
              label: 'ROOM',
              value: e.reverbRoom,
              min: 0,
              max: 1,
              code: 'SIZE',
              formatter: fmtPercent,
              defaultValue: 0.5,
              accent: c.crimson,
              onChanged: (double v) {
                _mutate(app, (EditSettings s) => s.reverbRoom = v);
                _touch(context);
              },
            ),
            MechaSlider(
              label: 'DAMP',
              value: e.reverbDamp,
              min: 0,
              max: 1,
              code: 'HF',
              formatter: fmtPercent,
              defaultValue: 0.3,
              accent: c.crimson,
              onChanged: (double v) {
                _mutate(app, (EditSettings s) => s.reverbDamp = v);
                _touch(context);
              },
            ),
          ],
          const _GroupLabel('8D ORBIT'),
          MechaToggleRow(
            label: 'SPATIAL ORBIT',
            value: e.spatial8d,
            code: '8D',
            accent: c.cobalt,
            hint: 'Rotasi stereo halus — paling enak di headphone.',
            onChanged: (bool v) {
              _mutate(app, (EditSettings s) => s.spatial8d = v);
              _touch(context);
            },
          ),
          if (e.spatial8d) ...<Widget>[
            MechaSlider(
              label: 'SPIN RATE',
              value: e.spinRate,
              min: 0.02,
              max: 0.6,
              code: 'HZ',
              formatter: (double v) => '${v.toStringAsFixed(2)} Hz',
              defaultValue: 0.125,
              onChanged: (double v) {
                _mutate(app, (EditSettings s) => s.spinRate = v);
                _touch(context);
              },
            ),
            MechaSlider(
              label: 'DEPTH',
              value: e.depth,
              min: 0,
              max: 1,
              code: 'AMT',
              formatter: fmtPercent,
              defaultValue: 0.6,
              onChanged: (double v) {
                _mutate(app, (EditSettings s) => s.depth = v);
                _touch(context);
              },
            ),
            MechaSlider(
              label: 'WIDTH',
              value: e.width,
              min: 0,
              max: 1,
              code: 'ST',
              formatter: fmtPercent,
              defaultValue: 0.5,
              onChanged: (double v) {
                _mutate(app, (EditSettings s) => s.width = v);
                _touch(context);
              },
            ),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// TONE
// ---------------------------------------------------------------------------

class _ToneRack extends StatelessWidget {
  const _ToneRack({required this.app, required this.e});

  final AppState app;
  final EditSettings e;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final int hz = (80 + e.bassFreq * 120).round();
    return MechaRack(
      title: 'TONE',
      code: 'M3',
      accent: c.amber,
      status: 'B${fmtPercent(e.bass)} · A${fmtPercent(e.air)}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Hint(
            'Semua angka 0% = netral. Bass dan sub menambah berat; clarity, '
            'presence, air mengangkat detail tanpa mengorbankan headroom.',
            tone: c.amber,
          ),
          const _GroupLabel('LOW END'),
          MechaSlider(
            label: 'BASS',
            value: e.bass,
            min: 0,
            max: 1,
            code: 'LF',
            formatter: fmtPercent,
            defaultValue: 0,
            accent: c.amber,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) => s.bass = v);
              _touch(context);
            },
          ),
          MechaSlider(
            label: 'BASS FREQ',
            value: e.bassFreq,
            min: 0,
            max: 1,
            code: '$hz Hz',
            formatter: fmtPercent,
            defaultValue: 0.5,
            accent: c.amber,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) => s.bassFreq = v);
              _touch(context);
            },
          ),
          MechaSlider(
            label: 'SUB',
            value: e.sub,
            min: 0,
            max: 1,
            code: '55 Hz',
            formatter: fmtPercent,
            defaultValue: 0,
            accent: c.amber,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) => s.sub = v);
              _touch(context);
            },
          ),
          const _GroupLabel('PRESENCE'),
          MechaSlider(
            label: 'CLARITY',
            value: e.clarity,
            min: 0,
            max: 1,
            code: '680 Hz',
            formatter: fmtPercent,
            defaultValue: 0,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) => s.clarity = v);
              _touch(context);
            },
          ),
          MechaSlider(
            label: 'PRESENCE',
            value: e.presence,
            min: 0,
            max: 1,
            code: '2.8 kHz',
            formatter: fmtPercent,
            defaultValue: 0,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) => s.presence = v);
              _touch(context);
            },
          ),
          MechaSlider(
            label: 'AIR',
            value: e.air,
            min: 0,
            max: 1,
            code: '8 kHz',
            formatter: fmtPercent,
            defaultValue: 0,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) => s.air = v);
              _touch(context);
            },
          ),
          MechaSlider(
            label: 'LOW PASS',
            value: e.lowpass,
            min: 0,
            max: 1,
            code: e.lowpass == 0
                ? 'BYPASS'
                : '${(20000 * math.pow(100, -e.lowpass) / 1000).round()} kHz',
            formatter: fmtPercent,
            defaultValue: 0,
            accent: c.crimson,
            hint: 'Menutup treble untuk tekstur tape / lo-fi.',
            onChanged: (double v) {
              _mutate(app, (EditSettings s) => s.lowpass = v);
              _touch(context);
            },
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// CHARACTER
// ---------------------------------------------------------------------------

class _CharacterRack extends StatelessWidget {
  const _CharacterRack({required this.app, required this.e});

  final AppState app;
  final EditSettings e;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return MechaRack(
      title: 'CHARACTER',
      code: 'M4',
      accent: c.cobalt,
      status: e.warmth > 0 ? 'WARM ${fmtPercent(e.warmth)}' : 'NEUTRAL',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Hint(
            'Saturasi halus, de-esser untuk vokal sibilant, mono bass agar '
            'rendah tetap padat, dan oversampling 96 kHz untuk kualitas.',
            tone: c.cobalt,
          ),
          MechaSlider(
            label: 'WARMTH',
            value: e.warmth,
            min: 0,
            max: 1,
            code: 'SAT',
            formatter: fmtPercent,
            defaultValue: 0,
            onChanged: (double v) {
              _mutate(app, (EditSettings s) => s.warmth = v);
              _touch(context);
            },
          ),
          const _GroupLabel('PROCESSORS'),
          MechaToggleRow(
            label: 'DE-ESSER',
            value: e.deEsser,
            code: 'DS',
            hint: 'Meredam desis "s" pada vokal.',
            onChanged: (bool v) {
              _mutate(app, (EditSettings s) => s.deEsser = v);
              _touch(context);
            },
          ),
          MechaToggleRow(
            label: 'MONO BASS',
            value: e.monoBass,
            code: 'MB',
            hint: 'Frekuensi < 120 Hz dipusatkan ke tengah.',
            onChanged: (bool v) {
              _mutate(app, (EditSettings s) => s.monoBass = v);
              _touch(context);
            },
          ),
          MechaToggleRow(
            label: 'OVERSAMPLE 96k',
            value: e.oversample,
            code: 'OS',
            hint: 'Proses di 96 kHz lalu turun ke 48 kHz dengan soxr.',
            onChanged: (bool v) {
              _mutate(app, (EditSettings s) => s.oversample = v);
              _touch(context);
            },
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// REPAIR
// ---------------------------------------------------------------------------

class _RepairRack extends StatelessWidget {
  const _RepairRack({required this.app, required this.e});

  final AppState app;
  final EditSettings e;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return MechaRack(
      title: 'REPAIR',
      code: 'M5',
      accent: c.signal,
      status: e.voiceMode
          ? 'NEURAL'
          : (e.denoise ? 'DENOISE ${fmtPercent(e.denoiseAmount)}' : 'BYPASS'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Hint(
            'Untuk rekaman berisik atau vokal. Mode neural memakai model '
            'RNNoise — hanya nyalakan untuk sumber vokal, bukan musik.',
            tone: e.voiceMode ? c.amber : c.signal,
          ),
          MechaToggleRow(
            label: 'SPECTRAL DENOISE',
            value: e.denoise,
            code: 'NR',
            accent: c.signal,
            hint: 'FFT noise reduction, aman untuk musik.',
            onChanged: (bool v) {
              _mutate(app, (EditSettings s) => s.denoise = v);
              _touch(context);
            },
          ),
          if (e.denoise)
            MechaSlider(
              label: 'AMOUNT',
              value: e.denoiseAmount,
              min: 0,
              max: 1,
              code: 'NR',
              formatter: fmtPercent,
              defaultValue: 0.5,
              accent: c.signal,
              onChanged: (double v) {
                _mutate(app, (EditSettings s) => s.denoiseAmount = v);
                _touch(context);
              },
            ),
          MechaToggleRow(
            label: 'VOICE ISOLATION',
            value: e.voiceMode,
            code: 'RNN',
            accent: c.amber,
            hint: 'Neural RNNoise: bersihkan napas & noise. Jangan untuk musik.',
            onChanged: (bool v) {
              _mutate(app, (EditSettings s) => s.voiceMode = v);
              _touch(context);
            },
          ),
          if (e.voiceMode)
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: c.amber.withAlpha(c.isDark ? 30 : 18),
                border: Border.all(color: c.amber.withAlpha(120)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Icon(Icons.warning_amber_rounded, size: 15, color: c.amber),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Mode vokal aktif. Untuk lagu musik, matikan — '
                      'instrumen bisa teredam drastis.',
                      style: T.body(c.inkSoft, size: 10.5, height: 1.3),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// OUTPUT
// ---------------------------------------------------------------------------

class _OutputRack extends StatelessWidget {
  const _OutputRack({required this.app, required this.e});

  final AppState app;
  final EditSettings e;

  static const List<int> _rates = <int>[128, 192, 256, 320];

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return MechaRack(
      title: 'OUTPUT',
      code: 'M6',
      accent: c.ink,
      status: '${e.format.label} · ${e.format.spec}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Hint(
            'WAV/FLAC untuk master, MP3/M4A untuk share cepat. '
            'Loudness target mengikuti standar streaming −14 LUFS.',
            tone: c.inkSoft,
          ),
          const _GroupLabel('FORMAT'),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: OutputFormat.values.map((OutputFormat f) {
              final bool on = e.format == f;
              return GestureDetector(
                onTap: () {
                  Haptics.tap();
                  _mutate(app, (EditSettings s) {
                    s.format = f;
                    if (!f.lossy) s.bitrate = 0;
                  });
                  _touch(context);
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
                  decoration: BoxDecoration(
                    color: on ? c.cobalt.withAlpha(c.isDark ? 45 : 16) : c.inset,
                    border: Border.all(color: on ? c.cobalt : c.line),
                  ),
                  child: Text(
                    f.label,
                    style: T.metric(on ? c.cobalt : c.inkSoft, size: 9.5),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 14),
          if (e.format.lossy) ...<Widget>[
            Text(
              'BITRATE',
              style: T.label(c.inkFaint, size: 8, tracking: 1.6),
            ),
            const SizedBox(height: 8),
            MechaSegmented<int>(
              value: _rates.contains(e.bitrate) ? e.bitrate : 320,
              compact: true,
              options: _rates
                  .map((int r) => SegOption<int>(r, '$rK'))
                  .toList(growable: false),
              onChanged: (int v) {
                Haptics.tap();
                _mutate(app, (EditSettings s) => s.bitrate = v);
                _touch(context);
              },
            ),
            const SizedBox(height: 14),
          ],
          Text(
            'LOUDNESS TARGET',
            style: T.label(c.inkFaint, size: 8, tracking: 1.6),
          ),
          const SizedBox(height: 8),
          MechaSegmented<LoudnessTarget>(
            value: e.target,
            compact: true,
            options: LoudnessTarget.values
                .map((LoudnessTarget t) =>
                    SegOption<LoudnessTarget>(t, t.label))
                .toList(growable: false),
            onChanged: (LoudnessTarget v) {
              Haptics.tap();
              _mutate(app, (EditSettings s) => s.target = v);
              _touch(context);
            },
          ),
          const SizedBox(height: 12),
          MechaToggleRow(
            label: 'NORMALIZE INPUT',
            value: e.normalizeInput,
            code: 'NORM',
            hint: 'Angkat sumber pelan ke −0.5 dBFS sebelum diproses.',
            onChanged: (bool v) {
              _mutate(app, (EditSettings s) => s.normalizeInput = v);
              _touch(context);
            },
          ),
          MechaToggleRow(
            label: 'TURBO ANALYSIS',
            value: e.turbo,
            code: 'TURBO',
            hint: 'Analisis loudness di 12 kHz — 4× lebih cepat, akurasi ±0.3 dB.',
            onChanged: (bool v) {
              _mutate(app, (EditSettings s) => s.turbo = v);
              _touch(context);
            },
          ),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: c.inset,
              border: Border.all(color: c.line),
            ),
            child: Row(
              children: <Widget>[
                Icon(Icons.verified_user_outlined, size: 14, color: c.signal),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Semua file ditulis 48 kHz stereo dengan limiter '
                    'true-peak −1 dBFS dan sidik jari SHA-256 di metadata.',
                    style: T.body(c.inkSoft, size: 10, height: 1.3),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

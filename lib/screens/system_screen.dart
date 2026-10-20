import 'package:flutter/material.dart';

import '../app/app_state.dart';
import '../core/palette.dart';
import '../core/typography.dart';
import '../models/app_settings.dart';
import '../models/edit_settings.dart';
import '../models/preset.dart';
import '../services/storage_service.dart';
import '../widgets/mecha_controls.dart';
import '../widgets/mecha_panel.dart';
import '../core/haptics.dart';

class SystemScreen extends StatelessWidget {
  const SystemScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppState app = AppScope.of(context);
    final MechaColors c = MechaScope.of(context);
    final AppSettings s = app.settings;

    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: <Widget>[
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                Text('SYSTEM', style: T.hero(24, c.ink)),
                const SizedBox(width: 10),
                Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(
                    'CORE CONFIG',
                    style: T.label(c.cobalt, size: 8.5, tracking: 2),
                  ),
                ),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 30),
          sliver: SliverList(
            delegate: SliverChildListDelegate(<Widget>[
              MechaPanel(
                title: 'APPEARANCE',
                code: 'CFG/01',
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                trailing: Text(
                  s.darkFinish ? 'COCKPIT' : 'ARMOR',
                  style: T.metric(c.cobalt, size: 9),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'FINISH',
                      style: T.label(c.inkFaint, size: 8, tracking: 1.6),
                    ),
                    const SizedBox(height: 8),
                    MechaSegmented<bool>(
                      value: s.darkFinish,
                      compact: true,
                      options: const <SegOption<bool>>[
                        SegOption<bool>(false, 'ARMOR WHITE'),
                        SegOption<bool>(true, 'COCKPIT BLACK'),
                      ],
                      onChanged: (bool v) {
                        Haptics.tap();
                        app.updateSettings((AppSettings st) {
                          st.darkFinish = v;
                        });
                      },
                    ),
                    const SizedBox(height: 14),
                    MechaToggleRow(
                      label: 'REDUCE MOTION',
                      value: s.reduceMotion,
                      code: 'MOT',
                      hint: 'Matikan animasi latar & boot untuk hemat baterai.',
                      onChanged: (bool v) {
                        app.updateSettings((AppSettings st) {
                          st.reduceMotion = v;
                        });
                      },
                    ),
                    MechaToggleRow(
                      label: 'HAPTIC FEEDBACK',
                      value: s.haptics,
                      code: 'HAP',
                      hint: 'Getaran halus saat menekan kontrol.',
                      onChanged: (bool v) {
                        app.updateSettings((AppSettings st) {
                          st.haptics = v;
                        });
                      },
                    ),
                  ],
                ),
              ),
              MechaPanel(
                title: 'AUDIO ENGINE',
                code: 'CFG/02',
                accent: c.crimson,
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                trailing: Text('FFMPEG 8', style: T.metric(c.crimson, size: 9)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'DEFAULT FORMAT',
                      style: T.label(c.inkFaint, size: 8, tracking: 1.6),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: OutputFormat.values.map((OutputFormat f) {
                        final bool on = s.format == f;
                        return GestureDetector(
                          onTap: () {
                            Haptics.tap();
                            app.updateSettings((AppSettings st) {
                              st.format = f;
                              if (!f.lossy) st.bitrate = 0;
                            });
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 7,
                            ),
                            decoration: BoxDecoration(
                              color: on
                                  ? c.crimson.withAlpha(c.isDark ? 40 : 14)
                                  : c.inset,
                              border: Border.all(
                                color: on ? c.crimson : c.line,
                              ),
                            ),
                            child: Text(
                              f.label,
                              style: T.metric(
                                on ? c.crimson : c.inkSoft,
                                size: 9.5,
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'DEFAULT LOUDNESS',
                      style: T.label(c.inkFaint, size: 8, tracking: 1.6),
                    ),
                    const SizedBox(height: 8),
                    MechaSegmented<LoudnessTarget>(
                      value: s.target,
                      compact: true,
                      accent: c.crimson,
                      options: LoudnessTarget.values
                          .map((LoudnessTarget t) =>
                              SegOption<LoudnessTarget>(t, t.label))
                          .toList(growable: false),
                      onChanged: (LoudnessTarget v) {
                        Haptics.tap();
                        app.updateSettings((AppSettings st) {
                          st.target = v;
                        });
                        app.updateEdit((EditSettings ed) => ed.target = v);
                      },
                    ),
                    const SizedBox(height: 8),
                    MechaToggleRow(
                      label: 'TURBO ANALYSIS',
                      value: s.turbo,
                      code: 'TURBO',
                      accent: c.crimson,
                      hint: 'Analisis cepat 12 kHz; akurasi ±0.3 dB.',
                      onChanged: (bool v) {
                        app.updateSettings((AppSettings st) {
                          st.turbo = v;
                        });
                        app.updateEdit((EditSettings ed) => ed.turbo = v);
                      },
                    ),
                  ],
                ),
              ),
              MechaPanel(
                title: 'STORAGE',
                code: 'CFG/03',
                accent: c.signal,
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                trailing: Text(
                  s.saveDest.label,
                  style: T.metric(c.signal, size: 9),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'SAVE DESTINATION',
                      style: T.label(c.inkFaint, size: 8, tracking: 1.6),
                    ),
                    const SizedBox(height: 8),
                    MechaSegmented<SaveDest>(
                      value: s.saveDest,
                      compact: true,
                      accent: c.signal,
                      options: SaveDest.values
                          .map((SaveDest d) =>
                              SegOption<SaveDest>(d, d.label))
                          .toList(growable: false),
                      onChanged: (SaveDest v) {
                        Haptics.tap();
                        app.updateSettings((AppSettings st) {
                          st.saveDest = v;
                        });
                      },
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: c.inset,
                        border: Border.all(color: c.line),
                      ),
                      child: Row(
                        children: <Widget>[
                          Icon(Icons.folder_outlined, size: 15, color: c.inkFaint),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              s.treeUri == null
                                  ? 'Belum ada folder dipilih'
                                  : (s.treeLabel ?? s.treeUri!),
                              style: T.metric(c.inkSoft, size: 9),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          GestureDetector(
                            onTap: () async {
                              Haptics.tap();
                              final String? uri = await StorageService.pickTree();
                              if (uri == null) return;
                              app.updateSettings((AppSettings st) {
                                st
                                  ..treeUri = uri
                                  ..treeLabel = StorageService.treeLabel(uri)
                                  ..saveDest = SaveDest.custom;
                              });
                            },
                            child: Text(
                              'PICK',
                              style: T.label(c.signal, size: 8.5),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Memilih folder memakai Android Storage Access Framework — '
                      'tanpa izin storage penuh.',
                      style: T.body(c.inkSoft, size: 10),
                    ),
                  ],
                ),
              ),
              MechaPanel(
                title: 'ABOUT',
                code: 'CFG/04',
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                child: Column(
                  children: <Widget>[
                    _InfoRow(label: 'APP', value: 'EL TZY 7.0.0'),
                    _InfoRow(label: 'CODENAME', value: 'AEGIS-M'),
                    _InfoRow(label: 'PRESETS', value: '${Preset.all.length} CURATED'),
                    _InfoRow(label: 'ENGINE', value: 'FFmpeg 8 · soxr · RNNoise'),
                    _InfoRow(label: 'PIPELINE', value: '48 kHz / stereo / TP −1 dBFS'),
                    _InfoRow(label: 'PRIVACY', value: '100% ON-DEVICE'),
                    const SizedBox(height: 10),
                    Row(
                      children: <Widget>[
                        Icon(Icons.bolt, size: 14, color: c.cobalt),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Dibuat untuk produksi offline: tidak ada upload, '
                            'tidak ada akun, tidak ada tracking.',
                            style: T.body(c.inkSoft, size: 10.5),
                          ),
                        ),
                      ],
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
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Row(
        children: <Widget>[
          Text(label, style: T.label(c.inkFaint, size: 8, tracking: 1.6)),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: T.metric(c.ink, size: 9.5),
            ),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';

import '../app/app_state.dart';
import '../core/format.dart';
import '../core/palette.dart';
import '../core/typography.dart';
import '../services/history_service.dart';
import '../services/storage_service.dart';
import '../widgets/mecha_controls.dart';
import '../widgets/mecha_panel.dart';
import '../core/haptics.dart';

class ArchiveScreen extends StatefulWidget {
  const ArchiveScreen({super.key});

  @override
  State<ArchiveScreen> createState() => _ArchiveScreenState();
}

class _ArchiveScreenState extends State<ArchiveScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final AppState app = AppScope.of(context);
    final MechaColors c = MechaScope.of(context);
    final List<ExportRecord> items = app.history;
    final int totalBytes =
        items.fold<int>(0, (int sum, ExportRecord r) => sum + r.bytes);

    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: <Widget>[
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                Text('ARCHIVE', style: T.hero(24, c.ink)),
                const SizedBox(width: 10),
                Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(
                    'FORGE LOG',
                    style: T.label(c.cobalt, size: 8.5, tracking: 2),
                  ),
                ),
                const Spacer(),
                if (items.isNotEmpty)
                  GestureDetector(
                    onTap: () => _confirmClear(context, app),
                    child: Text(
                      'CLEAR',
                      style: T.label(c.crimson, size: 8.5, tracking: 1.4),
                    ),
                  ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: MechaReadout(
                    label: 'RENDERS',
                    value: items.length.toString().padLeft(2, '0'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: MechaReadout(
                    label: 'TOTAL SIZE',
                    value: fmtBytes(totalBytes),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: MechaReadout(
                    label: 'FORMAT',
                    value: items.isEmpty ? '—' : items.first.format,
                    tone: c.cobalt,
                  ),
                ),
              ],
            ),
          ),
        ),
        if (items.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: MechaPanel(
                title: 'NO TRANSMISSIONS YET',
                code: 'LOG/00',
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
                child: Column(
                  children: <Widget>[
                    Icon(Icons.inbox_outlined, size: 40, color: c.inkFaint),
                    const SizedBox(height: 12),
                    Text(
                      'Belum ada hasil ekspor. Buka DECK, muat lagu, lalu tekan '
                      'FORGE EXPORT.',
                      textAlign: TextAlign.center,
                      style: T.body(c.inkSoft, size: 12),
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 30),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (BuildContext context, int i) {
                  final ExportRecord r = items[i];
                  return _RecordTile(
                    record: r,
                    index: i,
                    onShare: () => _share(context, r),
                    onDelete: () => app.removeHistory(r.path),
                  );
                },
                childCount: items.length,
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _share(BuildContext context, ExportRecord record) async {
    final bool local = !record.path.startsWith('saf://');
    if (!local) {
      _toast('File ada di folder pilihan — buka lewat file manager.');
      return;
    }
    if (!await StorageService.exists(record.path)) {
      _toast('File sudah tidak ada di penyimpanan.');
      return;
    }
    Haptics.tap();
    final bool ok = await StorageService.share(record.path, 'audio/*');
    if (!ok) _toast('Share gagal di perangkat ini.');
  }

  void _toast(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        backgroundColor: const Color(0xFF10151D),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  Future<void> _confirmClear(BuildContext context, AppState app) async {
    final bool? yes = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) {
        final MechaColors c = MechaScope.of(ctx);
        return AlertDialog(
          backgroundColor: c.panel,
          title: Text('Clear forge log?', style: T.title(16, c.ink)),
          content: Text(
            'Riwayat ekspor akan dihapus dari daftar. File audio tetap ada.',
            style: T.body(c.inkSoft, size: 12),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text('CANCEL', style: T.label(c.inkFaint, size: 9)),
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text('CLEAR', style: T.label(c.crimson, size: 9)),
            ),
          ],
        );
      },
    );
    if (yes == true) await app.clearHistory();
  }
}

class _RecordTile extends StatelessWidget {
  const _RecordTile({
    required this.record,
    required this.index,
    required this.onShare,
    required this.onDelete,
  });

  final ExportRecord record;
  final int index;
  final VoidCallback onShare;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final MechaColors c = MechaScope.of(context);
    final bool local = !record.path.startsWith('saf://');
    return MechaPanel(
      title: record.name,
      code: '#${(index + 1).toString().padLeft(2, '0')}',
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      trailing: MechaChip(
        label: record.format,
        color: c.cobalt,
        filled: true,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  '${record.preset} · ${fmtTime(record.duration)} · '
                  '${fmtBytes(record.bytes)}',
                  style: T.metric(c.inkSoft, size: 9),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                fmtDate(record.createdAt),
                style: T.metric(c.inkFaint, size: 8.5),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: <Widget>[
              if (record.lufs != null)
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: Text(
                    fmtLufs(record.lufs!),
                    style: T.metric(c.signal, size: 8.5),
                  ),
                ),
              if (record.hash != null)
                Text(
                  'SHA ${record.hash!.toUpperCase()}',
                  style: T.metric(c.inkFaint, size: 8),
                ),
              const Spacer(),
              if (local)
                _TileAction(
                  icon: Icons.ios_share,
                  onTap: onShare,
                  tint: c.cobalt,
                ),
              _TileAction(
                icon: Icons.delete_outline,
                onTap: onDelete,
                tint: c.inkFaint,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TileAction extends StatelessWidget {
  const _TileAction({
    required this.icon,
    required this.onTap,
    required this.tint,
  });

  final IconData icon;
  final VoidCallback onTap;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        Haptics.tap();
        onTap();
      },
      child: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Icon(icon, size: 17, color: tint),
      ),
    );
  }
}

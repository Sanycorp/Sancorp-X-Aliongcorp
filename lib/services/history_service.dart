import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

class ExportRecord {
  const ExportRecord({
    required this.name,
    required this.path,
    required this.format,
    required this.preset,
    required this.duration,
    required this.bytes,
    required this.createdAt,
    this.lufs,
    this.hash,
  });

  final String name;
  final String path;
  final String format;
  final String preset;
  final double duration;
  final int bytes;
  final DateTime createdAt;
  final double? lufs;
  final String? hash;

  Map<String, Object?> toJson() => <String, Object?>{
        'name': name,
        'path': path,
        'format': format,
        'preset': preset,
        'duration': duration,
        'bytes': bytes,
        'at': createdAt.toIso8601String(),
        'lufs': lufs,
        'hash': hash,
      };

  static ExportRecord? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final Map<String, dynamic> json = raw.cast<String, dynamic>();
    final String? path = json['path'] as String?;
    if (path == null || path.isEmpty) return null;
    return ExportRecord(
      name: (json['name'] as String?) ?? 'export',
      path: path,
      format: (json['format'] as String?) ?? 'MP3',
      preset: (json['preset'] as String?) ?? 'CUSTOM',
      duration: (json['duration'] as num?)?.toDouble() ?? 0,
      bytes: (json['bytes'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.tryParse((json['at'] as String?) ?? '') ??
          DateTime.now(),
      lufs: (json['lufs'] as num?)?.toDouble(),
      hash: json['hash'] as String?,
    );
  }
}

class HistoryService {
  const HistoryService._();

  static const int _limit = 60;
  static List<ExportRecord>? _cache;

  static Future<File> _file() async {
    final Directory docs = await getApplicationDocumentsDirectory();
    return File('${docs.path}/aegis_history.json');
  }

  static Future<List<ExportRecord>> load({bool force = false}) async {
    if (_cache != null && !force) return _cache!;
    try {
      final File file = await _file();
      if (!await file.exists()) {
        _cache = <ExportRecord>[];
        return _cache!;
      }
      final Object? decoded = jsonDecode(await file.readAsString());
      final List<ExportRecord> items = <ExportRecord>[];
      if (decoded is List) {
        for (final Object? raw in decoded) {
          final ExportRecord? record = ExportRecord.fromJson(raw);
          if (record != null) items.add(record);
        }
      }
      _cache = items;
      return items;
    } catch (_) {
      _cache = <ExportRecord>[];
      return _cache!;
    }
  }

  static Future<void> _write(List<ExportRecord> items) async {
    _cache = items;
    try {
      final File file = await _file();
      await file.writeAsString(
        jsonEncode(items.map((ExportRecord r) => r.toJson()).toList()),
        flush: true,
      );
    } catch (_) {
      // History is best-effort.
    }
  }

  static Future<List<ExportRecord>> add(ExportRecord record) async {
    final List<ExportRecord> items = await load();
    final List<ExportRecord> next = <ExportRecord>[record]
      ..addAll(items.where((ExportRecord r) => r.path != record.path));
    if (next.length > _limit) next.removeRange(_limit, next.length);
    await _write(next);
    return next;
  }

  static Future<List<ExportRecord>> remove(String path) async {
    final List<ExportRecord> items = await load();
    final List<ExportRecord> next =
        items.where((ExportRecord r) => r.path != path).toList();
    await _write(next);
    return next;
  }

  static Future<void> clear() => _write(<ExportRecord>[]);
}

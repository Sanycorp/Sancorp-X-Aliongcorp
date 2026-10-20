import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../models/app_settings.dart';

class SavedFile {
  const SavedFile({required this.display, this.path});

  final String display;

  /// Real filesystem path when the destination is app-owned.
  final String? path;

  bool get shareable => path != null;
}

/// Save-anywhere layer: app vault, device folder, or any SAF folder.
class StorageService {
  const StorageService._();

  static const MethodChannel _channel =
      MethodChannel('com.eltzy.app/storage');

  static Future<String> defaultDir() async {
    final Directory? external = await getExternalStorageDirectory();
    if (external != null) return external.path;
    final Directory docs = await getApplicationDocumentsDirectory();
    return docs.path;
  }

  static Future<String?> pickTree() async {
    try {
      return await _channel.invokeMethod<String>('pickTree');
    } catch (_) {
      return null;
    }
  }

  static String treeLabel(String? uri) {
    if (uri == null || uri.isEmpty) return 'PICKED FOLDER';
    final String raw = Uri.tryParse(uri)?.path ?? uri;
    final List<String> parts = raw
        .split(':')
        .last
        .split('/')
        .where((String p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'PICKED FOLDER';
    if (parts.length <= 2) return parts.join('/').toUpperCase();
    return '…/${parts.sublist(parts.length - 2).join('/')}'.toUpperCase();
  }

  /// Moves a finished render into the chosen destination.
  static Future<SavedFile> save({
    required String tempPath,
    required String displayName,
    required AppSettings settings,
  }) async {
    final File src = File(tempPath);

    if (settings.saveDest == SaveDest.custom &&
        settings.treeUri != null &&
        settings.treeUri!.isNotEmpty) {
      try {
        final String? uri = await _channel.invokeMethod<String>(
          'copyToTree',
          <String, String>{
            'tree': settings.treeUri!,
            'src': tempPath,
            'name': displayName,
          },
        );
        if (uri != null) {
          await _quietDelete(src);
          return SavedFile(
            display: '${treeLabel(settings.treeUri)}/$displayName',
          );
        }
      } catch (_) {
        // Fall through to the default folder.
      }
    }

    final Directory? target = settings.saveDest == SaveDest.external
        ? await getExternalStorageDirectory()
        : await getApplicationDocumentsDirectory();
    final Directory dir = target ?? await getApplicationDocumentsDirectory();
    final String outPath = '${dir.path}/$displayName';

    try {
      await src.rename(outPath);
    } on FileSystemException {
      await src.copy(outPath);
      await _quietDelete(src);
    }
    return SavedFile(display: outPath, path: outPath);
  }

  static Future<bool> share(String path, String mime) async {
    try {
      final bool? ok = await _channel.invokeMethod<bool>(
        'shareFile',
        <String, String>{'path': path, 'mime': mime},
      );
      return ok ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<int> sizeOf(String path) async {
    try {
      final File f = File(path);
      if (await f.exists()) {
        return (await f.stat()).size;
      }
    } catch (_) {
      // ignore
    }
    return 0;
  }

  static Future<bool> exists(String path) async {
    try {
      return File(path).exists();
    } catch (_) {
      return false;
    }
  }

  static Future<void> _quietDelete(File file) async {
    try {
      if (await file.exists()) await file.delete();
    } catch (_) {
      // ignore
    }
  }
}

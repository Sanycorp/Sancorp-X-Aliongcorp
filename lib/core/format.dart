/// Small formatting helpers shared by the UI.
library;

String _two(int v) => v.toString().padLeft(2, '0');

/// 03:27 or 03:27.4
String fmtTime(double seconds, {bool tenths = false}) {
  if (seconds.isNaN || seconds.isInfinite || seconds < 0) seconds = 0;
  final int total = seconds.floor();
  final int m = total ~/ 60;
  final int s = total % 60;
  final String base = '${_two(m)}:${_two(s)}';
  if (!tenths) return base;
  final int t = ((seconds - total) * 10).floor().clamp(0, 9).toInt();
  return '$base.$t';
}

/// 1.25× style speed label.
String fmtSpeed(double v) => '${v.toStringAsFixed(2)}x';

String fmtBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  if (bytes < 1024 * 1024 * 1024) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
}

String fmtDb(double db) {
  final String sign = db > 0 ? '+' : '';
  return '$sign${db.toStringAsFixed(1)} dB';
}

String fmtLufs(double v) => '${v.toStringAsFixed(1)} LUFS';

String fmtPercent(double v) => '${(v * 100).round()}%';

String fmtRate(int hz) {
  final double k = hz / 1000;
  return '${k.toStringAsFixed(k == k.roundToDouble() ? 0 : 1)} kHz';
}

String fmtDate(DateTime d) {
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(d.day)}.${two(d.month)}.${d.year} ${two(d.hour)}:${two(d.minute)}';
}
